#!/usr/bin/env bash
# One command local demo: chain + contracts + risk agent + dashboard.
# With VEIL_NETWORK=testnet in .env it skips the local chain and uses the testnet deployment.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || node circuits/scripts/env.mjs
set -a; . ./.env; set +a
mkdir -p .logs
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

if [ "${VEIL_NETWORK:-local}" = "local" ]; then
  if ! cast chain-id -r "$LOCAL_RPC_URL" > /dev/null 2>&1; then
    anvil --chain-id 31337 --block-time 1 > .logs/anvil.log 2>&1 &
    PIDS+=($!)
    until cast chain-id -r "$LOCAL_RPC_URL" > /dev/null 2>&1; do sleep 0.3; done
  fi
  VAULT=$(node -e 'try{console.log(require("./contracts/deployments/31337.json").vault)}catch{console.log("")}')
  if [ -z "$VAULT" ] || [ "$(cast code "$VAULT" -r "$LOCAL_RPC_URL")" = "0x" ]; then
    echo "Deploying contracts to the local chain..."
    bash scripts/deploy.sh local > .logs/deploy.log 2>&1 || { tail -20 .logs/deploy.log; exit 1; }
  fi
fi
node scripts/sync-abis.mjs

npm --prefix agent start > .logs/agent.log 2>&1 &
PIDS+=($!)
echo "Risk agent:  http://localhost:${AGENT_PORT:-8787}   (log: .logs/agent.log)"
echo "Dashboard:   http://localhost:3000/dashboard"
npm --prefix web run dev
