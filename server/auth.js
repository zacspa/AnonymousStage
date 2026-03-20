const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const router = express.Router();

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const RP_NAME = 'AnonymousStage';
const RP_ID = 'localhost';
const ORIGIN = 'http://localhost:3001';

let currentChallenge = null;
const activeSessions = new Set();

function readCredentials() {
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')).credentials || [];
  } catch {
    return [];
  }
}

function writeCredentials(creds) {
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ credentials: creds }, null, 2));
}

// --- Registration ---

router.get('/register-options', async (req, res) => {
  const creds = readCredentials();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: 'performer',
    userDisplayName: 'Performer',
    attestationType: 'none',
    excludeCredentials: creds.map(c => ({
      id: c.id,
      transports: c.transports,
    })),
    authenticatorSelection: {
      residentKey: 'discouraged',
      userVerification: 'discouraged',
    },
  });

  currentChallenge = options.challenge;
  res.json(options);
});

router.post('/register-verify', async (req, res) => {
  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: currentChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      const creds = readCredentials();
      creds.push({
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64'),
        counter: credential.counter,
        transports: req.body.response?.transports || [],
      });
      writeCredentials(creds);
      res.json({ verified: true });
    } else {
      res.json({ verified: false });
    }
  } catch (err) {
    console.error('Registration error:', err);
    res.status(400).json({ error: err.message });
  }
});

// --- Authentication ---

router.get('/login-options', async (req, res) => {
  const creds = readCredentials();
  if (creds.length === 0) {
    return res.json({ noCredentials: true });
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: creds.map(c => ({
      id: c.id,
      transports: c.transports,
    })),
    userVerification: 'discouraged',
  });

  currentChallenge = options.challenge;
  res.json(options);
});

router.post('/login-verify', async (req, res) => {
  try {
    const creds = readCredentials();
    const credential = creds.find(c => c.id === req.body.id);
    if (!credential) {
      return res.status(400).json({ error: 'Unknown credential' });
    }

    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: currentChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credential.id,
        publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64')),
        counter: credential.counter,
        transports: credential.transports,
      },
    });

    if (verification.verified) {
      // Update counter
      credential.counter = verification.authenticationInfo.newCounter;
      writeCredentials(creds);

      // Create session token
      const sessionToken = crypto.randomBytes(32).toString('hex');
      activeSessions.add(sessionToken);
      res.json({ verified: true, sessionToken });
    } else {
      res.json({ verified: false });
    }
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(400).json({ error: err.message });
  }
});

function hasValidSession(token) {
  return activeSessions.has(token);
}

module.exports = { router, hasValidSession };
