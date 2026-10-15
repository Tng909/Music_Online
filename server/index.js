/**
 * MusicOnline API server
 *
 * The database is a plain JSON file: server/data/database.json
 * It is committed to git, so every `git pull` shares the same songs.
 *
 * Run:  npm run server   (or `npm run dev` for server + Angular together)
 * API:  http://localhost:3000/api/songs
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { createAuthRouter, requireAuth } = require('./auth');
const { createAdminRouter } = require('./admin');
const { readPlays, playCounts, withPlays, buildArtists } = require('./catalog');

const app = express();
const PORT = process.env.PORT || 3000;

const DB_PATH = path.join(__dirname, 'data', 'database.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json());

// Cover images + audio files live in /public and are served statically.
// e.g. http://localhost:3000/covers/after-hours.jpg
app.use('/covers', express.static(path.join(PUBLIC_DIR, 'covers')));
app.use('/audio', express.static(path.join(PUBLIC_DIR, 'audio')));

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

// Playlists store song ids (trackIds); resolve them to full song objects.
function withTracks(db, playlist, counts) {
  const tracks = (playlist.trackIds || [])
    .map((id) => db.songs.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => withPlays(s, counts));
  return { ...playlist, tracks };
}

// ---- Auth: user accounts (server/data/users.json) ----
app.use('/api/auth', createAuthRouter());

// ---- Admin: CRUD + uploads + stats + history (admin-only writes) ----
app.use('/api/admin', createAdminRouter());

// ---- Songs (read-only) ----
app.get('/api/songs', (_req, res) => {
  const counts = playCounts(readPlays());
  res.json(readDb().songs.map((s) => withPlays(s, counts)));
});

app.get('/api/songs/:id', (req, res) => {
  const song = readDb().songs.find((s) => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Song not found' });
  res.json(withPlays(song, playCounts(readPlays())));
});

// ---- Playlists (read-only) ----
app.get('/api/playlists', (_req, res) => {
  const db = readDb();
  const counts = playCounts(readPlays());
  res.json(db.playlists.map((p) => withTracks(db, p, counts)));
});

app.get('/api/playlists/:id', (req, res) => {
  const db = readDb();
  const playlist = db.playlists.find((p) => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  res.json(withTracks(db, playlist, playCounts(readPlays())));
});

// ---- Artists (read-only) ----
// Admin records + every artist credited on a song, with real monthly listeners.
app.get('/api/artists', (_req, res) => {
  res.json(buildArtists(readDb(), readPlays()));
});

// ---- Health check ----
app.get('/api/health', (_req, res) => {
  const db = readDb();
  res.json({
    ok: true,
    songs: db.songs.length,
    playlists: db.playlists.length,
    artists: (db.artists || []).length,
  });
});

// `requireAuth` is re-exported for route modules that need it.
module.exports = { requireAuth };

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MusicOnline API  → http://localhost:${PORT}/api`);
    console.log(`Database file    → ${DB_PATH}`);
    console.log(`Covers           → http://localhost:${PORT}/covers/<file>`);
    console.log(`Audio            → http://localhost:${PORT}/audio/<file>`);
  });
}
