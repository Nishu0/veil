"use client";
// Browser-side VEIL SDK. All UI components should go through this file.
// Amount conventions: USDT / vRWA / tBILL use 6 decimals; prices, quantities and margins use 18.
import {
  BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, encodeFunctionData, defineChain, formatUnits, getAddress, http, numberToHex, parseUnits,
  type Abi, type Address, type Hex, type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { poseidon1, poseidon2 } from "poseidon-lite";

// ------------------------------------------------------------------ config

export type VeilConfig = {
  chainId: number;
  networkName: string;
  rpcUrl: string;
  explorerUrl: string | null; // null on the local devnet
  agentUrl: string;
  addresses: Record<
    "usdt" | "tbill" | "oracle" | "exchange" | "verifier" | "registry" | "hook" | "vault" | "vrwa" | "agentLog" | "agent" | "deployer",
    Address
  > & { marketID: string; subaccountID: string };
  abis: Record<"VeilVault" | "VRWA" | "ZkComplianceRegistry" | "VeilPermissionsHook" | "AgentLog" | "MockUSDT" | "MockTBill" | "MockOracle" | "MockExchange", Abi>;
  issuer: { ax: string; ay: string };
  blockedJurisdictions: string[];
};

let _config: Promise<VeilConfig> | null = null;
export function getConfig(): Promise<VeilConfig> {
  _config ??= fetch("/api/config").then(async (r) => {
    const j = await r.json();
    if (!r.ok) { _config = null; throw new Error(j.error ?? "config unavailable"); }
    return j as VeilConfig;
  });
  return _config;
}

function chainOf(c: VeilConfig) {
  return defineChain({
    id: c.chainId, name: c.networkName,
    nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
    rpcUrls: { default: { http: [c.rpcUrl] } },
  });
}
let _pub: PublicClient | null = null;
async function pub() {
  const c = await getConfig();
  _pub ??= createPublicClient({ chain: chainOf(c), transport: http(c.rpcUrl) });
  return _pub;
}

/** Explorer link for a tx or address, or null when there is no explorer (local devnet). */
export function explorerLink(c: VeilConfig, kind: "tx" | "address", value: string): string | null {
  return c.explorerUrl ? `${c.explorerUrl}/${kind}/${value}` : null;
}

// ----------------------------------------------------------------- wallets

export type WalletId = "you" | "friend";
/**
 * "you" is either a browser wallet (MetaMask or any injected EIP-1193 provider)
 * or a throwaway demo key; "friend" is always a demo key so there is a second
 * address to send vRWA to.
 */
export type DemoWallet = { id: WalletId; label: string; address: Address; kind: "injected" | "burner"; privateKey?: Hex };
type Session = { kind: "injected"; address: Address } | { kind: "burner" };
type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (ev: string, fn: (...a: unknown[]) => void) => void;
  removeListener?: (ev: string, fn: (...a: unknown[]) => void) => void;
};

// EIP-6963 wallet discovery. With several extensions installed, `window.ethereum` is whichever one
// won the race, which is often not the wallet the user is looking at. Each wallet announces itself
// here instead, so we can pick one by identity (MetaMask first) and name it in error messages.
type Announced = { info: { rdns: string; name: string; uuid: string }; provider: Eip1193 };
const announced: Announced[] = [];
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (ev) => {
    const d = (ev as CustomEvent<Announced>).detail;
    if (d?.provider && !announced.some((a) => a.info.uuid === d.info.uuid)) announced.push(d);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}
function pickWallet(): { name: string; provider: Eip1193 } | null {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem("veil.provider");
  const hit = announced.find((a) => a.info.rdns === saved) ?? announced.find((a) => a.info.rdns === "io.metamask") ?? announced[0];
  if (hit) return { name: hit.info.name, provider: hit.provider };
  const legacy = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  return legacy ? { name: "Browser wallet", provider: legacy } : null;
}
/** Wallet extensions found in this browser, e.g. [{ rdns: "io.metamask", name: "MetaMask" }]. */
export const listWallets = () => announced.map((a) => ({ rdns: a.info.rdns, name: a.info.name }));
/** Choose which extension Veil talks to (an rdns from listWallets). */
export const chooseWallet = (rdns: string) => localStorage.setItem("veil.provider", rdns);
export const injectedName = () => pickWallet()?.name ?? null;
export const injected = (): Eip1193 | null => pickWallet()?.provider ?? null;

/** One wallet RPC call. A refusal is re-thrown naming the wallet and the method, so it is clear who said no to what. */
async function rpc<T>(eth: Eip1193, method: string, params?: unknown[]): Promise<T> {
  try {
    return (await eth.request(params ? { method, params } : { method })) as T;
  } catch (e) {
    const err = e as { code?: number; message?: string };
    if (err.code === 4001) throw named("Rejected in wallet", "You declined the request in your wallet. Nothing was sent.");
    const others = listWallets().map((w) => w.name).join(", ");
    const out = named(`${injectedName() ?? "Wallet"} refused ${method}`, `${err.message ?? "The wallet refused the request."}${err.code ? ` (code ${err.code})` : ""} Open ${injectedName() ?? "the wallet"}, make sure it is unlocked and this site is connected to ${"the account shown in the top bar"}, then try again.${others ? ` Wallets detected in this browser: ${others}.` : ""}`);
    (out as Error & { code?: number }).code = err.code;
    throw out;
  }
}

function burnerKeys(): Record<WalletId, Hex> {
  const raw = localStorage.getItem("veil.wallets");
  if (raw) return JSON.parse(raw);
  const keys = { you: generatePrivateKey(), friend: generatePrivateKey() };
  localStorage.setItem("veil.wallets", JSON.stringify(keys));
  return keys;
}
function getSession(): Session | null {
  const raw = localStorage.getItem("veil.session");
  return raw ? JSON.parse(raw) : null;
}

/** `you` is null until the user connects a wallet (or picks the demo wallet). */
export function getWallets(): { you: DemoWallet | null; friend: DemoWallet } {
  const keys = burnerKeys();
  const burner = (id: WalletId, label: string): DemoWallet => ({ id, label, kind: "burner", privateKey: keys[id], address: privateKeyToAccount(keys[id]).address });
  const s = getSession();
  const you: DemoWallet | null = !s ? null : s.kind === "burner" ? burner("you", "Demo wallet") : { id: "you", label: injectedName() ?? "Browser wallet", kind: "injected", address: s.address };
  return { you, friend: burner("friend", "Friend's wallet") };
}

/** Ask the wallet to be on the VEIL chain, adding it if the wallet has never seen it. */
async function ensureChain(eth: Eip1193) {
  const c = await getConfig();
  const chainId = numberToHex(c.chainId);
  const current = await eth.request({ method: "eth_chainId" }).catch(() => null);
  if (typeof current === "string" && BigInt(current) === BigInt(c.chainId)) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (e) {
    const err = e as { code?: number; message?: string };
    if (err.code === 4001) throw named("Rejected in wallet", "You declined the network switch in your wallet.");
    // anything other than a plain refusal: the wallet most likely does not know the chain yet, so offer to add it
    await rpc(eth, "wallet_addEthereumChain", [{
      chainId, chainName: c.networkName, rpcUrls: [c.rpcUrl],
      nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
      ...(c.explorerUrl ? { blockExplorerUrls: [c.explorerUrl] } : {}),
    }]);
  }
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Before signing: make sure the browser wallet is unlocked and that the account
 * Veil is connected as is one the wallet authorises for this site. Proofs and
 * credentials are bound to that address, so a silent account switch must fail loudly.
 */
async function ensureAccount(eth: Eip1193, expected: Address) {
  let accounts = await rpc<Address[]>(eth, "eth_accounts");
  if (!accounts.some((a) => same(a, expected))) accounts = await rpc<Address[]>(eth, "eth_requestAccounts");
  if (!accounts.length) throw named("WalletLocked", "Your wallet is locked or did not share an account. Unlock it and try again.");
  if (!accounts.some((a) => same(a, expected))) {
    throw named("WrongAccount", `Veil is connected as ${short(expected)}, but your wallet's active account is ${short(accounts[0])}. Switch back to ${short(expected)} in your wallet, or disconnect and connect again with the new account.`);
  }
}
function named(name: string, message: string) {
  const e = new Error(message);
  e.name = name;
  return e;
}

/** True when the saved browser-wallet session is still authorised by the wallet (no prompt). */
export async function sessionStillValid(): Promise<boolean> {
  const s = getSession();
  if (!s || s.kind !== "injected") return true;
  const eth = injected();
  if (!eth) return false;
  try {
    const accounts = (await eth.request({ method: "eth_accounts" })) as Address[];
    return accounts.some((a) => same(a, s.address));
  } catch {
    return false;
  }
}

/** Connect MetaMask (or any injected wallet) and switch it to the VEIL chain. */
export async function connectInjected(): Promise<DemoWallet> {
  const eth = injected();
  if (!eth) throw new Error("No browser wallet found. Install MetaMask, or continue with the demo wallet.");
  const accounts = await rpc<Address[]>(eth, "eth_requestAccounts");
  if (!accounts?.[0]) throw new Error("The wallet did not share an account.");
  await ensureChain(eth);
  setInjectedAccount(accounts[0]);
  return getWallets().you!;
}
/**
 * Drop this site's permission in the wallet and ask for it again. Fixes a wallet that lists the
 * account as connected but still refuses to sign for it (stale permission from an earlier session).
 */
export async function reconnectInjected(): Promise<DemoWallet> {
  const eth = injected();
  if (!eth) throw new Error("No browser wallet found.");
  await eth.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => undefined);
  return connectInjected();
}

/** Record the wallet's active account (also used when the user switches accounts in the wallet). */
export function setInjectedAccount(address: Address) {
  localStorage.setItem("veil.session", JSON.stringify({ kind: "injected", address: getAddress(address) }));
}
/** Use a throwaway key kept in this browser. No extension needed. */
export function connectDemo(): DemoWallet {
  localStorage.setItem("veil.session", JSON.stringify({ kind: "burner" }));
  return getWallets().you!;
}
export function disconnect() {
  localStorage.removeItem("veil.session");
}

/** Forget wallets and credentials (fresh demo run). */
export function resetDemo() {
  Object.keys(localStorage).filter((k) => k.startsWith("veil.")).forEach((k) => localStorage.removeItem(k));
}

// ------------------------------------------------------------- tx plumbing

export type TxResult = { hash: Hex; explorer: string | null };

const ERRORS: Record<string, string> = {
  TransferRestricted: "Transfer blocked by the compliance hook: the recipient (or sender) has no valid ZK credential on-chain.",
  NotVerified: "This wallet has not proven its credential yet, so the vault refuses the deposit.",
  InvalidProof: "The registry rejected the zero-knowledge proof.",
  NullifierAlreadyUsed: "This credential was already registered by a wallet (one credential, one wallet).",
  CredentialExpired: "The credential has expired.",
  SpendLimitExceeded: "Exchange rejected the order: it exceeds the agent mandate's remaining spend limit.",
  AuthorizationExpired: "Exchange rejected the order: the agent mandate has expired.",
  NotAuthorized: "Exchange rejected the call: no authorization for this message type.",
  OracleFrozen: "The equity oracle is paused for the weekend, the mark price cannot update.",
  NotLiquidatable: "Position is healthy: equity is above maintenance margin, it cannot be liquidated.",
  InsufficientLiquidity: "The vault does not have enough liquid funds to pay this redemption right now.",
  ERC20InsufficientBalance: "Insufficient token balance.",
};

/** Turns a viem error into { name, message } where name is the Solidity custom error when there is one. */
export function explainError(e: unknown): { name: string | null; message: string } {
  if (e instanceof BaseError) {
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = rev?.data?.errorName ?? null;
    if (name) return { name, message: ERRORS[name] ?? `Reverted with ${name}` };
    const wallet = e.walk((x) => typeof (x as { code?: unknown }).code === "number") as { code?: number } | null;
    if (wallet?.code === 4001) return { name: "Rejected in wallet", message: "You declined the request in your wallet. Nothing was sent." };
    if (wallet?.code === 4100) return { name: "Wallet not authorised", message: "Your wallet is locked, or this site is not connected to the active account. Unlock the wallet, pick the account you connected with, and try again." };
    if (/insufficient funds/i.test(e.message)) return { name: "Not enough gas", message: "This wallet has no INJ for gas. Use the faucet on the Invest & transfer page first." };
    return { name: null, message: e.shortMessage };
  }
  const err = e as Error;
  const custom = err?.name && err.name !== "Error" ? err.name : null;
  return { name: custom, message: err?.message ?? String(e) };
}

async function write(w: DemoWallet, address: Address, abi: Abi, functionName: string, args: unknown[]): Promise<TxResult> {
  const c = await getConfig();
  const p = await pub();
  const account = w.kind === "burner" ? privateKeyToAccount(w.privateKey!) : w.address;
  // simulate first so reverts surface as decoded custom errors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { request } = await p.simulateContract({ address, abi, functionName, args, account } as any);
  let hash: Hex;
  if (w.kind === "burner") {
    const wallet = createWalletClient({ chain: chainOf(c), transport: http(c.rpcUrl), account });
    hash = await wallet.writeContract(request);
  } else {
    const eth = injected();
    if (!eth) throw new Error("Browser wallet is not available.");
    await ensureAccount(eth, w.address);
    await ensureChain(eth);
    // Build the transaction over our own RPC and give the wallet a plain eth_sendTransaction.
    // Letting viem prepare it through the wallet makes it call eth_fillTransaction, which
    // MetaMask refuses with 4100 "method has not been authorized" before any prompt appears.
    const data = encodeFunctionData({ abi, functionName, args });
    const gas = await p.estimateGas({ account: w.address, to: address, data });
    hash = await rpc<Hex>(eth, "eth_sendTransaction", [{ from: w.address, to: address, data, gas: numberToHex((gas * 13n) / 10n) }]);
  }
  const receipt = await p.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("transaction reverted");
  return { hash, explorer: explorerLink(c, "tx", hash) };
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `${url} failed (${r.status})`);
  return j as T;
}

// ---------------------------------------------------------------- identity

export const JURISDICTIONS = [
  { code: "356", name: "India" },
  { code: "702", name: "Singapore" },
  { code: "764", name: "Thailand" },
  { code: "840", name: "United States" },
  { code: "826", name: "United Kingdom" },
  { code: "408", name: "North Korea (blocked)" },
  { code: "364", name: "Iran (blocked)" },
] as const;

/** Lives only in this browser. `name` and the attributes never go on-chain. */
export type Credential = {
  name: string; nameHash: string; kyc: string; jurisdiction: string; accredited: string; expiry: string;
  sigR8x: string; sigR8y: string; sigS: string;
  secret: string; // holder secret, never leaves the browser
};

const credKey = (id: WalletId) => {
  const w = getWallets()[id];
  return w ? `veil.credential.${w.address.toLowerCase()}` : null;
};
/** Credentials are stored per wallet address, in this browser only. */
export function getCredential(id: WalletId): Credential | null {
  const k = credKey(id);
  const raw = k ? localStorage.getItem(k) : null;
  return raw ? JSON.parse(raw) : null;
}

/** Step 1: (mock) KYC. The issuer signs the attributes; it only sees a commitment to the holder secret. */
export async function requestCredential(id: WalletId, input: { name: string; jurisdiction: string; accredited: boolean }): Promise<Credential> {
  const rnd = crypto.getRandomValues(new Uint8Array(31));
  const secret = BigInt("0x" + Array.from(rnd, (b) => b.toString(16).padStart(2, "0")).join(""));
  const signed = await post<Omit<Credential, "secret">>("/api/issuer", { ...input, secretCommit: poseidon1([secret]).toString() });
  const cred: Credential = { ...signed, secret: secret.toString() };
  const k = credKey(id);
  if (!k) throw new Error("Connect a wallet first.");
  localStorage.setItem(k, JSON.stringify(cred));
  return cred;
}

declare global {
  interface Window {
    snarkjs?: { groth16: { fullProve: (input: unknown, wasm: string, zkey: string) => Promise<{ proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] }; publicSignals: string[] }> } };
  }
}
function loadSnarkjs(): Promise<NonNullable<Window["snarkjs"]>> {
  if (window.snarkjs) return Promise.resolve(window.snarkjs);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/zk/snarkjs.min.js";
    s.onload = () => (window.snarkjs ? resolve(window.snarkjs) : reject(new Error("snarkjs failed to load")));
    s.onerror = () => reject(new Error("snarkjs failed to load"));
    document.head.appendChild(s);
  });
}

export type ProofResult = TxResult & { nullifier: string; expiry: string; proveMs: number };

/**
 * Step 2: build the Groth16 proof in the browser and register it on-chain.
 * Throws a readable error when the credential cannot satisfy the policy
 * (blocked jurisdiction or not accredited): no valid proof exists in that case.
 */
export async function proveAndRegister(w: DemoWallet, cred: Credential, onStage?: (s: "proving" | "submitting") => void): Promise<ProofResult> {
  const c = await getConfig();
  const snarkjs = await loadSnarkjs();
  const nullifier = poseidon2([BigInt(cred.secret), 1n]).toString();
  const input = {
    issuerAx: c.issuer.ax, issuerAy: c.issuer.ay, wallet: BigInt(w.address).toString(), nullifier, expiry: cred.expiry,
    blocked: c.blockedJurisdictions,
    secret: cred.secret, nameHash: cred.nameHash, kyc: cred.kyc, jurisdiction: cred.jurisdiction, accredited: cred.accredited,
    sigR8x: cred.sigR8x, sigR8y: cred.sigR8y, sigS: cred.sigS,
  };
  // Registering costs gas; a brand-new wallet has none, so top it up from the faucet first.
  const p = await pub();
  if ((await p.getBalance({ address: w.address })) < 2_000_000_000_000_000n) {
    await faucet(w.address).catch(() => undefined);
    if ((await p.getBalance({ address: w.address })) === 0n) throw named("No gas", "This wallet has no INJ for gas and the faucet could not top it up. Get testnet INJ from https://testnet.faucet.injective.network, then try again.");
  }
  onStage?.("proving");
  const t0 = performance.now();
  let proof;
  try {
    ({ proof } = await snarkjs.groth16.fullProve(input, "/zk/credential.wasm", "/zk/credential.zkey"));
  } catch {
    throw named("No valid proof exists", "This credential does not satisfy the policy (jurisdiction is blocked or the investor is not accredited), so no proof can be generated.");
  }
  const proveMs = Math.round(performance.now() - t0);
  onStage?.("submitting");
  const a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const b = [[BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])], [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]];
  const cc = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];
  const tx = await write(w, c.addresses.registry, c.abis.ZkComplianceRegistry, "register", [a, b, cc, BigInt(nullifier), BigInt(cred.expiry)]);
  return { ...tx, nullifier, expiry: cred.expiry, proveMs };
}

// ------------------------------------------------------------ user actions

/** Gas + 10,000 mock USDT from the demo faucet. */
export const faucet = (address: Address) => post<{ gasTx: string | null; mintTx: string }>("/api/faucet", { address });

/** Deposit USDT into the vault, minting vRWA. `amount` is a human string like "2500". */
export async function deposit(w: DemoWallet, amount: string): Promise<TxResult> {
  const c = await getConfig();
  const p = await pub();
  const value = parseUnits(amount, 6);
  const allowance = (await p.readContract({ address: c.addresses.usdt, abi: c.abis.MockUSDT, functionName: "allowance", args: [w.address, c.addresses.vault] })) as bigint;
  if (allowance < value) await write(w, c.addresses.usdt, c.abis.MockUSDT, "approve", [c.addresses.vault, 2n ** 256n - 1n]);
  return write(w, c.addresses.vault, c.abis.VeilVault, "deposit", [value]);
}

/** Redeem vRWA shares for USDT. */
export async function withdraw(w: DemoWallet, shares: string): Promise<TxResult> {
  const c = await getConfig();
  return write(w, c.addresses.vault, c.abis.VeilVault, "withdraw", [parseUnits(shares, 6)]);
}

/** Send a token. vRWA transfers revert with TransferRestricted unless the recipient is verified. */
export async function transfer(w: DemoWallet, token: "vrwa" | "usdt", to: Address, amount: string): Promise<TxResult> {
  const c = await getConfig();
  return write(w, c.addresses[token], token === "vrwa" ? c.abis.VRWA : c.abis.MockUSDT, "transfer", [to, parseUnits(amount, 6)]);
}

// --------------------------------------------------------------- simulator

export type SimAction =
  | { action: "session"; value: 0 | 1 | 2 }
  | { action: "price"; value: string }
  | { action: "gap"; pct: number }
  | { action: "yield"; days: number }
  | { action: "liquidate" };
/** Owner-only mock market controls. Rejects with a readable message (e.g. oracle frozen, not liquidatable). */
export const simulate = (a: SimAction) => post<{ txs: string[] }>("/api/sim", a);

/**
 * Manual desk: the vault operator (owner key, held by the server) acts on the
 * vault directly, without the agent.
 *  order         trade the vault subaccount through VeilVault.placeOrder (quantity in TSLA, margin in USDT)
 *  grantMandate  (re)issue the agent's authz grant
 *  revokeMandate pull the agent's authority; its next order reverts
 */
export type OperatorAction =
  | { action: "order"; side: "buy" | "sell"; quantity: string; margin: string }
  | { action: "grantMandate"; limit: string; days: number }
  | { action: "revokeMandate" };
export const operate = (a: OperatorAction) => post<{ txs: string[] }>("/api/sim", a);

// ------------------------------------------------------------------- agent

export type AgentDecision = {
  id: number; // index in AgentLog
  timestamp: number; // unix seconds
  action: "Hold" | "OpenHedge" | "DeLever" | "ReLever" | "Rejected";
  session: "Open" | "PreClose" | "Weekend";
  leverageBefore: number;
  leverageAfter: number;
  rationale: string;
  llm: { model: string; source: "llm" | "fallback"; proposedLeverage: number; error?: string };
  txs: { label: string; hash: string; reverted?: boolean; error?: string }[];
  logTx: string; // AgentLog.log transaction
  recordHash: Hex; // keccak256(record), also stored on-chain
  record: string; // exact JSON that was hashed
};
export type AgentStatus = {
  address: Address; model: string; busy: boolean; lastTickAt: number | null; lastError: string | null;
  policy: { weekdayMaxLeverage: number; weekendGapSigma: number; gapSigmas: number; maintenanceMargin: number; gapSafeLeverage: number };
};

async function agentFetch<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  const c = await getConfig();
  let r: Response;
  try { r = await fetch(c.agentUrl + path, { method }); } catch { throw new Error("Risk agent is offline (start it with `npm run agent`)."); }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "agent error");
  return j as T;
}
export const agentStatus = () => agentFetch<AgentStatus>("/status");
/** Newest first. */
export const agentDecisions = () => agentFetch<AgentDecision[]>("/decisions");
/** Ask the agent to evaluate the book now (it also polls on its own every few seconds). */
export const agentTick = () => agentFetch<{ decision: AgentDecision | null }>("/tick", "POST");
/** Demo: make the agent attempt something outside its mandate; the exchange reverts and the attempt is logged. */
export const agentProbe = (kind: "overlimit" | "withdraw") => agentFetch<{ decision: AgentDecision }>(`/probe/${kind}`, "POST");

/** Recompute keccak256(record) and compare with what AgentLog stores on-chain. */
export async function verifyDecision(d: AgentDecision): Promise<boolean> {
  const c = await getConfig();
  const p = await pub();
  const { keccak256, toHex } = await import("viem");
  const onchain = (await p.readContract({ address: c.addresses.agentLog, abi: c.abis.AgentLog, functionName: "decisions", args: [BigInt(d.id)] })) as readonly unknown[];
  return keccak256(toHex(d.record)) === onchain[1];
}

// ------------------------------------------------------------------- state

export type WalletState = { address: Address; inj: number; usdt: number; vrwa: number; verified: boolean; verifiedUntil: number };
export type VeilState = {
  block: number;
  wallets: { you: WalletState | null; friend: WalletState };
  vault: {
    nav: number; sharePrice: number; totalShares: number;
    idleUsdt: number; tbillValue: number; subaccountEquity: number; freeCollateral: number;
  };
  position: { open: boolean; isLong: boolean; quantity: number; entryPrice: number; margin: number; markPrice: number; notional: number; unrealizedPnl: number; leverage: number };
  oracle: { session: 0 | 1 | 2; sessionName: "Open" | "PreClose" | "Weekend"; frozen: boolean; price: number };
  mandate: { agent: Address; expiry: number; active: boolean; spendLimit: number; orderRemaining: number; marginRemaining: number };
};

const n = (v: bigint, d: number) => Number(formatUnits(v, d));
export const SESSION_NAMES = ["Open", "PreClose", "Weekend"] as const;

/** One multicall-free snapshot of everything the dashboard shows. Poll it every ~2s. */
export async function readState(): Promise<VeilState> {
  const c = await getConfig();
  const p = await pub();
  const A = c.addresses;
  const ws = getWallets();
  const rd = (address: Address, abi: Abi, functionName: string, args: unknown[] = []) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p.readContract({ address, abi, functionName, args } as any) as Promise<any>;
  const walletState = async (w: DemoWallet): Promise<WalletState> => {
    const [inj, usdt, vrwa, until] = await Promise.all([
      p.getBalance({ address: w.address }),
      rd(A.usdt, c.abis.MockUSDT, "balanceOf", [w.address]),
      rd(A.vrwa, c.abis.VRWA, "balanceOf", [w.address]),
      rd(A.registry, c.abis.ZkComplianceRegistry, "verifiedUntil", [w.address]),
    ]);
    return { address: w.address, inj: n(inj, 18), usdt: n(usdt, 6), vrwa: n(vrwa, 6), verified: Number(until) > Date.now() / 1000, verifiedUntil: Number(until) };
  };
  const [block, you, friend, nav, sharePrice, supply, idle, tbillValue, subEq, dep, pos, session, agent, expiry, limit] = await Promise.all([
    p.getBlockNumber(), ws.you ? walletState(ws.you) : Promise.resolve(null), walletState(ws.friend),
    rd(A.vault, c.abis.VeilVault, "nav"), rd(A.vault, c.abis.VeilVault, "sharePrice"), rd(A.vrwa, c.abis.VRWA, "totalSupply"),
    rd(A.usdt, c.abis.MockUSDT, "balanceOf", [A.vault]), rd(A.vault, c.abis.VeilVault, "tbillValue"), rd(A.vault, c.abis.VeilVault, "subaccountEquity"),
    rd(A.exchange, c.abis.MockExchange, "subaccountDeposit", [A.subaccountID, "usdt"]),
    rd(A.vault, c.abis.VeilVault, "position"), rd(A.oracle, c.abis.MockOracle, "session"),
    rd(A.vault, c.abis.VeilVault, "agent"), rd(A.vault, c.abis.VeilVault, "mandateExpiry"), rd(A.vault, c.abis.VeilVault, "mandateSpendLimit"),
  ]);
  const zero = "0x0000000000000000000000000000000000000000";
  const [g8, g5] = agent === zero ? [[0n, 0n], [0n, 0n]] : await Promise.all([
    rd(A.exchange, c.abis.MockExchange, "grantInfo", [A.vault, agent, 8]),
    rd(A.exchange, c.abis.MockExchange, "grantInfo", [A.vault, agent, 5]),
  ]);
  return {
    block: Number(block),
    wallets: { you, friend },
    vault: { nav: n(nav, 6), sharePrice: n(sharePrice, 18), totalShares: n(supply, 6), idleUsdt: n(idle, 6), tbillValue: n(tbillValue, 6), subaccountEquity: n(subEq, 6), freeCollateral: n(dep[0], 6) },
    position: {
      open: pos.open, isLong: pos.isLong, quantity: n(pos.quantity, 18), entryPrice: n(pos.entryPrice, 18), margin: n(pos.margin, 18),
      markPrice: n(pos.markPrice, 18), notional: n(pos.notional, 18), unrealizedPnl: n(pos.unrealizedPnl, 18), leverage: pos.open ? Number(pos.leverageBps) / 10000 : 0,
    },
    oracle: { session, sessionName: SESSION_NAMES[session as 0 | 1 | 2], frozen: session === 2, price: n(pos.markPrice, 18) },
    mandate: { agent, expiry: Number(expiry), active: Number(expiry) > Date.now() / 1000, spendLimit: n(limit, 6), orderRemaining: n(g8[1], 6), marginRemaining: n(g5[1], 6) },
  };
}
