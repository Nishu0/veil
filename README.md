# VEIL

A private, compliant, agent-run prime account for real-world assets on Injective.

- **Privacy.** A wallet proves it holds an issuer-signed credential (KYC passed, accredited, jurisdiction not blocked) with a Groth16 zero-knowledge proof. The chain stores a nullifier and an expiry. No name, no allowlist of identities.
- **RWA.** Verified wallets deposit USDT and receive `vRWA`, a permissioned vault share. Every mint and transfer goes through a compliance hook. The vault holds tokenized T-bills and runs a TSLA iAsset perp position through the exchange precompile interface.
- **Agentic AI.** A risk agent trades the vault's exchange subaccount through a scoped, expiring, spend-capped authz grant. It cuts leverage before the weekend oracle freeze and commits a hash of every decision on-chain.

Site: [veilrwa.xyz](https://veilrwa.xyz) · App: `/dashboard` (also `/demo`) · Deck: `/deck`

## Status

| | |
| --- | --- |
| Injective EVM testnet (chain 1439) | All 10 contracts deployed. A ZK proof has been registered and verified on-chain ([tx](https://testnet.blockscout.injective.network/tx/0x4272bee38af19e967532fbec69d270d3d6e5489ebb86c9e0594eebf1586b2167), 317,443 gas) |
| Local chain | Full flow run end to end: credential, proof, deposit, blocked and allowed transfers, agent hedge, weekend de-lever, mandate probes |
| Tests | 16 Foundry tests pass, using real Groth16 proofs |
| Not done yet | Deposit, transfer and agent trading have not been exercised on testnet. Contracts are not source-verified on Blockscout. The exchange, oracle, USDT and T-bill are mocks (see below) |

### Testnet addresses

Explorer: `https://testnet.blockscout.injective.network/address/<address>`

| Contract | Address |
| --- | --- |
| VeilVault | `0xD899a55Fe756c242e4538b9E07f0A443bA8F9202` |
| vRWA | `0x1439Ab19bB31E43E5a9123f320EF0f15C9360Fe1` |
| ZkComplianceRegistry | `0x87dD6356e199a3Aa6063E966015D1Ad4966B685C` |
| Groth16Verifier | `0x98aE6AC1d2c296B6E95d3d501E290Fb469a16262` |
| VeilPermissionsHook | `0xed4458a3B6E92a230F141F90b0341786a0D186Bf` |
| AgentLog | `0xc5489Fc1fABF65F85BAE321b4b8BaE372bAF9665` |
| MockExchange | `0x36563B7E0c4f802f3d5e5160DbF48A081107d007` |
| MockOracle | `0x62630a2ef954ce98B2959Cc9725027d51164d631` |
| MockTBill | `0x1d1383D0148d316db7d0d3ab3d084C2F568dbdcb` |
| MockUSDT | `0x3A66a81E9C114C9Eb8c06d4Fcd4a6916598C6DBA` |

## Run it locally

Requirements: Node 22+, [Foundry](https://getfoundry.sh), and the [opencode](https://opencode.ai) CLI for the agent's LLM.

```bash
npm run setup     # installs packages, generates demo keys into .env
npm run dev       # local chain + deploy + risk agent + website
```

Open http://localhost:3000. Run it from the repo root: the script starts the chain and the agent as well as the site.

| Command | What it does |
| --- | --- |
| `npm test` | Foundry tests, including real Groth16 proofs |
| `npm run e2e` | Credential → proof → register → deposit against the running local chain |
| `npm run circuit` | Rebuild the circuit, verifier contract and test fixtures |
| `npm run deploy:testnet` | Deploy to Injective EVM testnet |
| `node circuits/scripts/smoke-testnet.mjs` | Register a fresh proof on testnet |
| `bash scripts/deploy-aws.sh` | Deploy the testnet build to the server |

To point the local app at testnet, set `VEIL_NETWORK=testnet` in `.env` and restart.

### The app

| Screen | What you do there |
| --- | --- |
| Overview | NAV, share price, leverage, mandate, and a checklist of the demo steps |
| Identity | Mock KYC, then build a ZK proof in the browser and register it. Same for a second "friend" wallet |
| Invest & transfer | Faucet, deposit, redeem, and send vRWA or USDT. All signed by your wallet |
| Vault | Allocation, hedge position, agent mandate, and a manual desk to trade or to grant and revoke the mandate |
| Risk agent | Status, decision log with on-chain hash check, and the two out-of-mandate probes |
| Market simulator | Trading session, Monday gap, price, T-bill yield, liquidation test |

**Wallets.** Connect a browser wallet (wallets are discovered by name via EIP-6963, MetaMask preferred, and the network is added for you) or continue with a demo wallet, a throwaway key kept in the browser.

**Demo script.**

1. Verify your wallet, deposit, then send vRWA to the friend wallet: rejected with `TransferRestricted`.
2. Verify the friend wallet and send again: it passes, and the registry holds only a nullifier and an expiry.
3. After the deposit the agent opens a TSLA short through the exchange under its mandate.
4. Set "Friday pre-close": the agent de-levers and logs why. Then "Weekend", then "Monday open with gap", then try to liquidate: the position survives.
5. "Attempt an over-limit order" and "Attempt a withdrawal": the exchange reverts both and the attempts are logged.

### LLM (opencode + DeepSeek)

The agent calls `opencode run -m $VEIL_LLM_MODEL`. The default is `opencode/deepseek-v4.1-flash-free`, which works without a login. To use an OpenCode Go plan, run `opencode auth login`, find the Go DeepSeek model id with `opencode models`, and set `VEIL_LLM_MODEL` in `.env`.

The model proposes a leverage and writes the rationale. It cannot exceed the limits in `agent/src/config.ts`: its number is clamped, and if it times out or returns junk the deterministic policy value is used and the decision is marked as a fallback.

## Hosting

The production stack is three containers (`compose.yaml`): the Next.js site, the risk agent, and Caddy in front for automatic HTTPS. The agent's API is served on the same origin under `/agent`.

```bash
bash scripts/deploy-aws.sh     # HOST=ubuntu@<ip> KEY=<key.pem> to override
```

The script installs Docker if needed, syncs the repo, writes the server's `.env` (the local one, switched to testnet), then builds and starts the stack. Caddy issues certificates for `veilrwa.xyz` and `www.veilrwa.xyz` once their DNS A records point at the server, and serves plain HTTP on the server's IP in the meantime. Ports 80 and 443 must be open in the security group.

On a public deployment the faucet is rationed (one gas top-up per wallet, a daily cap, a cooldown on USDT) because it spends the deployer's testnet INJ. The simulator and manual-desk controls are open to every visitor: they are demo controls signed by the vault-owner key on the server.

## How it works

```
 wallet ── ZK proof (Groth16, built in the browser) ──► ZkComplianceRegistry   nullifier + expiry only
                                                              ▲
                                             isTransferRestricted(from, to, amount)
                                                    VeilPermissionsHook
                                                              ▲
 wallet ── deposit USDT ──► VeilVault ── mint ──► vRWA (permissioned share)
                               ├─ 60%  tBILL (tokenized treasury)
                               ├─ 30%  exchange subaccount ── TSLA iAsset perp
                               ├─ 10%  idle, for redemptions
                               └─ approve(agent, [CreateDerivativeLimitOrder, IncreasePositionMargin], 2,500 USDT, 7d)
                                                              ▲
 risk agent ── orders with sender = vault ────────────────────┘
      └─ keccak256(decision record) ──► AgentLog
```

**Credential.** The issuer signs `Poseidon(secretCommit, nameHash, kyc, jurisdiction, accredited, expiry)` with EdDSA. It sees only a commitment to the holder's secret, so it cannot compute the nullifier `Poseidon(secret, 1)` and cannot link a wallet to a person. The proof's public inputs are the issuer key, the wallet (so a front-runner cannot replay it), the nullifier, the expiry and the blocklist. A credential from a blocked jurisdiction, or without accreditation, has no valid proof.

**Weekend gap guard.** Leverage is capped at `1 / (N·σ + maintenance)`. With σ = 6.3% for the Friday-to-Monday move, N = 4 and 5% maintenance that is 3.31x, against 6x on weekdays. De-levering is a reduce-only order followed by re-posting the released margin.

**Audit trail.** The agent hashes the exact JSON record of each decision (inputs, policy, model output, transactions) and stores the hash in `AgentLog`. The app recomputes it to show the record was not edited.

## What is real and what is mocked

| Piece | Status |
| --- | --- |
| Groth16 circuit, on-chain verifier, registry, nullifiers | Real. Trusted setup is a local single-party ceremony, for demo use only |
| Permissions hook, vRWA, vault, NAV, agent log | Real contracts |
| Wallet-signed deposits, redemptions, transfers | Real transactions |
| Agent policy, execution, LLM rationale, hash commitments | Real |
| KYC issuer | Mock: approves anyone and signs what it is given |
| USDT, tBILL | Mock ERC20s. tBILL accrues a fixed 5% APY |
| Oracle | Mock with the weekend freeze. Injective uses Pyth/SEDA |
| Exchange precompile | `MockExchange`: same signatures and structs as Injective's `IExchangeModule` for the subset used, with authz grants, spend limits and expiry. No orderbook: marketable orders fill at the mark. No fees or funding |
| Permissions module | vRWA calls the hook from its own transfer path. On Injective the hook is registered on the denom's namespace and the chain calls it |

### Moving to the real Injective modules

- Point `VeilVault` at the precompile `0x0000000000000000000000000000000000000065` and a real iAsset market id. The vault already codes against `IExchangeModule` (copied from `InjectiveLabs/solidity-contracts`).
- Issue vRWA as a `MintBurnBankERC20` and register `VeilPermissionsHook` on its namespace. `isTransferRestricted`'s exact signature must be checked against the current permissions module.
- Replace `MockOracle` with a Pyth pull feed and `MockTBill` with a real tokenized treasury.
- `MockExchange.grantInfo` is a mock-only view. On-chain, read the remaining spend limit from the authz grant.

## Layout

```
circuits/   credential.circom, build script, issue/prove helpers, fixtures, smoke tests
contracts/  Foundry project: src/, src/mocks/, src/injective/ (precompile interfaces), test/, script/, deployments/
agent/      TypeScript risk agent (viem, opencode CLI), HTTP API on :8787
web/        Next.js + Tailwind + shadcn: landing page, dashboard, /deck, API routes for faucet, issuer, simulator
shared/     contracts.json: ABIs and deployments, generated by scripts/sync-abis.mjs
deploy/     Caddyfile
scripts/    dev.sh, deploy.sh, deploy-aws.sh
```

`.env` holds throwaway demo keys generated on your machine, and `*.pem` is the server key. Both are gitignored. Do not reuse those keys for anything with value.
