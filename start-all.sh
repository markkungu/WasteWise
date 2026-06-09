#!/usr/bin/env bash
# start-all.sh — Launch all WasteWise services locally (no Docker)
# Usage: bash start-all.sh
# Run from the project root directory.

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== WasteWise — Starting all services ==="

# Kill any existing service processes
pkill -f "uvicorn app:app" 2>/dev/null || true
pkill -f "node src/index.js" 2>/dev/null || true
pkill -f "hardhat node" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 1

# 1. AI Verification Service (port 8001)
echo "[1] Starting AI Verification Service on :8001 ..."
cd "$ROOT/ai-verification"
uvicorn app:app --host 0.0.0.0 --port 8001 > /tmp/wastewise-ai.log 2>&1 &
AI_PID=$!

# 2. Optimization Service (port 8002)
echo "[2] Starting Optimization Service on :8002 ..."
cd "$ROOT/optimization"
uvicorn app:app --host 0.0.0.0 --port 8002 > /tmp/wastewise-opt.log 2>&1 &
OPT_PID=$!

# 3. Backend API (port 5000)
echo "[3] Starting Backend API on :5000 ..."
cd "$ROOT/server"
node src/index.js > /tmp/wastewise-api.log 2>&1 &
API_PID=$!

# 4. Hardhat local blockchain node (port 8545)
echo "[4] Starting Hardhat local node on :8545 ..."
cd "$ROOT/blockchain"
NODE_OPTIONS=--no-warnings npx hardhat node --port 8545 > /tmp/wastewise-hardhat.log 2>&1 &
HARDHAT_PID=$!

# 5. Web client (port 5173)
echo "[5] Starting Web Client on :5173 ..."
cd "$ROOT/web-client"
npm run dev -- --host > /tmp/wastewise-web.log 2>&1 &
WEB_PID=$!

# ── Wait for each service with retry loop ─────────────────────────────────────

wait_http() {
  local name="$1" url="$2" max="${3:-90}" interval=3
  local elapsed=0
  while [ $elapsed -lt $max ]; do
    if curl -sf "$url" > /dev/null 2>&1; then
      return 0
    fi
    sleep $interval
    elapsed=$((elapsed + interval))
  done
  return 1
}

wait_rpc() {
  local max="${1:-90}" interval=3 elapsed=0
  while [ $elapsed -lt $max ]; do
    if curl -sf -X POST http://localhost:8545 \
         -H 'Content-Type: application/json' \
         --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' > /dev/null 2>&1; then
      return 0
    fi
    sleep $interval
    elapsed=$((elapsed + interval))
  done
  return 1
}

echo ""
echo "=== Waiting for services to be ready (up to 90s each) ==="

if wait_http "Backend API" http://localhost:5000/health; then
  echo "  Backend API:    ok — http://localhost:5000"
else
  echo "  Backend API:    NOT READY (check /tmp/wastewise-api.log)"
fi

if wait_http "AI Service" http://localhost:8001/health; then
  echo "  AI Service:     ok — http://localhost:8001"
else
  echo "  AI Service:     NOT READY (check /tmp/wastewise-ai.log)"
fi

if wait_http "Optimization" http://localhost:8002/health 120; then
  echo "  Optimization:   ok — http://localhost:8002"
else
  echo "  Optimization:   NOT READY (check /tmp/wastewise-opt.log)"
fi

if wait_rpc 90; then
  CHAIN=$(curl -sf -X POST http://localhost:8545 \
    -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
    | python3 -c "import sys,json; print(int(json.load(sys.stdin)['result'],16))" 2>/dev/null)
  echo "  Hardhat Node:   ok — http://localhost:8545 (chainId=$CHAIN)"
else
  echo "  Hardhat Node:   NOT READY (check /tmp/wastewise-hardhat.log)"
fi

if wait_http "Web Client" http://localhost:5173 60; then
  echo "  Web Client:     ok — http://localhost:5173"
else
  echo "  Web Client:     NOT READY (check /tmp/wastewise-web.log)"
fi

echo ""
echo "Log files: /tmp/wastewise-{ai,opt,api,hardhat,web}.log"
echo "PIDs: AI=$AI_PID  OPT=$OPT_PID  API=$API_PID  HARDHAT=$HARDHAT_PID  WEB=$WEB_PID"
