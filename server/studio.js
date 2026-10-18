'use strict';
/**
 * Artist studio: a signed-in user with role "artist" manages their own songs
 * and albums. The user is linked to an artist record (db.artists[].userId);
 * "their" songs are the ones crediting that artist first (or listed in its
 * songIds) — songs they are only featured on stay read-only. Albums are not
 * records of their own: an album is the name shared by the `album` field of one
 * or more songs, so an album can hold a single song. A song saved without an
 * album becomes its own single (album = song title). Songs added together from
 * an album folder also keep the album's cover in `albumCoverUrl`.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { userFromRequest } = require('./auth');
const { appendHistory } = require('./history');
const { splitArtists } = require('./catalog');

const DB_PATH = path.join(__dirname, 'data', 'database.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i;
const MAX_ALBUM_FILES = 61; // 1 album cover + up to 30 songs with their own covers

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8');
}

const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Browsers send UTF-8 names but multer reads them as latin1; keep the raw name if it wasn't UTF-8. */
function originalName(file) {
  const raw = file.originalname || 'file';
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  return utf8.includes('\uFFFD') ? raw : utf8;
}

const isImage = (file) => /^image\//.test(file.mimetype) || IMAGE_EXT.test(originalName(file));
const isAudio = (file) => /^audio\//.test(file.mimetype) || AUDIO_EXT.test(originalName(file));

/** Album folder upload: images go to public/covers, songs to public/audio. */
const albumUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, file, cb) => cb(null, path.join(PUBLIC_DIR, isImage(file) ? 'covers' : 'audio')),
    filename: (_req, file, cb) => {
      const base = path.basename(originalName(file)).replace(/[\\/:*?"<>|]/g, '').trim() || 'file';
      cb(null, `${Date.now()}-${crypto.randomBytes(2).toString('hex')}-${base}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: MAX_ALBUM_FILES },
  fileFilter: (_req, file, cb) => {
    if (isImage(file) || isAudio(file)) cb(null, true);
    else cb(new Error(`${originalName(file)} is not a cover image or song file.`));
  },
});

function removeUploads(files) {
  for (const f of files || []) fs.rm(f.path, { force: true }, () => {});
}

/**
 * Song form: JSON, or multipart with the fields as text plus optional `cover` /
 * `audio` files — sent together on save, so nothing is uploaded for a form the
 * artist cancels. Uploaded files win over coverUrl / audioUrl.
 */
function songForm(req, res, next) {
  albumUpload.fields([{ name: 'cover', maxCount: 1 }, { name: 'audio', maxCount: 1 }])(req, res, (err) => {
    const cover = req.files?.cover?.[0];
    const audio = req.files?.audio?.[0];
    const drop = () => removeUploads([cover, audio].filter(Boolean));
    if (err) {
      drop();
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 25 MB or smaller.' : err.message || 'Upload failed.' });
    }
    if (cover && !isImage(cover)) {
      drop();
      return res.status(400).json({ error: 'The cover must be an image.' });
    }
    if (audio && !isAudio(audio)) {
      drop();
      return res.status(400).json({ error: 'The song must be an audio file.' });
    }
    const body = { ...(req.body || {}) };
    if (typeof body.featured === 'string') {
      try {
        body.featured = JSON.parse(body.featured);
      } catch {
        body.featured = [];
      }
    }
    if (cover) body.coverUrl = `/covers/${cover.filename}`;
    if (audio) body.audioUrl = `/audio/${audio.filename}`;
    req.body = body;
    req.songUploads = [cover, audio].filter(Boolean);
    next();
  });
}

/** Answer an error and drop the files that came with the request. */
function failSong(req, res, code, error) {
  removeUploads(req.songUploads);
  return res.status(code).json({ error });
}

/** Only accounts with the artist role. */
function requireArtist(req, res, next) {
  const found = userFromRequest(req);
  if (!found || !found.user) return res.status(401).json({ error: 'Please log in first.' });
  if ((found.user.role || 'user') !== 'artist') return res.status(403).json({ error: 'Artist account required.' });
  req.user = found.user;
  next();
}

/** The artist record linked to the user (created on first visit, like the admin role change does). */
function artistOf(db, user) {
  db.artists = db.artists || [];
  let artist = db.artists.find((a) => a.userId === user.id);
  if (!artist) {
    artist = {
      id: newId('a'),
      name: user.name || user.email,
      followers: '0',
      gradient: 'from-zinc-700 to-zinc-950',
      emoji: '🎤',
      coverUrl: null,
      songIds: [],
      userId: user.id,
      createdAt: new Date().toISOString(),
    };
    db.artists.unshift(artist);
    writeDb(db);
  }
  return artist;
}

/** The artist's own song: credited first (featured artists can't edit it) or linked by an admin. */
function ownsSong(artist, song) {
  const [main] = splitArtists(song.artist);
  return (artist.songIds || []).includes(song.id) || (!!main && same(main, artist.name));
}

/** Credit line with the artist first, then any featured artists (no duplicates). */
function creditLine(artist, featured) {
  const names = [artist.name];
  for (const n of Array.isArray(featured) ? featured : []) {
    const name = clean(n, 80);
    if (name && !names.some((x) => same(x, name))) names.push(name);
  }
  return names.join(', ').slice(0, 240);
}

/** Uploaded files only (same folders the admin uploads use). */
const fileUrl = (v, folder) => (typeof v === 'string' && v.startsWith(`/${folder}/`) ? v : null);

function createStudioRouter() {
  const router = express.Router();

  // The artist and their songs.
  router.get('/me', requireArtist, (req, res) => {
    const db = readDb();
    const artist = artistOf(db, req.user);
    res.json({ artist, songs: db.songs.filter((s) => ownsSong(artist, s)) });
  });

  router.post('/songs', requireArtist, songForm, (req, res) => {
    const { title, album, duration, featured, coverUrl, audioUrl, explicit } = req.body || {};
    const name = clean(title, 120);
    if (!name) return failSong(req, res, 400, 'Song title is required.');
    const dur = Number(duration);
    if (!Number.isFinite(dur) || dur <= 0) return failSong(req, res, 400, 'Pick a song file so the duration is known.');
    const db = readDb();
    const artist = artistOf(db, req.user);
    const song = {
      id: newId('s'),
      title: name,
      artist: creditLine(artist, featured),
      album: clean(album, 120) || name,
      duration: Math.round(dur),
      gradient: 'from-zinc-700 to-zinc-950',
      emoji: '🎵',
      explicit: explicit === true || explicit === 'true',
      coverUrl: fileUrl(coverUrl, 'covers'),
      audioUrl: fileUrl(audioUrl, 'audio'),
      createdAt: new Date().toISOString(),
    };
    db.songs.unshift(song);
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'song.create', entity: song.id, detail: `${song.title} — ${song.artist}` });
    res.status(201).json(song);
  });

  router.put('/songs/:id', requireArtist, songForm, (req, res) => {
    const db = readDb();
    const artist = artistOf(db, req.user);
    const song = db.songs.find((s) => s.id === req.params.id);
    if (!song || !ownsSong(artist, song)) return failSong(req, res, 404, 'Song not found.');
    const { title, album, duration, featured, coverUrl, audioUrl, explicit } = req.body || {};
    if (title !== undefined) {
      const name = clean(title, 120);
      if (!name) return failSong(req, res, 400, 'Song title is required.');
      song.title = name;
    }
    if (featured !== undefined) song.artist = creditLine(artist, featured);
    if (album !== undefined) {
      const next = clean(album, 120) || song.title;
      if (!same(next, song.album || '')) delete song.albumCoverUrl;
      song.album = next;
    }
    if (duration !== undefined) {
      const dur = Number(duration);
      if (!Number.isFinite(dur) || dur <= 0) return failSong(req, res, 400, 'Duration must be positive.');
      song.duration = Math.round(dur);
    }
    if (coverUrl !== undefined) song.coverUrl = fileUrl(coverUrl, 'covers');
    if (audioUrl !== undefined) song.audioUrl = fileUrl(audioUrl, 'audio');
    if (explicit !== undefined) song.explicit = explicit === true || explicit === 'true';
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'song.update', entity: song.id, detail: `${song.title} — ${song.artist}` });
    res.json(song);
  });

  router.delete('/songs/:id', requireArtist, (req, res) => {
    const db = readDb();
    const artist = artistOf(db, req.user);
    const song = db.songs.find((s) => s.id === req.params.id);
    if (!song || !ownsSong(artist, song)) return res.status(404).json({ error: 'Song not found.' });
    db.songs = db.songs.filter((s) => s.id !== song.id);
    for (const pl of db.playlists) pl.trackIds = (pl.trackIds || []).filter((id) => id !== song.id);
    artist.songIds = (artist.songIds || []).filter((id) => id !== song.id);
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'song.delete', entity: song.id, detail: `${song.title} — ${song.artist}` });
    res.status(204).end();
  });

  /**
   * Create or edit an album: { name, songIds, oldName? }. The picked songs get
   * the album name; songs that were in `oldName` but are no longer picked go
   * back to being singles (album = their own title).
   */
  router.put('/albums', requireArtist, (req, res) => {
    const { name, songIds, oldName } = req.body || {};
    const album = clean(name, 120);
    if (!album) return res.status(400).json({ error: 'Album name is required.' });
    if (!Array.isArray(songIds) || !songIds.length) return res.status(400).json({ error: 'An album needs at least one song.' });
    const db = readDb();
    const artist = artistOf(db, req.user);
    const mine = db.songs.filter((s) => ownsSong(artist, s));
    const picked = new Set(songIds);
    if ([...picked].some((id) => !mine.some((s) => s.id === id))) {
      return res.status(404).json({ error: 'Song not found.' });
    }
    const previous = clean(oldName, 120);
    for (const s of mine) {
      if (picked.has(s.id)) {
        if (!same(s.album || '', album)) delete s.albumCoverUrl;
        s.album = album;
      } else if (previous && same(s.album || '', previous)) {
        s.album = s.title;
        delete s.albumCoverUrl;
      }
    }
    writeDb(db);
    appendHistory({ actor: req.user.email, action: previous ? 'album.update' : 'album.create', entity: artist.id, detail: `${album} — ${artist.name} (${picked.size} songs)` });
    res.json({ artist, songs: db.songs.filter((s) => ownsSong(artist, s)) });
  });

  // Remove an album: its songs become singles again.
  router.delete('/albums/:name', requireArtist, (req, res) => {
    const db = readDb();
    const artist = artistOf(db, req.user);
    const album = req.params.name;
    let n = 0;
    for (const s of db.songs) {
      if (ownsSong(artist, s) && same(s.album || '', album)) {
        s.album = s.title;
        delete s.albumCoverUrl;
        n++;
      }
    }
    if (!n) return res.status(404).json({ error: 'Album not found.' });
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'album.delete', entity: artist.id, detail: `${album} — ${artist.name}` });
    res.json({ artist, songs: db.songs.filter((s) => ownsSong(artist, s)) });
  });

  /**
   * Album from a folder, in one request (multipart):
   *   files[]   the album cover, song files and per-song covers
   *   manifest  JSON { album, cover: i|null, songs: [{ title, audio: i, cover: i|null, duration }],
   *                    existingSongIds: [] }  — i = index into files[]
   * Songs without their own cover use the album cover. Existing songs picked by
   * the artist join the album too.
   */
  router.post('/albums/folder', requireArtist, (req, res) => {
    albumUpload.array('files', MAX_ALBUM_FILES)(req, res, (err) => {
      const files = req.files || [];
      const fail = (code, error) => {
        removeUploads(files);
        res.status(code).json({ error });
      };
      if (err) {
        return fail(400, err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 25 MB or smaller.'
          : err.code === 'LIMIT_FILE_COUNT' ? `An album folder can send at most ${MAX_ALBUM_FILES} files.`
          : err.message || 'Upload failed.');
      }
      let manifest;
      try {
        manifest = JSON.parse(req.body?.manifest || '{}');
      } catch {
        return fail(400, 'Bad album data.');
      }
      const album = clean(manifest.album, 120);
      const list = Array.isArray(manifest.songs) ? manifest.songs : [];
      const existing = Array.isArray(manifest.existingSongIds) ? manifest.existingSongIds : [];
      if (!album) return fail(400, 'Album name is required.');
      if (!list.length && !existing.length) return fail(400, 'An album needs at least one song.');

      const fileAt = (i, check) => (Number.isInteger(i) && files[i] && check(files[i]) ? files[i] : null);
      const urlOf = (f) => (f ? `/${isImage(f) ? 'covers' : 'audio'}/${f.filename}` : null);
      const albumCover = manifest.cover == null ? null : fileAt(manifest.cover, isImage);
      if (manifest.cover != null && !albumCover) return fail(400, 'The album cover must be an image.');

      const db = readDb();
      const artist = artistOf(db, req.user);
      const mine = db.songs.filter((s) => ownsSong(artist, s));
      if (existing.some((id) => !mine.some((s) => s.id === id))) return fail(404, 'Song not found.');

      const created = [];
      for (const [n, item] of list.entries()) {
        const title = clean(item?.title, 120);
        const audio = fileAt(item?.audio, isAudio);
        const cover = item?.cover == null ? null : fileAt(item.cover, isImage);
        const dur = Number(item?.duration);
        if (!title) return fail(400, `Song ${n + 1}: title is required.`);
        if (!audio) return fail(400, `${title}: song file is missing.`);
        if (item?.cover != null && !cover) return fail(400, `${title}: cover must be an image.`);
        if (!Number.isFinite(dur) || dur <= 0) return fail(400, `${title}: could not read the song length.`);
        created.push({
          id: newId('s'),
          title,
          artist: artist.name,
          album,
          duration: Math.round(dur),
          gradient: 'from-zinc-700 to-zinc-950',
          emoji: '🎵',
          explicit: false,
          coverUrl: urlOf(cover) ?? urlOf(albumCover),
          albumCoverUrl: urlOf(albumCover),
          audioUrl: urlOf(audio),
          createdAt: new Date().toISOString(),
        });
      }
      // Files sent but not used by the manifest are not kept.
      const used = new Set(created.flatMap((s) => [s.coverUrl, s.audioUrl, s.albumCoverUrl]));
      removeUploads(files.filter((f) => !used.has(urlOf(f))));

      for (const s of mine) {
        if (!existing.includes(s.id)) continue;
        s.album = album;
        if (albumCover) s.albumCoverUrl = urlOf(albumCover);
        else delete s.albumCoverUrl;
      }
      db.songs.unshift(...created);
      writeDb(db);
      appendHistory({
        actor: req.user.email,
        action: 'album.create',
        entity: artist.id,
        detail: `${album} — ${artist.name} (${created.length} new + ${existing.length} existing songs, from a folder)`,
      });
      res.status(201).json({ artist, songs: db.songs.filter((s) => ownsSong(artist, s)) });
    });
  });

  return router;
}

module.exports = { createStudioRouter };
