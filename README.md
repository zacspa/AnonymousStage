# AnonymousStage

Live music streaming with anonymous chat. The performer runs everything locally — GitHub Pages serves the static frontend, a Cloudflare Tunnel exposes the stream to the internet.

## Architecture

```
YOUR MACHINE (only when performing)
├── LiveKit Server (Docker)  — WebRTC SFU: 1 stream → N viewers
├── Token + Proxy Server     — Express: mints JWTs, proxies LiveKit
└── cloudflared tunnel       — Exposes everything as HTTPS

GitHub Pages (always up)
└── Static HTML/JS/CSS
```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Node.js](https://nodejs.org/) (18+)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (`brew install cloudflared`)

## Quick Start

```bash
./start.sh
```

This starts LiveKit, the token server, and a Cloudflare tunnel. It prints shareable URLs when ready.

## Usage

1. Run `./start.sh` — wait for the tunnel URL
2. Open the **performer URL** in your browser, grant mic access, click "Go Live"
3. Share the **viewer URL** with your audience
4. Chat works for everyone via LiveKit data channels

## File Structure

```
├── index.html              # Main page
├── style.css               # Dark stage theme
├── js/
│   ├── app.js              # Entry point, URL routing, UI state
│   ├── stream.js           # LiveKit connection, track pub/sub
│   └── chat.js             # Data channel chat
├── server/
│   ├── docker-compose.yml  # LiveKit container
│   ├── livekit.yaml        # LiveKit config
│   ├── token.js            # Token server + LiveKit reverse proxy
│   └── package.json
├── start.sh                # One-command launcher
└── README.md
```
