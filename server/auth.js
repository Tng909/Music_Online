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

const USERS_PATH = path.join(__dirname, 'data', 'users.json');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** token -> { userId, expires } — memory only, cleared on server restart */
const sessions = new Map();
/** phone -> { code, expires } — pending SMS codes (demo: returned to client) */
const phoneCodes = new Map();

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

function findAccount(db, provider, key) {
  const normalized = String(key).toLowerCase();
  return db.users.find((u) => u.provider === provider && String(u.email ?? u.phone ?? '').toLowerCase() === normalized);
}

function createAuthRouter() {
  const router = express.Router();

  // ---- Sign up with email + password ----
  router.post('/signup', (req, res) => {
    const { email, password } = req.body || {};
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
      name: nameFromEmail(email),
      provider: 'email',
      passwordHash: hashPassword(password),
      phone: null,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    writeUsers(db);
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

  // ---- Google / Apple / Facebook (demo OAuth: find-or-create by email) ----
  router.post('/social', (req, res) => {
    const { provider, email } = req.body || {};
    if (!['google', 'apple', 'facebook'].includes(provider)) {
      return res.status(400).json({ error: 'Unknown provider.' });
    }
    if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const db = readUsers();
    let user = findAccount(db, provider, email);
    if (!user) {
      user = {
        id: newUserId(),
        email: email.trim().toLowerCase(),
        name: nameFromEmail(email),
        provider,
        passwordHash: null,
        phone: null,
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      writeUsers(db);
    }
    res.json({ token: createSession(user.id), user: publicUser(user) });
  });

  // ---- Phone number (demo SMS: code returned in the response) ----
  router.post('/phone/start', (req, res) => {
    const phone = String((req.body || {}).phone || '').trim();
    if (!/^\+?[0-9 ()\-]{7,20}$/.test(phone)) {
      return res.status(400).json({ error: 'Enter a valid phone number.' });
    }
    const code = String(crypto.randomInt(100000, 1000000));
    phoneCodes.set(phone, { code, expires: Date.now() + CODE_TTL_MS });
    // Demo: a real server would SMS this instead of returning it.
    res.json({ ok: true, code });
  });

  router.post('/phone/verify', (req, res) => {
    const { phone, code } = req.body || {};
    const entry = phoneCodes.get(String(phone ?? '').trim());
    if (!entry || entry.expires < Date.now() || entry.code !== String(code ?? '')) {
      phoneCodes.delete(String(phone ?? '').trim());
      return res.status(401).json({ error: 'That code is incorrect or expired.' });
    }
    phoneCodes.delete(String(phone ?? '').trim());
    const db = readUsers();
    let user = findAccount(db, 'phone', phone);
    if (!user) {
      user = {
        id: newUserId(),
        email: null,
        name: String(phone).trim(),
        provider: 'phone',
        passwordHash: null,
        phone: String(phone).trim(),
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      writeUsers(db);
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

module.exports = { readUsers, writeUsers, publicUser, createAuthRouter };
