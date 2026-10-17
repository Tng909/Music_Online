'use strict';
/**
 * "Your Library" per signed-in user: followed artists, saved playlists and
 * playlists the user created. Ids are stored on the user record in
 * server/data/users.json; created playlists live in database.json with an
 * ownerId so they get a normal playlist page.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { readUsers, writeUsers, requireAuth } = require('./auth');
const { coverUpload } = require('./admin');

const DB_PATH = path.join(__dirname, 'data', 'database.json');

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function libraryOf(user) {
  return {
    followedArtists: user.followedArtists || [],
    savedPlaylists: user.savedPlaylists || [],
  };
}

/** Load the user record fresh, apply `fn`, persist, and answer with the library. */
function mutate(req, res, fn) {
  const db = readUsers();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(401).json({ error: 'Please log in first.' });
  user.followedArtists = user.followedArtists || [];
  user.savedPlaylists = user.savedPlaylists || [];
  fn(user);
  writeUsers(db);
  res.json(libraryOf(user));
}

/** artistId -> number of users following it. */
function followerCounts() {
  const counts = new Map();
  for (const u of readUsers().users) {
    for (const id of u.followedArtists || []) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

function createLibraryRouter() {
  const router = express.Router();

  router.get('/', requireAuth, (req, res) => res.json(libraryOf(req.user)));

  router.put('/artists/:id', requireAuth, (req, res) =>
    mutate(req, res, (u) => {
      if (!u.followedArtists.includes(req.params.id)) u.followedArtists.unshift(req.params.id);
    }),
  );

  router.delete('/artists/:id', requireAuth, (req, res) =>
    mutate(req, res, (u) => {
      u.followedArtists = u.followedArtists.filter((id) => id !== req.params.id);
    }),
  );

  router.put('/playlists/:id', requireAuth, (req, res) => {
    if (!readDb().playlists.some((p) => p.id === req.params.id)) {
      return res.status(404).json({ error: 'Playlist not found.' });
    }
    mutate(req, res, (u) => {
      if (!u.savedPlaylists.includes(req.params.id)) u.savedPlaylists.unshift(req.params.id);
    });
  });

  router.delete('/playlists/:id', requireAuth, (req, res) =>
    mutate(req, res, (u) => {
      u.savedPlaylists = u.savedPlaylists.filter((id) => id !== req.params.id);
    }),
  );

  // Create a playlist owned by the user ("My Playlist #n" when untitled).
  router.post('/playlists', requireAuth, (req, res) => {
    const db = readDb();
    const own = db.playlists.filter((p) => p.ownerId === req.user.id).length;
    const title = typeof req.body?.title === 'string' && req.body.title.trim()
      ? req.body.title.trim().slice(0, 120)
      : `My Playlist #${own + 1}`;
    const playlist = {
      id: `p_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`,
      title,
      description: '',
      gradient: 'from-zinc-700 to-zinc-950',
      emoji: '🎧',
      likes: '0',
      coverUrl: null,
      trackIds: [],
      ownerId: req.user.id,
      ownerName: req.user.name,
      createdAt: new Date().toISOString(),
    };
    db.playlists.unshift(playlist);
    writeDb(db);
    mutate(req, res, (u) => {
      u.savedPlaylists.unshift(playlist.id);
    });
  });

  // ---- Playlists the user owns: edit, add / remove songs, delete ----

  /** Load database.json and the user's own playlist, or answer 404 / 403. */
  function ownPlaylist(req, res) {
    const db = readDb();
    const playlist = db.playlists.find((p) => p.id === req.params.id);
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found.' });
      return null;
    }
    if (playlist.ownerId !== req.user.id) {
      res.status(403).json({ error: 'You can only change your own playlists.' });
      return null;
    }
    playlist.trackIds = playlist.trackIds || [];
    return { db, playlist };
  }

  router.patch('/my-playlists/:id', requireAuth, (req, res) => {
    const found = ownPlaylist(req, res);
    if (!found) return;
    const { title, description, coverUrl, trackIds } = req.body || {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Playlist title is required.' });
      }
      found.playlist.title = title.trim().slice(0, 120);
    }
    if (description !== undefined) found.playlist.description = String(description).trim().slice(0, 300);
    if (coverUrl !== undefined) {
      // Only covers uploaded through this server (see /uploads/cover below).
      if (coverUrl !== null && (typeof coverUrl !== 'string' || !coverUrl.startsWith('/covers/'))) {
        return res.status(400).json({ error: 'Invalid cover.' });
      }
      found.playlist.coverUrl = coverUrl;
    }
    if (trackIds !== undefined) {
      if (!Array.isArray(trackIds)) return res.status(400).json({ error: 'trackIds must be a list.' });
      const known = new Set(found.db.songs.map((s) => s.id));
      found.playlist.trackIds = [...new Set(trackIds)].filter((id) => known.has(id));
    }
    writeDb(found.db);
    res.json(libraryOf(req.user));
  });

  router.post('/my-playlists/:id/tracks', requireAuth, (req, res) => {
    const found = ownPlaylist(req, res);
    if (!found) return;
    const songId = req.body?.songId;
    if (typeof songId !== 'string' || !found.db.songs.some((s) => s.id === songId)) {
      return res.status(404).json({ error: 'Song not found.' });
    }
    if (!found.playlist.trackIds.includes(songId)) {
      found.playlist.trackIds.push(songId);
      writeDb(found.db);
    }
    res.json(libraryOf(req.user));
  });

  router.delete('/my-playlists/:id/tracks/:songId', requireAuth, (req, res) => {
    const found = ownPlaylist(req, res);
    if (!found) return;
    found.playlist.trackIds = found.playlist.trackIds.filter((id) => id !== req.params.songId);
    writeDb(found.db);
    res.json(libraryOf(req.user));
  });

  // Cover image for one of the user's playlists (same storage as admin uploads).
  router.post('/uploads/cover', requireAuth, (req, res) => {
    coverUpload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Cover upload failed.' });
      if (!req.file) return res.status(400).json({ error: 'No file received.' });
      res.status(201).json({ url: `/covers/${req.file.filename}` });
    });
  });

  // Delete the playlist for everyone and drop it from every user's library.
  router.delete('/my-playlists/:id', requireAuth, (req, res) => {
    const found = ownPlaylist(req, res);
    if (!found) return;
    found.db.playlists = found.db.playlists.filter((p) => p.id !== req.params.id);
    writeDb(found.db);
    const users = readUsers();
    for (const u of users.users) {
      if (u.savedPlaylists?.includes(req.params.id)) {
        u.savedPlaylists = u.savedPlaylists.filter((id) => id !== req.params.id);
      }
    }
    writeUsers(users);
    const me = users.users.find((u) => u.id === req.user.id) || req.user;
    res.json(libraryOf(me));
  });

  return router;
}

module.exports = { createLibraryRouter, followerCounts };
