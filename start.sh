#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/server"
PIDS=()

cleanup() {
  echo ""
  echo "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  echo "✓ All services stopped."
  exit 0
}
trap cleanup SIGINT SIGTERM

# 1. Install token server dependencies if needed
if [ ! -d "$SERVER_DIR/node_modules" ]; then
  echo "Installing token server dependencies..."
  (cd "$SERVER_DIR" && npm install --silent)
fi

# 2. Start LiveKit natively
echo "Starting LiveKit server..."
livekit-server --config "$SERVER_DIR/livekit.yaml" &
PIDS+=($!)
sleep 1
echo "✓ LiveKit server running on :7880"

# 3. Generate performer secret and start token server
export PERFORMER_SECRET=$(openssl rand -hex 16)
node "$SERVER_DIR/token.js" &
PIDS+=($!)
sleep 1

# 4. Start cloudflared tunnel (tunnels token server which proxies LiveKit)
echo "Starting Cloudflare tunnel..."
echo "(If cloudflared is not installed: brew install cloudflared)"
echo ""

cloudflared tunnel --url http://localhost:3001 --no-autoupdate 2>&1 | while IFS= read -r line; do
  if echo "$line" | grep -qo 'https://[a-z0-9-]*\.trycloudflare\.com'; then
    TUNNEL_URL=$(echo "$line" | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com')
    TUNNEL_HOST=$(echo "$TUNNEL_URL" | sed 's|https://||')
    echo ""
    echo "============================================"
    echo "  AnonymousStage is LIVE!"
    echo "============================================"
    echo ""
    echo "  Audience link:"
    echo "  https://zacspa.github.io/AnonymousStage#wss=$TUNNEL_HOST"
    echo ""
    echo "  Performer login:"
    echo "  http://localhost:3001/perform"
    echo "  Secret: $PERFORMER_SECRET"
    echo ""
    echo "  Press Ctrl+C to stop everything."
    echo "============================================"
  fi
done &
PIDS+=($!)

# Keep running until Ctrl+C
wait
