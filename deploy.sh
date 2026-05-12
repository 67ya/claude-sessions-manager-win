#!/bin/bash
# Deploy script - git pull, build, restart
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-3457}"

echo "=== Deploying Claude Sessions Manager ==="

# 1. Pull latest
echo "[1/4] Pulling from GitHub..."
cd "$DIR"
git pull origin master

# 2. Install dependencies (in case updated)
echo "[2/4] Installing dependencies..."
cd "$DIR/server" && npm install --silent
cd "$DIR/client" && npm install --silent

# 3. Build frontend
echo "[3/4] Building frontend..."
cd "$DIR/client" && npx vite build

# 4. Restart service
echo "[4/4] Restarting server..."
systemctl --user restart claude-sessions 2>/dev/null || {
  # Fallback: kill old, start new
  kill $(lsof -ti:$PORT) 2>/dev/null || true
  sleep 1
  cd "$DIR/server" && nohup npx tsx src/index.ts > /tmp/csm-server.log 2>&1 &
}

sleep 2
echo ""
echo "Deployed! http://localhost:$PORT"
curl -s http://localhost:$PORT/api/health | python3 -m json.tool 2>/dev/null || echo "Check server logs"
