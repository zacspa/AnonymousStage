const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { AccessToken } = require('livekit-server-sdk');
const cors = require('cors');
const { router: authRouter, hasValidSession, getSecret } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devsecret';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'http://localhost:7880';
const ROOM_NAME = 'stage';
const PORT = process.env.TOKEN_PORT || 3001;

// Serve static files (performer page, CSS, JS)
app.use('/js', express.static(path.join(__dirname, '..', 'js')));
app.use('/style.css', express.static(path.join(__dirname, '..', 'style.css')));

// Auth routes
app.use('/auth', authRouter);

// Performer page
app.get('/perform', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'perform.html'));
});

// Token endpoint
app.get('/token', async (req, res) => {
  const name = req.query.name || `Listener-${Math.floor(1000 + Math.random() * 9000)}`;
  const isPerformer = req.query.performer === 'true';

  // Performer tokens require valid session
  if (isPerformer) {
    const session = req.query.session;
    if (!session || !hasValidSession(session)) {
      return res.status(403).json({ error: 'Unauthorized — authenticate with your security key' });
    }
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: name,
    name: name,
  });

  at.addGrant({
    room: ROOM_NAME,
    roomJoin: true,
    canPublish: isPerformer,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  res.json({ token, publicIp: process.env.PUBLIC_IP || '' });
});

// Proxy everything else (including WebSocket upgrades) to LiveKit
const livekitProxy = createProxyMiddleware({
  target: LIVEKIT_URL,
  changeOrigin: true,
  ws: true,
});

app.use('/', livekitProxy);

const server = app.listen(PORT, () => {
  console.log(`✓ Token server running on :${PORT} (proxying LiveKit at ${LIVEKIT_URL})`);
  console.log(`✓ Performer secret: ${getSecret()}`);
});

server.on('upgrade', (req, socket, head) => {
  livekitProxy.upgrade(req, socket, head);
});
