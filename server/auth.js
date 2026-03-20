const express = require('express');
const crypto = require('crypto');

const router = express.Router();

// Generated fresh each time start.sh launches
const PERFORMER_SECRET = process.env.PERFORMER_SECRET || crypto.randomBytes(16).toString('hex');
const activeSessions = new Set();

router.get('/verify', (req, res) => {
  const secret = req.query.secret;
  if (secret === PERFORMER_SECRET) {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    activeSessions.add(sessionToken);
    res.json({ ok: true, sessionToken });
  } else {
    res.json({ ok: false });
  }
});

function hasValidSession(token) {
  return activeSessions.has(token);
}

function getSecret() {
  return PERFORMER_SECRET;
}

module.exports = { router, hasValidSession, getSecret };
