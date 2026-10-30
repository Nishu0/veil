#!/usr/bin/env bash
# Deploys VEIL to the local devnet or Injective EVM testnet (chain 1439) and refreshes shared/contracts.json.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
NET="${1:-local}"
if [ "$NET" = "testnet" ]; then
  RPC="$TESTNET_RPC_URL"
  BAL=$(cast balance "$DEPLOYER_ADDRESS" -r "$RPC")
  if [ "$BAL" = "0" ]; then
    echo "Deployer $DEPLOYER_ADDRESS has no testnet INJ."
    echo "Fund it at https://testnet.faucet.injective.network (paste the 0x address), then re-run: npm run deploy:testnet"
    exit 1
  fi
else
  RPC="$LOCAL_RPC_URL"
  cast rpc anvil_setBalance "$DEPLOYER_ADDRESS" 0x56BC75E2D63100000 -r "$RPC" > /dev/null
fi
(cd contracts && forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --slow)
node scripts/sync-abis.mjs
if [ "$NET" = "testnet" ]; then
  echo "Deployed to Injective EVM testnet. Set VEIL_NETWORK=testnet in .env, then restart the agent and the web app."
fi
