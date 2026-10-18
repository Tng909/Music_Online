'use strict';
/**
 * Contact requests: a signed-in user sends a title + detail (+ optional files)
 * to the admins, then the user and admins reply to each other until an admin
 * marks it resolved (reopening allows replies again). Records live in server/data/contacts.json; attached files in
 * server/uploads/contacts (not public — downloaded through an auth-checked route).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { requireAuth, requireAdmin } = require('./auth');
const { appendHistory } = require('./history');

const CONTACTS_PATH = path.join(__dirname, 'data', 'contacts.json');
const FILES_DIR = path.join(__dirname, 'uploads', 'contacts');
const MAX_FILES = 5;
const STATUSES = ['open', 'resolved'];

function readContacts() {
  try {
    return JSON.parse(fs.readFileSync(CONTACTS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeContacts(list) {
  fs.writeFileSync(CONTACTS_PATH, JSON.stringify(list, null, 2) + '\n', 'utf8');
}

/** Browsers send UTF-8 names but multer reads them as latin1; keep the raw name if it wasn't UTF-8. */
function originalName(file) {
  const raw = file.originalname || 'file';
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  return utf8.includes('�') ? raw : utf8;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(FILES_DIR, { recursive: true });
      cb(null, FILES_DIR);
    },
    // Stored under a random name; the original name is kept in the record.
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(originalName(file)).slice(0, 12)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_FILES },
});

function removeFiles(files) {
  for (const f of files || []) fs.rm(path.join(FILES_DIR, f.stored || f), { force: true }, () => {});
}

function publicFiles(files) {
  return (files || []).map(({ id, name, size, type }) => ({ id, name, size, type }));
}

/** What the client sees: attachments without their on-disk names. */
function publicContact(c) {
  return {
    ...c,
    files: publicFiles(c.files),
    replies: (c.replies || []).map((r) => ({ ...r, files: publicFiles(r.files) })),
  };
}

/** Stored attachment records for multer's uploaded files. */
function fileRecords(files) {
  return files.map((f) => ({
    id: crypto.randomBytes(6).toString('hex'),
    name: originalName(f),
    size: f.size,
    type: f.mimetype || 'application/octet-stream',
    stored: f.filename,
  }));
}

/** Run multer for `files[]`; answers 400 itself on upload errors. */
function receiveFiles(req, res, next) {
  upload.array('files', MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    removeFiles((req.files || []).map((f) => f.filename));
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 10 MB or smaller.'
      : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? `Attach at most ${MAX_FILES} files.`
      : err.message || 'Upload failed.';
    res.status(400).json({ error: msg });
  });
}

/** The contact's sender or an admin. */
function canSee(contact, user) {
  return contact.userId === user.id || (user.role || 'user') === 'admin';
}

function createContactsRouter() {
  const router = express.Router();

  // Send a contact (multipart: title, detail, files[]).
  router.post('/', requireAuth, receiveFiles, (req, res) => {
    const files = req.files || [];
    const title = String(req.body?.title || '').trim();
    const detail = String(req.body?.detail || '').trim();
    if (!title || !detail) {
      removeFiles(files.map((f) => f.filename));
      return res.status(400).json({ error: 'Title and detail are required.' });
    }
    const contact = {
      id: `c_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`,
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email || req.user.phone || null,
      title: title.slice(0, 120),
      detail: detail.slice(0, 5000),
      files: fileRecords(files),
      replies: [],
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    const list = readContacts();
    list.unshift(contact);
    writeContacts(list);
    appendHistory({ actor: req.user.email, action: 'contact.create', entity: contact.id, detail: contact.title });
    res.status(201).json(publicContact(contact));
  });

  // Reply in the thread (sender or admin) while the contact is open.
  router.post('/:id/replies', requireAuth, receiveFiles, (req, res) => {
    const files = req.files || [];
    const fail = (code, error) => {
      removeFiles(files.map((f) => f.filename));
      res.status(code).json({ error });
    };
    const list = readContacts();
    const contact = list.find((c) => c.id === req.params.id);
    if (!contact || !canSee(contact, req.user)) return fail(404, 'Contact not found.');
    if (contact.status === 'resolved') return fail(409, 'This contact is resolved. Replies are closed.');
    const text = String(req.body?.text || '').trim();
    if (!text && !files.length) return fail(400, 'Write a reply or attach a file.');
    const fromAdmin = contact.userId !== req.user.id;
    const reply = {
      id: `r_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`,
      authorId: req.user.id,
      authorName: req.user.name,
      fromAdmin,
      text: text.slice(0, 5000),
      files: fileRecords(files),
      at: new Date().toISOString(),
    };
    contact.replies = [...(contact.replies || []), reply];
    contact.updatedAt = reply.at;
    writeContacts(list);
    appendHistory({ actor: req.user.email, action: 'contact.reply', entity: contact.id, detail: contact.title });
    res.status(201).json(publicContact(contact));
  });

  // The signed-in user's own contacts, newest first.
  router.get('/mine', requireAuth, (req, res) => {
    res.json(readContacts().filter((c) => c.userId === req.user.id).map(publicContact));
  });

  // Every contact (admin).
  router.get('/', requireAdmin, (_req, res) => {
    res.json(readContacts().map(publicContact));
  });

  // Download an attachment: its sender or an admin.
  router.get('/:id/files/:fileId', requireAuth, (req, res) => {
    const contact = readContacts().find((c) => c.id === req.params.id);
    if (!contact || !canSee(contact, req.user)) return res.status(404).json({ error: 'File not found.' });
    const file = [...(contact.files || []), ...(contact.replies || []).flatMap((r) => r.files || [])]
      .find((f) => f.id === req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    res.download(path.join(FILES_DIR, file.stored), file.name, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File not found.' });
    });
  });

  // Mark open / resolved (admin).
  router.patch('/:id', requireAdmin, (req, res) => {
    const status = req.body?.status;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Status must be open or resolved.' });
    const list = readContacts();
    const contact = list.find((c) => c.id === req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found.' });
    contact.status = status;
    contact.updatedAt = new Date().toISOString();
    writeContacts(list);
    appendHistory({ actor: req.user.email, action: 'contact.status', entity: contact.id, detail: `${contact.title} → ${status}` });
    res.json(publicContact(contact));
  });

  // Delete a contact and its files (admin).
  router.delete('/:id', requireAdmin, (req, res) => {
    const list = readContacts();
    const contact = list.find((c) => c.id === req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found.' });
    writeContacts(list.filter((c) => c.id !== contact.id));
    removeFiles([...(contact.files || []), ...(contact.replies || []).flatMap((r) => r.files || [])].map((f) => f.stored));
    appendHistory({ actor: req.user.email, action: 'contact.delete', entity: contact.id, detail: contact.title });
    res.status(204).end();
  });

  return router;
}

module.exports = { createContactsRouter };
