'use strict';
/**
 * Auth: user accounts stored in server/data/users.json (committed to git so
 * every `git pull` shares the same accounts). Passwords are scrypt-hashed.
 * Sessions live in memory only (tokens are never written to git).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { appendHistory } = require('./history');

const USERS_PATH = path.join(__dirname, 'data', 'users.json');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** token -> { userId, expires } — memory only, cleared on server restart */
const sessions = new Map();

function readUsers() {
  if (!fs.existsSync(USERS_PATH)) writeUsers({ users: [] });
  return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
}

function writeUsers(db) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(password, salt, 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function publicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function nameFromEmail(email) {
  const words = email.split('@')[0].replace(/[._-]+/g, ' ').trim().split(/\s+/);
  const name = words.filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  return name || 'Listener';
}

function newUserId() {
  return `u_${crypto.randomBytes(6).toString('hex')}`;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

function userFromRequest(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = readUsers().users.find((u) => u.id === session.userId) || null;
  return { user, token };
}

function requireAuth(req, res, next) {
  const found = userFromRequest(req);
  if (!found || !found.user) return res.status(401).json({ error: 'Please log in first.' });
  req.user = found.user;
  req.authToken = found.token;
  next();
}

function requireAdmin(req, res, next) {
  const found = userFromRequest(req);
  if (!found || !found.user) return res.status(401).json({ error: 'Please log in first.' });
  if ((found.user.role || 'user') !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  req.user = found.user;
  req.authToken = found.token;
  next();
}

function findAccount(db, provider, key) {
  const normalized = String(key).toLowerCase();
  return db.users.find((u) => u.provider === provider && String(u.email ?? u.phone ?? '').toLowerCase() === normalized);
}

function createAuthRouter() {
  const router = express.Router();

  // ---- Sign up with email + password ----
  router.post('/signup', (req, res) => {
    const { name, email, password } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Enter your name.' });
    }
    if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const db = readUsers();
    if (findAccount(db, 'email', email.trim())) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const user = {
      id: newUserId(),
      email: email.trim().toLowerCase(),
      name: name.trim().slice(0, 60) || nameFromEmail(email),
      provider: 'email',
      passwordHash: hashPassword(password),
      phone: null,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    writeUsers(db);
    appendHistory({ actor: user.email, action: 'user.signup', entity: user.id, detail: `${user.name} joined` });
    res.status(201).json({ token: createSession(user.id), user: publicUser(user) });
  });

  // ---- Log in with email + password ----
  router.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    const db = readUsers();
    const user = isEmail(email) ? findAccount(db, 'email', email) : null;
    if (!user || !verifyPassword(typeof password === 'string' ? password : '', user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    res.json({ token: createSession(user.id), user: publicUser(user) });
  });

  // ---- Session ----
  router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

  router.post('/logout', requireAuth, (req, res) => {
    sessions.delete(req.authToken);
    res.status(204).end();
  });

  return router;
}

module.exports = { readUsers, writeUsers, publicUser, createAuthRouter, requireAuth, requireAdmin };
