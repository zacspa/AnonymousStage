#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/server"
PIDS=()

CONTAINER_NAME="anonymousstage-livekit"

cleanup() {
  echo ""
  echo "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
  echo "✓ All services stopped."
  exit 0
}
trap cleanup SIGINT SIGTERM

# 1. Install token server dependencies if needed
if [ ! -d "$SERVER_DIR/node_modules" ]; then
  echo "Installing token server dependencies..."
  (cd "$SERVER_DIR" && npm install --silent)
fi

# 2. Start LiveKit via Docker
echo "Starting LiveKit server..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER_NAME" \
  -p 7880:7880 \
  -p 7881:7881 \
  -p 50000-50020:50000-50020/udp \
  -v "$SERVER_DIR/livekit.yaml:/etc/livekit.yaml:ro" \
  livekit/livekit-server:latest \
  --config /etc/livekit.yaml
echo "✓ LiveKit server running on :7880"

# 3. Start token server
node "$SERVER_DIR/token.js" &
PIDS+=($!)

# Wait briefly for token server to start
sleep 1

# 4. Start cloudflared tunnel (tunnels token server which proxies LiveKit)
echo "Starting Cloudflare tunnel..."
echo "(If cloudflared is not installed: brew install cloudflared)"
echo ""

cloudflared tunnel --url http://localhost:3001 --no-autoupdate 2>&1 | while IFS= read -r line; do
  # Look for the tunnel URL in cloudflared output
  if echo "$line" | grep -qo 'https://[a-z0-9-]*\.trycloudflare\.com'; then
    TUNNEL_URL=$(echo "$line" | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com')
    TUNNEL_HOST=$(echo "$TUNNEL_URL" | sed 's|https://||')
    echo ""
    echo "============================================"
    echo "  AnonymousStage is LIVE!"
    echo "============================================"
    echo ""
    echo "  Share with your audience:"
    echo "  https://zsparks.github.io/AnonymousStage#wss=$TUNNEL_HOST"
    echo ""
    echo "  Open performer view:"
    echo "  https://zsparks.github.io/AnonymousStage#perform&wss=$TUNNEL_HOST"
    echo ""
    echo "  (Or open locally: file://$SCRIPT_DIR/index.html#perform&wss=$TUNNEL_HOST)"
    echo ""
    echo "  Press Ctrl+C to stop everything."
    echo "============================================"
  fi
done &
PIDS+=($!)

# Keep running until Ctrl+C
wait
