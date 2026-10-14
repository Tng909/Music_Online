'use strict';
/** Shared JSON-file history log (server/data/history.json), newest first. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HISTORY_PATH = path.join(__dirname, 'data', 'history.json');
const HISTORY_LIMIT = 2000;

function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function appendHistory(entry) {
  const log = readHistory();
  log.unshift({
    id: `h_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`,
    at: new Date().toISOString(),
    ...entry,
  });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(log.slice(0, HISTORY_LIMIT), null, 2) + '\n', 'utf8');
}

module.exports = { readHistory, appendHistory };
