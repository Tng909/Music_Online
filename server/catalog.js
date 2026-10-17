'use strict';
/**
 * Read-side catalog helpers: real play counts and the public artist list.
 *
 * Play counts come from server/data/plays.json (one entry per play event),
 * never from a stored field. Artists are the admin-managed records plus any
 * name credited on a song that has no record yet, so every credited artist
 * gets a page.
 */
const fs = require('fs');
const path = require('path');

const PLAYS_PATH = path.join(__dirname, 'data', 'plays.json');
const MONTH_MS = 30 * 864e5;

function readPlays() {
  try {
    const plays = JSON.parse(fs.readFileSync(PLAYS_PATH, 'utf8'));
    return Array.isArray(plays) ? plays : [];
  } catch {
    return [];
  }
}

/** trackId -> number of plays (all time). */
function playCounts(plays) {
  const counts = new Map();
  for (const p of plays) counts.set(p.trackId, (counts.get(p.trackId) || 0) + 1);
  return counts;
}

function withPlays(song, counts) {
  return { ...song, plays: counts.get(song.id) || 0 };
}

/** "Lady Gaga, Bruno Mars" / "A & B" / "A feat. B" -> ["Lady Gaga", "Bruno Mars"]. */
function splitArtists(credit) {
  return String(credit || '')
    .split(/\s*(?:,|&|\bfeat\.?|\bft\.?)\s*/i)
    .map((n) => n.trim())
    .filter((n) => n && !/^unknown artist$/i.test(n));
}

function slugify(name) {
  return (
    String(name)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'artist'
  );
}

/** Stable id for an album name, unique within the known id set. */
function albumIdFor(name, usedIds) {
  let id = slugify(String(name || 'single').trim() || 'single').replace(/^artist$/, 'single');
  if (!id) id = 'single';
  while (usedIds.has(id)) id += '-1';
  usedIds.add(id);
  return id;
}

/**
 * Admin album records + a derived entry for every album name credited on a
 * song with no record yet, each with resolved tracks and total plays.
 */
function buildAlbums(db, plays) {
  const songs = db.songs || [];
  const records = db.albums || [];
  const counts = playCounts(plays);
  const byName = new Map();
  const usedIds = new Set();

  for (const rec of records) {
    const id = String(rec.id);
    usedIds.add(id);
    byName.set(String(rec.title || '').toLowerCase(), {
      ...rec,
      tracks: [],
    });
  }

  for (const song of songs) {
    const title = String(song.album || 'Single').trim() || 'Single';
    const key = title.toLowerCase();
    let album = byName.get(key);
    if (!album) {
      album = {
        id: albumIdFor(title, usedIds),
        title,
        artist: song.artist || 'Unknown Artist',
        gradient: song.gradient || 'from-zinc-700 to-zinc-950',
        emoji: '💿',
        coverUrl: song.coverUrl || null,
        songIds: [],
        derived: true,
        tracks: [],
      };
      byName.set(key, album);
    }
    album.tracks.push(withPlays(song, counts));
    if (!album.coverUrl && song.coverUrl) album.coverUrl = song.coverUrl;
  }

  // Recorded link lists may include ids whose songs no longer exist — drop those.
  const validIds = new Set(songs.map((s) => s.id));
  return [...byName.values()]
    .map((album) => {
      const linked = new Set(album.songIds || []);
      const fromSongs = new Set(album.tracks.map((t) => t.id));
      const missing = [...linked].filter((id) => validIds.has(id) && !fromSongs.has(id));
      for (const id of missing) {
        const song = songs.find((s) => s.id === id);
        if (song) album.tracks.push(withPlays(song, counts));
      }
      const tracks = album.tracks.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db2 = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return da - db2;
      });
      return {
        id: album.id,
        title: album.title,
        artist: album.artist,
        gradient: album.gradient,
        emoji: album.emoji,
        coverUrl: album.coverUrl,
        songIds: tracks.map((t) => t.id),
        plays: tracks.reduce((n, t) => n + (t.plays || 0), 0),
        createdAt: album.createdAt,
        tracks,
      };
    })
    .sort((a, b) => b.plays - a.plays);
}

/**
 * Records + credit-derived artists, each with the song ids they appear on
 * and monthlyListeners = distinct listeners of those songs in the last 30 days.
 */
function buildArtists(db, plays) {
  const songs = db.songs || [];
  const records = db.artists || [];
  const credited = (name) =>
    songs.filter((s) => splitArtists(s.artist).some((n) => n.toLowerCase() === name.toLowerCase())).map((s) => s.id);

  const artists = records.map((a) => ({
    ...a,
    songIds: [...new Set([...(a.songIds || []), ...credited(a.name)])],
  }));
  const known = new Set(artists.map((a) => a.name.toLowerCase()));
  const usedIds = new Set(artists.map((a) => a.id));
  for (const song of songs) {
    for (const name of splitArtists(song.artist)) {
      if (known.has(name.toLowerCase())) continue;
      known.add(name.toLowerCase());
      let id = slugify(name);
      while (usedIds.has(id)) id += '-1';
      usedIds.add(id);
      artists.push({
        id,
        name,
        followers: '0',
        gradient: song.gradient || 'from-zinc-700 to-zinc-950',
        emoji: '🎤',
        // No uploaded photo for a credit-only artist: use their song's cover.
        coverUrl: song.coverUrl || null,
        songIds: credited(name),
      });
    }
  }

  const since = Date.now() - MONTH_MS;
  const recent = plays.filter((p) => new Date(p.at).getTime() >= since);
  return artists.map((a) => {
    const ids = new Set(a.songIds);
    const listeners = new Set(recent.filter((p) => ids.has(p.trackId)).map((p) => p.userId));
    return { ...a, monthlyListeners: listeners.size };
  });
}

module.exports = { readPlays, playCounts, withPlays, splitArtists, buildArtists, buildAlbums, albumIdFor };
