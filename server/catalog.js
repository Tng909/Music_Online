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

module.exports = { readPlays, playCounts, withPlays, splitArtists, buildArtists };
