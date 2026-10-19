'use strict';
/**
 * Admin backend: songs / artists / albums / playlists CRUD + uploads + users + stats + history.
 * JSON-file storage under server/data (committed to git, like the rest of the DB).
 * All write routes require an admin session (see auth.requireAdmin).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { readUsers, writeUsers, publicUser, userFromRequest, requireAdmin } = require('./auth');
const { readHistory, appendHistory } = require('./history');
const { buildArtists, splitArtists } = require('./catalog');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'database.json');
const PLAYS_PATH = path.join(DATA_DIR, 'plays.json');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const LIVE_WINDOW_MS = 30 * 1000; // heartbeat fresh = listening now

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(p, value) {
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function readDb() {
  const db = readJson(DB_PATH, { songs: [], playlists: [], artists: [] });
  if (!Array.isArray(db.albums)) db.albums = [];
  return db;
}

function writeDb(db) {
  writeJson(DB_PATH, db);
}

function withTracks(db, playlist) {
  const tracks = (playlist.trackIds || [])
    .map((id) => db.songs.find((s) => s.id === id))
    .filter(Boolean);
  return { ...playlist, tracks };
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function isoNow() {
  return new Date().toISOString();
}

/** Sanitize upload filenames (spaces/apostrophes are fine — player encodeURIs them). */
function safeName(original) {
  const base = path.basename(original || 'file').replace(/[\\/:*?"<>|]/g, '').trim();
  return base || 'file';
}

const coverUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(PUBLIC_DIR, 'covers')),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Cover must be an image file.'));
  },
});

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(PUBLIC_DIR, 'audio')),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/audio|mpeg|mp3|wav|ogg|m4a/.test(file.mimetype) || /\.(mp3|wav|ogg|m4a)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Song must be an audio file.'));
    }
  },
});

function createAdminRouter() {
  const router = express.Router();

  function readPlays() {
    return readJson(PLAYS_PATH, []);
  }

  // ---- Songs ----
  router.post('/songs', requireAdmin, (req, res) => {
    const { title, artist, album, duration, gradient, emoji, explicit, coverUrl, audioUrl, lyrics } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Song title is required.' });
    }
    if (typeof artist !== 'string' || !artist.trim()) {
      return res.status(400).json({ error: 'At least one artist is required.' });
    }
    const dur = Number(duration);
    if (!Number.isFinite(dur) || dur <= 0) {
      return res.status(400).json({ error: 'Duration must be a positive number of seconds.' });
    }
    let lyricLines = null;
    if (lyrics !== undefined) {
      if (!Array.isArray(lyrics)) {
        return res.status(400).json({ error: 'Lyrics must be an array of {time, text}.' });
      }
      lyricLines = lyrics
        .filter((l) => l && typeof l.time === 'number' && typeof l.text === 'string')
        .map((l) => ({ time: Math.max(0, Math.round(l.time)), text: String(l.text).slice(0, 500) }))
        .sort((a, b) => a.time - b.time);
      if (!lyricLines.length) lyricLines = null;
    }
    const db = readDb();
    const song = {
      id: newId('s'),
      title: title.trim().slice(0, 120),
      artist: artist.trim().slice(0, 240),
      // No album: the song is its own single, named after the song.
      album: typeof album === 'string' && album.trim() ? album.trim().slice(0, 120) : title.trim().slice(0, 120),
      duration: Math.round(dur),
      gradient: typeof gradient === 'string' && gradient ? gradient : 'from-zinc-700 to-zinc-950',
      emoji: typeof emoji === 'string' && emoji ? emoji : '🎵',
      explicit: explicit === true,
      coverUrl: typeof coverUrl === 'string' && coverUrl ? coverUrl : null,
      audioUrl: typeof audioUrl === 'string' && audioUrl ? audioUrl : null,
      lyrics: lyricLines,
      createdAt: isoNow(),
    };
    db.songs.unshift(song);
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'song.create', entity: song.id, detail: `${song.title} — ${song.artist}` });
    res.status(201).json(song);
  });

  router.put('/songs/:id', requireAdmin, (req, res) => {
    const db = readDb();
    const song = db.songs.find((s) => s.id === req.params.id);
    if (!song) return res.status(404).json({ error: 'Song not found.' });
    const { title, artist, album, duration, gradient, emoji, explicit, coverUrl, audioUrl, lyrics } = req.body || {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Song title is required.' });
      song.title = title.trim().slice(0, 120);
    }
    if (artist !== undefined) {
      if (typeof artist !== 'string' || !artist.trim()) return res.status(400).json({ error: 'At least one artist is required.' });
      song.artist = artist.trim().slice(0, 240);
    }
    if (album !== undefined) song.album = String(album || '').trim().slice(0, 120) || song.title;
    if (duration !== undefined) {
      const dur = Number(duration);
      if (!Number.isFinite(dur) || dur <= 0) return res.status(400).json({ error: 'Duration must be positive.' });
      song.duration = Math.round(dur);
    }
    if (gradient !== undefined) song.gradient = gradient;
    if (emoji !== undefined) song.emoji = emoji;
    if (explicit !== undefined) song.explicit = explicit === true;
    if (coverUrl !== undefined) song.coverUrl = coverUrl || null;
    if (audioUrl !== undefined) song.audioUrl = audioUrl || null;
    if (lyrics !== undefined) {
      if (!Array.isArray(lyrics)) return res.status(400).json({ error: 'Lyrics must be an array of {time, text}.' });
      const lyricLines = lyrics
        .filter((l) => l && typeof l.time === 'number' && typeof l.text === 'string')
        .map((l) => ({ time: Math.max(0, Math.round(l.time)), text: String(l.text).slice(0, 500) }))
        .sort((a, b) => a.time - b.time);
      song.lyrics = lyricLines.length ? lyricLines : null;
    }
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'song.update', entity: song.id, detail: `${song.title} — ${song.artist}` });
    res.json(song);
  });

  router.delete('/songs/:id', requireAdmin, (req, res) => {
    const db = readDb();
    const idx = db.songs.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Song not found.' });
    const [removed] = db.songs.splice(idx, 1);
    for (const pl of db.playlists) {
      pl.trackIds = (pl.trackIds || []).filter((id) => id !== removed.id);
    }
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'song.delete', entity: removed.id, detail: `${removed.title} — ${removed.artist}` });
    res.status(204).end();
  });


  // ---- Artists ----
  router.post('/artists', requireAdmin, (req, res) => {
    const { name, followers, gradient, emoji, coverUrl, songIds, userId } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Artist name is required.' });
    }
    const db = readDb();
    const artist = {
      id: newId('a'),
      name: name.trim().slice(0, 120),
      followers: typeof followers === 'string' && followers ? followers : '0',
      gradient: typeof gradient === 'string' && gradient ? gradient : 'from-zinc-700 to-zinc-950',
      emoji: typeof emoji === 'string' && emoji ? emoji : '🎤',
      coverUrl: typeof coverUrl === 'string' && coverUrl ? coverUrl : null,
      songIds: Array.isArray(songIds) ? songIds.filter((id) => db.songs.some((s) => s.id === id)) : [],
      userId: typeof userId === 'string' && userId ? userId : null,
      createdAt: isoNow(),
    };
    db.artists = db.artists || [];
    db.artists.unshift(artist);
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'artist.create', entity: artist.id, detail: artist.name });
    res.status(201).json(artist);
  });

  router.put('/artists/:id', requireAdmin, (req, res) => {
    const db = readDb();
    db.artists = db.artists || [];
    let artist = db.artists.find((a) => a.id === req.params.id);
    if (!artist) {
      // Credit-only artist (derived from song credits): save it as a record on first edit.
      const derived = buildArtists(db, []).find((a) => a.id === req.params.id);
      if (!derived) return res.status(404).json({ error: 'Artist not found.' });
      const { monthlyListeners, ...rest } = derived;
      artist = { ...rest, userId: null, createdAt: isoNow() };
      db.artists.unshift(artist);
    }
    const oldName = artist.name;
    const { name, followers, gradient, emoji, coverUrl, songIds, userId } = req.body || {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Artist name is required.' });
      artist.name = name.trim().slice(0, 120);
    }
    if (followers !== undefined) artist.followers = String(followers);
    if (gradient !== undefined) artist.gradient = gradient;
    if (emoji !== undefined) artist.emoji = emoji;
    if (coverUrl !== undefined) artist.coverUrl = coverUrl || null;
    if (userId !== undefined) artist.userId = userId || null;

    // Keep song credits in step with the artist so the public pages agree:
    // renames rewrite the credit, removed songs drop it, added songs gain it.
    const same = (a, b) => a.toLowerCase() === b.toLowerCase();
    const credits = (song, n) => splitArtists(song.artist).some((c) => same(c, n));
    const setCredit = (song, names) => {
      song.artist = names.length ? names.join(', ') : 'Unknown Artist';
    };
    if (artist.name !== oldName) {
      for (const song of db.songs) {
        if (credits(song, oldName)) {
          setCredit(song, splitArtists(song.artist).map((c) => (same(c, oldName) ? artist.name : c)));
        }
      }
    }
    if (songIds !== undefined) {
      const keep = new Set(Array.isArray(songIds) ? songIds.filter((id) => db.songs.some((s) => s.id === id)) : []);
      for (const song of db.songs) {
        const credited = credits(song, artist.name);
        if (keep.has(song.id) && !credited) setCredit(song, [...splitArtists(song.artist), artist.name]);
        if (!keep.has(song.id) && credited) setCredit(song, splitArtists(song.artist).filter((c) => !same(c, artist.name)));
      }
      artist.songIds = [...keep];
    }
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'artist.update', entity: artist.id, detail: artist.name });
    res.json(artist);
  });

  router.delete('/artists/:id', requireAdmin, (req, res) => {
    const db = readDb();
    const idx = (db.artists || []).findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Artist not found.' });
    const [removed] = db.artists.splice(idx, 1);
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'artist.delete', entity: removed.id, detail: removed.name });
    res.status(204).end();
  });

  // ---- Albums (records for cover/gradient/links; names credited on songs still get a derived entry) ----
  const validAlbumSongs = (db, songIds) =>
    Array.isArray(songIds) ? [...new Set(songIds.filter((id) => db.songs.some((s) => s.id === id)))] : [];

  router.post('/albums', requireAdmin, (req, res) => {
    const { title, artist, gradient, emoji, coverUrl, songIds } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Album title is required.' });
    }
    const db = readDb();
    if (db.albums.some((a) => String(a.title || '').toLowerCase() === title.trim().toLowerCase())) {
      return res.status(409).json({ error: 'An album with this title already exists.' });
    }
    const album = {
      id: albumIdFor(title.trim(), new Set(db.albums.map((a) => a.id))),
      title: title.trim().slice(0, 120),
      artist: typeof artist === 'string' && artist.trim() ? artist.trim().slice(0, 240) : 'Unknown Artist',
      gradient: typeof gradient === 'string' && gradient ? gradient : 'from-zinc-700 to-zinc-950',
      emoji: typeof emoji === 'string' && emoji ? emoji.slice(0, 8) : '💿',
      coverUrl: typeof coverUrl === 'string' && coverUrl ? coverUrl.slice(0, 500) : null,
      songIds: validAlbumSongs(db, songIds),
      createdAt: isoNow(),
    };
    db.albums.unshift(album);
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'album.create', entity: album.id, detail: album.title });
    res.status(201).json(album);
  });

  router.put('/albums/:id', requireAdmin, (req, res) => {
    const db = readDb();
    const album = db.albums.find((a) => a.id === req.params.id);
    if (!album) return res.status(404).json({ error: 'Album not found.' });
    const { title, artist, gradient, emoji, coverUrl, songIds } = req.body || {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Album title is required.' });
      if (db.albums.some((a) => a.id !== album.id && String(a.title || '').toLowerCase() === title.trim().toLowerCase())) {
        return res.status(409).json({ error: 'An album with this title already exists.' });
      }
      album.title = title.trim().slice(0, 120);
    }
    if (artist !== undefined) album.artist = String(artist || 'Unknown Artist').slice(0, 240) || 'Unknown Artist';
    if (gradient !== undefined && gradient) album.gradient = gradient;
    if (emoji !== undefined && emoji) album.emoji = String(emoji).slice(0, 8);
    if (coverUrl !== undefined) album.coverUrl = coverUrl || null;
    if (songIds !== undefined) album.songIds = validAlbumSongs(db, songIds);
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'album.update', entity: album.id, detail: album.title });
    res.json(album);
  });

  router.delete('/albums/:id', requireAdmin, (req, res) => {
    const db = readDb();
    const idx = db.albums.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Album not found.' });
    const [removed] = db.albums.splice(idx, 1);
    writeDb(db);
    // Songs keep their `album` credit — the entry simply becomes derived again.
    appendHistory({ actor: req.user.email, action: 'album.delete', entity: removed.id, detail: removed.title });
    res.status(204).end();
  });

  // ---- Playlists ----
  router.post('/playlists', requireAdmin, (req, res) => {
    const { title, description, gradient, emoji, likes, coverUrl, trackIds } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Playlist title is required.' });
    }
    const db = readDb();
    const playlist = {
      id: newId('p'),
      title: title.trim().slice(0, 120),
      description: typeof description === 'string' ? description.slice(0, 300) : '',
      gradient: typeof gradient === 'string' && gradient ? gradient : 'from-zinc-700 to-zinc-950',
      emoji: typeof emoji === 'string' && emoji ? emoji : '🎧',
      likes: typeof likes === 'string' && likes ? likes : '0',
      coverUrl: typeof coverUrl === 'string' && coverUrl ? coverUrl : null,
      trackIds: Array.isArray(trackIds) ? trackIds.filter((id) => db.songs.some((s) => s.id === id)) : [],
      createdAt: isoNow(),
    };
    db.playlists.unshift(playlist);
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'playlist.create', entity: playlist.id, detail: playlist.title });
    res.status(201).json(withTracks(db, playlist));
  });

  router.put('/playlists/:id', requireAdmin, (req, res) => {
    const db = readDb();
    const playlist = db.playlists.find((p) => p.id === req.params.id);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found.' });
    const { title, description, gradient, emoji, likes, coverUrl, trackIds } = req.body || {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Playlist title is required.' });
      playlist.title = title.trim().slice(0, 120);
    }
    if (description !== undefined) playlist.description = String(description).slice(0, 300);
    if (gradient !== undefined) playlist.gradient = gradient;
    if (emoji !== undefined) playlist.emoji = emoji;
    if (likes !== undefined) playlist.likes = String(likes);
    if (coverUrl !== undefined) playlist.coverUrl = coverUrl || null;
    if (trackIds !== undefined) {
      playlist.trackIds = Array.isArray(trackIds) ? trackIds.filter((id) => db.songs.some((s) => s.id === id)) : [];
    }
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'playlist.update', entity: playlist.id, detail: playlist.title });
    res.json(withTracks(db, playlist));
  });

  router.delete('/playlists/:id', requireAdmin, (req, res) => {
    const db = readDb();
    const idx = db.playlists.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Playlist not found.' });
    const [removed] = db.playlists.splice(idx, 1);
    writeDb(db);
    appendHistory({ actor: req.user.email, action: 'playlist.delete', entity: removed.id, detail: removed.title });
    res.status(204).end();
  });

  // ---- Uploads (cover image / audio file) ----
  router.post('/uploads/cover', requireAdmin, (req, res) => {
    coverUpload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Cover upload failed.' });
      if (!req.file) return res.status(400).json({ error: 'No file received.' });
      res.status(201).json({ url: `/covers/${req.file.filename}` });
    });
  });

  router.post('/uploads/audio', requireAdmin, (req, res) => {
    audioUpload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Audio upload failed.' });
      if (!req.file) return res.status(400).json({ error: 'No file received.' });
      res.status(201).json({ url: `/audio/${req.file.filename}` });
    });
  });

  // ---- Users (role changes; artist role auto-links an artist entry) ----
  router.get('/users', requireAdmin, (_req, res) => {
    res.json(readUsers().users.map((u) => publicUser(u)));
  });

  function ensureArtistForUser(user) {
    const db = readDb();
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
        createdAt: isoNow(),
      };
      db.artists.unshift(artist);
      appendHistory({ actor: 'system', action: 'artist.create', entity: artist.id, detail: `${artist.name} (role granted to ${user.email})` });
    }
    artist.name = user.name || artist.name;
    artist.userId = user.id;
    writeDb(db);
  }

  function unlinkArtistForUser(userId) {
    const db = readDb();
    const artist = (db.artists || []).find((a) => a.userId === userId);
    if (artist) {
      artist.userId = null;
      writeDb(db);
    }
  }

  router.patch('/users/:id', requireAdmin, (req, res) => {
    const db = readUsers();
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    const { role, name } = req.body || {};
    if (role !== undefined) {
      if (!['user', 'artist', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Unknown role.' });
      }
      if (user.id === req.user.id && role !== 'admin') {
        return res.status(400).json({ error: 'You cannot demote your own admin account.' });
      }
      const before = user.role || 'user';
      user.role = role;
      if (role === 'artist') ensureArtistForUser(user);
      if (before === 'artist' && role !== 'artist') unlinkArtistForUser(user.id);
      appendHistory({ actor: req.user.email, action: 'user.role', entity: user.id, detail: `${user.email}: ${before} → ${role}` });
    }
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
      user.name = name.trim().slice(0, 60);
    }
    writeUsers(db);
    res.json(publicUser(user));
  });

  router.delete('/users/:id', requireAdmin, (req, res) => {
    const db = readUsers();
    const idx = db.users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Account not found.' });
    if (db.users[idx].id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }
    const [removed] = db.users.splice(idx, 1);
    unlinkArtistForUser(removed.id);
    writeUsers(db);
    appendHistory({ actor: req.user.email, action: 'user.delete', entity: removed.id, detail: removed.email });
    res.status(204).end();
  });



  // ---- Play events + live listeners ----
  const isClientId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64;
  // clientId (one per player tab) -> { listener, trackId, at }. `listener` is the
  // signed-in user id, or the clientId for guests, so one person with two tabs
  // counts once. Only playing tabs heartbeat; pause / tab close sends /stats/stop.
  const live = new Map();

  router.post('/stats/play', (req, res) => {
    const { trackId, clientId } = req.body || {};
    if (typeof trackId !== 'string' || !trackId) return res.status(400).json({ error: 'trackId is required.' });
    if (!readDb().songs.some((s) => s.id === trackId)) return res.status(404).json({ error: 'Song not found.' });
    // Real listener identity: account id when signed in, else this browser tab.
    const userId = userFromRequest(req)?.user?.id || (isClientId(clientId) ? `guest-${clientId}` : 'guest');
    const plays = readPlays();
    plays.push({ trackId, userId, at: isoNow() });
    // Play counts are computed from this log, so keep a generous history.
    writeJson(PLAYS_PATH, plays.slice(-200000));
    res.status(201).end();
  });

  router.post('/stats/heartbeat', (req, res) => {
    const { trackId, clientId } = req.body || {};
    if (typeof trackId !== 'string' || !trackId) return res.status(400).json({ error: 'trackId is required.' });
    if (!isClientId(clientId)) return res.status(400).json({ error: 'clientId is required.' });
    const listener = userFromRequest(req)?.user?.id || `guest-${clientId}`;
    live.set(clientId, { listener, trackId, at: Date.now() });
    res.status(204).end();
  });

  router.post('/stats/stop', (req, res) => {
    const { clientId } = req.body || {};
    if (isClientId(clientId)) live.delete(clientId);
    res.status(204).end();
  });

  router.get('/stats/live', (_req, res) => {
    const cutoff = Date.now() - LIVE_WINDOW_MS;
    for (const [key, v] of live) {
      if (v.at < cutoff) live.delete(key);
    }
    res.json({ listeners: new Set([...live.values()].map((v) => v.listener)).size });
  });

  router.get('/stats/overview', requireAdmin, (req, res) => {
    const range = String(req.query.range || 'week');
    const now = Date.now();
    const spans = { day: 864e5, week: 7 * 864e5, month: 30 * 864e5, year: 365 * 864e5 };
    const span = spans[range] || spans.week;
    const plays = readPlays().filter((p) => now - new Date(p.at).getTime() <= span);
    const users = readUsers().users.length;
    const db = readDb();
    res.json({
      range,
      plays: plays.length,
      accounts: users,
      playlists: db.playlists.length,
      songs: db.songs.length,
      artists: (db.artists || []).length,
      albums: (db.albums || []).length,
    });
  });

  // ---- History ----
  router.get('/history', requireAdmin, (req, res) => {
    const q = String(req.query.q || '').toLowerCase();
    const action = String(req.query.action || '');
    const from = req.query.from ? new Date(String(req.query.from)).getTime() : null;
    const to = req.query.to ? new Date(String(req.query.to)).getTime() : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));
    let items = readHistory();
    if (action) items = items.filter((h) => h.action === action);
    if (q) {
      items = items.filter((h) =>
        `${h.actor || ''} ${h.action || ''} ${h.entity || ''} ${h.detail || ''}`.toLowerCase().includes(q),
      );
    }
    if (from !== null && !Number.isNaN(from)) items = items.filter((h) => new Date(h.at).getTime() >= from);
    if (to !== null && !Number.isNaN(to)) items = items.filter((h) => new Date(h.at).getTime() <= to + 864e5);
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    res.json({ items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pages });
  });

  return router;
}

module.exports = { createAdminRouter, coverUpload };
