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

# 2. Detect IPs
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
echo "Detecting public IP..."
PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me || echo "")

echo "LAN IP: $LAN_IP"
if [ -n "$PUBLIC_IP" ]; then
  echo "Public IP: $PUBLIC_IP"
  export PUBLIC_IP
else
  echo "Could not detect public IP — LAN-only mode"
fi

# 3. Generate livekit.yaml with LAN IP (performer connects locally)
# Remote viewers get ICE candidates rewritten to public IP by the frontend
cat > "$SERVER_DIR/livekit.yaml" <<YAML
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50020
  node_ip: $LAN_IP
  stun_servers:
    - stun.l.google.com:19302
    - stun1.l.google.com:19302
keys:
  devkey: devsecret
logging:
  level: info
YAML

# 4. Start LiveKit natively
echo "Starting LiveKit server..."
livekit-server --config "$SERVER_DIR/livekit.yaml" &
PIDS+=($!)
sleep 1
echo "✓ LiveKit server running on :7880 (node IP: $NODE_IP)"

# 5. Generate performer secret and start token server
export PERFORMER_SECRET=$(openssl rand -hex 16)
node "$SERVER_DIR/token.js" &
PIDS+=($!)
sleep 1

# 6. Start cloudflared tunnel (tunnels token server which proxies LiveKit)
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
