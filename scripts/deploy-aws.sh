#!/usr/bin/env bash
# Deploys the testnet build to the EC2 host: syncs the repo, writes the server .env, builds and starts the stack.
#   bash scripts/deploy-aws.sh            (HOST and KEY can be overridden via env)
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${HOST:-ubuntu@13.126.86.226}"
KEY="${KEY:-veil.pem}"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"

[ -f contracts/deployments/1439.json ] || { echo "No testnet deployment found. Run: npm run deploy:testnet"; exit 1; }
node scripts/sync-abis.mjs

echo "== Docker on the server"
$SSH "$HOST" 'command -v docker >/dev/null || (curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER)'

echo "== Syncing files"
rsync -az --delete -e "$SSH" \
  --exclude .git --exclude '.env' --exclude '.env.*' --exclude '*.pem' --exclude .logs \
  --exclude node_modules --exclude .next \
  --exclude contracts/out --exclude contracts/cache --exclude contracts/lib --exclude contracts/broadcast \
  --exclude circuits/build --exclude circuits/node_modules --exclude agent/data \
  ./ "$HOST":veil/

echo "== Server .env (testnet)"
# Same throwaway testnet keys as local, switched to testnet, with the agent served under /agent.
grep -v -E '^(VEIL_NETWORK|AGENT_PUBLIC_URL)=' .env | { cat; echo "VEIL_NETWORK=testnet"; echo "AGENT_PUBLIC_URL=/agent"; } | $SSH "$HOST" 'umask 077 && cat > veil/.env'

echo "== Build and start"
$SSH "$HOST" 'cd veil && sudo docker compose up -d --build && sudo docker compose ps'
