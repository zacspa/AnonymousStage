const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { AccessToken } = require('livekit-server-sdk');
const cors = require('cors');

const app = express();
app.use(cors());

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devsecret';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'http://localhost:7880';
const ROOM_NAME = 'stage';
const PORT = process.env.TOKEN_PORT || 3001;

// Token endpoint
app.get('/token', async (req, res) => {
  const name = req.query.name || `Listener-${Math.floor(1000 + Math.random() * 9000)}`;
  const isPerformer = req.query.performer === 'true';

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
  res.json({ token });
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
});

// Handle WebSocket upgrade for LiveKit signaling
server.on('upgrade', (req, socket, head) => {
  livekitProxy.upgrade(req, socket, head);
});
