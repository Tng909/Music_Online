'use strict';
/**
 * User library: personal playlists / albums / folders.
 * Stored in server/data/user-collections.json (per-user, owner-only access).
 * All routes require a logged-in session (see auth.requireAuth).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { requireAuth } = require('./auth');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'database.json');
const COLLECTIONS_PATH = path.join(DATA_DIR, 'user-collections.json');

const KINDS = ['playlist', 'album', 'folder'];
const KIND_GRADIENT = {
  playlist: 'from-violet-500 via-purple-500 to-indigo-600',
  album: 'from-amber-500 to-orange-700',
  folder: 'from-sky-500 to-indigo-700',
};
const KIND_EMOJI = { playlist: '🎧', album: '💿', folder: '📁' };

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

function readCollections() {
  const data = readJson(COLLECTIONS_PATH, { collections: [] });
  if (!Array.isArray(data.collections)) data.collections = [];
  return data.collections;
}

function writeCollections(collections) {
  writeJson(COLLECTIONS_PATH, { collections });
}

function readSongs() {
  return readJson(DB_PATH, { songs: [] }).songs || [];
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function validTrackIds(songIds) {
  if (!Array.isArray(songIds)) return [];
  const valid = new Set(readSongs().map((s) => s.id));
  return [...new Set(songIds.filter((id) => typeof id === 'string' && valid.has(id)))];
}

function createUserLibraryRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    const kind = String(req.query.kind || '');
    let list = readCollections().filter((c) => c.ownerId === req.user.id);
    if (KINDS.includes(kind)) list = list.filter((c) => c.kind === kind);
    list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(list);
  });

  router.post('/', (req, res) => {
    const { kind, title, description, trackIds } = req.body || {};
    if (!KINDS.includes(kind)) {
      return res.status(400).json({ error: 'kind must be playlist, album or folder.' });
    }
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'A name is required.' });
    }
    const collections = readCollections();
    const c = {
      id: newId(kind[0]),
      kind,
      title: title.trim().slice(0, 120),
      description: typeof description === 'string' ? description.trim().slice(0, 300) : '',
      ownerId: req.user.id,
      gradient: KIND_GRADIENT[kind],
      emoji: KIND_EMOJI[kind],
      coverUrl: null,
      trackIds: validTrackIds(trackIds),
      createdAt: new Date().toISOString(),
    };
    collections.unshift(c);
    writeCollections(collections);
    res.status(201).json(c);
  });

  router.put('/:id', (req, res) => {
    const collections = readCollections();
    const c = collections.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
    if (!c) return res.status(404).json({ error: 'Not found.' });
    const { title, description, trackIds } = req.body || {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Name is required.' });
      c.title = title.trim().slice(0, 120);
    }
    if (description !== undefined) c.description = String(description || '').slice(0, 300);
    if (trackIds !== undefined) c.trackIds = validTrackIds(trackIds);
    writeCollections(collections);
    res.json(c);
  });

  router.post('/:id/tracks', (req, res) => {
    const ids = validTrackIds((req.body || {}).trackIds);
    if (!ids.length) return res.status(400).json({ error: 'trackIds is required.' });
    const collections = readCollections();
    const c = collections.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
    if (!c) return res.status(404).json({ error: 'Not found.' });
    const have = new Set(c.trackIds || []);
    for (const id of ids) if (!have.has(id)) c.trackIds.push(id);
    writeCollections(collections);
    res.json(c);
  });

  router.delete('/:id/tracks/:trackId', (req, res) => {
    const collections = readCollections();
    const c = collections.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
    if (!c) return res.status(404).json({ error: 'Not found.' });
    c.trackIds = (c.trackIds || []).filter((id) => id !== req.params.trackId);
    writeCollections(collections);
    res.json(c);
  });

  router.delete('/:id', (req, res) => {
    const collections = readCollections();
    const idx = collections.findIndex((x) => x.id === req.params.id && x.ownerId === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found.' });
    collections.splice(idx, 1);
    writeCollections(collections);
    res.status(204).end();
  });

  return router;
}

module.exports = { createUserLibraryRouter };
