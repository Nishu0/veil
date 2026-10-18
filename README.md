# VEIL

A private, compliant, agent-run prime account for real-world assets on Injective.

- **Privacy.** A wallet proves it holds an issuer-signed credential (KYC passed, accredited, jurisdiction not blocked) with a Groth16 zero-knowledge proof. The chain stores a nullifier and an expiry. No name, no allowlist of identities.
- **RWA.** Verified wallets deposit USDT and receive `vRWA`, a permissioned vault share. Every mint and transfer goes through a compliance hook. The vault holds tokenized T-bills and runs a TSLA iAsset perp position through the exchange precompile interface.
- **Agentic AI.** A risk agent trades the vault's exchange subaccount through a scoped, expiring, spend-capped authz grant. It cuts leverage before the weekend oracle freeze and commits a hash of every decision on-chain.

## Run the demo

Requirements: Node 22+, [Foundry](https://getfoundry.sh), and the [opencode](https://opencode.ai) CLI for the agent's LLM.

```bash
npm run setup     # installs packages, generates demo keys into .env
npm run dev       # local chain + deploy + risk agent + dashboard
```

Open http://localhost:3000/dashboard.

| Command | What it does |
| --- | --- |
| `npm test` | Foundry tests (16), including real Groth16 proofs |
| `npm run e2e` | Credential → proof → register → deposit against the running local chain |
| `npm run circuit` | Rebuild the circuit, verifier contract and test fixtures |
| `npm run deploy:testnet` | Deploy to Injective EVM testnet (chain 1439) |

### Demo script (3 minutes)

1. **Blocked.** Get a credential and verify your own wallet, deposit, then send vRWA to the friend wallet. The chain rejects it with `TransferRestricted`.
2. **Private pass.** Verify the friend wallet with a ZK proof and send again. It passes, and the registry holds only a nullifier and an expiry.
3. **Hedge.** After the deposit the agent opens a TSLA short through the exchange under its mandate.
4. **Weekend gap.** Switch the session to "Friday pre-close". The agent de-levers to the gap-safe level and logs why. Switch to "Weekend", then "Monday open with gap +12%", then try to liquidate: the position survives.
5. **Bounded agent.** "Attempt over-limit order" and "Attempt withdrawal": the exchange reverts both and the attempts are logged.

### Injective testnet

The Injective faucet is captcha-protected, so funding is manual:

1. Take `DEPLOYER_ADDRESS` from `.env` and request INJ at https://testnet.faucet.injective.network.
2. `npm run deploy:testnet`
3. Set `VEIL_NETWORK=testnet` in `.env` and run `npm run dev`.

The deploy sends 0.2 INJ to the agent for gas. The dashboard's faucet sends 0.05 INJ to each burner wallet, so keep about 1 INJ on the deployer.

### LLM (opencode + DeepSeek)

The agent calls `opencode run -m $VEIL_LLM_MODEL`. The default is `opencode/deepseek-v4.1-flash-free`, which works without a login. To use an OpenCode Go plan, run `opencode auth login`, find the Go DeepSeek model id with `opencode models`, and set `VEIL_LLM_MODEL` in `.env`.

The model proposes a leverage and writes the rationale. It cannot exceed the limits in `agent/src/config.ts`: its number is clamped, and if it times out or returns junk the deterministic policy value is used and the decision is marked as a fallback.

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

**Audit trail.** The agent hashes the exact JSON record of each decision (inputs, policy, model output, transactions) and stores the hash in `AgentLog`. The dashboard recomputes it to show the record was not edited.

## What is real and what is mocked

| Piece | Status |
| --- | --- |
| Groth16 circuit, on-chain verifier, registry, nullifiers | Real. Trusted setup is a local single-party ceremony, for demo use only |
| Permissions hook, vRWA, vault, NAV, agent log | Real contracts |
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

Not checked against the live testnet yet: whether iAsset markets exist there, and precompile behaviour under the patched Foundry.

## Layout

```
circuits/   credential.circom, build script, issue/prove helpers, fixtures
contracts/  Foundry project: src/, src/mocks/, src/injective/ (precompile interfaces), test/, script/
agent/      TypeScript risk agent (viem, opencode CLI), HTTP API on :8787
web/        Next.js + Tailwind + shadcn dashboard, API routes for faucet, issuer and simulator
shared/     contracts.json: ABIs and deployments, generated by scripts/sync-abis.mjs
scripts/    dev.sh, deploy.sh
```

`.env` holds throwaway demo keys generated on your machine. It is gitignored. Do not reuse those keys for anything with value.
