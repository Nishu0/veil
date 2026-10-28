#!/usr/bin/env bash
# Compiles the credential circuit, runs a local (demo-only) Groth16 setup and
# exports the Solidity verifier + browser proving artifacts.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
npx circom2 credential.circom --r1cs --wasm -l node_modules -o build
S="npx snarkjs"
if [ ! -f build/pot_final.ptau ]; then
  $S powersoftau new bn128 14 build/pot_0.ptau
  $S powersoftau contribute build/pot_0.ptau build/pot_1.ptau --name="veil-demo" -e="veil demo entropy $(date +%s)"
  $S powersoftau prepare phase2 build/pot_1.ptau build/pot_final.ptau
fi
$S groth16 setup build/credential.r1cs build/pot_final.ptau build/credential_0.zkey
$S zkey contribute build/credential_0.zkey build/credential.zkey --name="veil-demo" -e="veil zkey entropy $(date +%s)"
$S zkey export verificationkey build/credential.zkey build/vkey.json
mkdir -p ../contracts/src/zk ../web/public/zk
$S zkey export solidityverifier build/credential.zkey ../contracts/src/zk/Groth16Verifier.sol
cp build/credential_js/credential.wasm build/credential.zkey build/vkey.json ../web/public/zk/
echo "circuit build OK"
