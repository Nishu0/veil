// VEIL risk agent.
//
// Trades the vault's exchange subaccount strictly through the authz mandate the
// vault granted it (place derivative orders, add position margin; capped spend,
// 7-day expiry, no withdraw rights). The LLM proposes a leverage and explains
// it; hard limits in POLICY decide what is actually allowed. Every decision is
// hashed and committed to AgentLog.
import http from "node:http";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { BaseError, ContractFunctionRevertedError, formatUnits, keccak256, toHex, type Hex } from "viem";
import { ROOT, abi, account, addr, chainId, gapSafeLeverage, LLM_MODEL, POLICY, PORT, pub, wallet } from "./config.js";
import { advise } from "./llm.js";

const SESSIONS = ["Open", "PreClose", "Weekend"] as const;
const ACTIONS = ["Hold", "OpenHedge", "DeLever", "ReLever", "Rejected"] as const;
type Action = (typeof ACTIONS)[number];
type Tx = { label: string; hash: string; reverted?: boolean; error?: string };
type Decision = {
  id: number; timestamp: number; action: Action; session: (typeof SESSIONS)[number];
  leverageBefore: number; leverageAfter: number; rationale: string;
  llm: { model: string; source: "llm" | "fallback"; proposedLeverage: number; error?: string };
  txs: Tx[]; logTx: string; recordHash: Hex; record: string;
};

const E18 = 10n ** 18n;
const f18 = (v: bigint) => Number(formatUnits(v, 18));
const to18 = (x: number) => BigInt(Math.round(x * 1e9)) * 10n ** 9n;
const r2 = (x: number) => Math.round(x * 100) / 100;

// ------------------------------------------------------------------ store

const dataDir = path.join(ROOT, "agent/data");
mkdirSync(dataDir, { recursive: true });
const storeFile = path.join(dataDir, `decisions-${chainId}-${addr.agentLog.toLowerCase()}.jsonl`);
const decisions: Decision[] = existsSync(storeFile)
  ? readFileSync(storeFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  : [];

// ------------------------------------------------------------- chain I/O

async function snapshot() {
  const read = (address: Hex, a: typeof abi.VeilVault, functionName: string, args: unknown[] = []) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pub.readContract({ address, abi: a, functionName, args } as any) as Promise<any>;
  const [session, pos, dep, g8, g5] = await Promise.all([
    read(addr.oracle, abi.MockOracle, "session"),
    read(addr.vault, abi.VeilVault, "position"),
    read(addr.exchange, abi.MockExchange, "subaccountDeposit", [addr.subaccountID, "usdt"]),
    read(addr.exchange, abi.MockExchange, "grantInfo", [addr.vault, account.address, 8]),
    read(addr.exchange, abi.MockExchange, "grantInfo", [addr.vault, account.address, 5]),
  ]);
  const now = Math.floor(Date.now() / 1000);
  return {
    session: Number(session) as 0 | 1 | 2,
    open: pos.open as boolean,
    qty: pos.quantity as bigint,
    mark: f18(pos.markPrice),
    markRaw: pos.markPrice as bigint,
    notional: f18(pos.notional),
    margin: f18(pos.margin),
    pnl: f18(pos.unrealizedPnl),
    leverage: pos.open ? Number(pos.leverageBps) / 10_000 : 0,
    free: Number(formatUnits(dep[0], 6)),
    orderSpendLeft: Number(formatUnits(g8[1], 6)),
    marginSpendLeft: Number(formatUnits(g5[1], 6)),
    mandateActive: Number(g8[0]) > now,
    mandateExpiry: Number(g8[0]),
  };
}
type Snap = Awaited<ReturnType<typeof snapshot>>;

function revertInfo(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (r?.data) return `${r.data.errorName}(${(r.data.args ?? []).map(String).join(", ")})`;
    return e.shortMessage;
  }
  return String((e as Error)?.message ?? e);
}

async function send(label: string, address: Hex, a: typeof abi.VeilVault, functionName: string, args: unknown[]): Promise<Tx> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { request } = await pub.simulateContract({ address, abi: a, functionName, args, account } as any);
  const hash = await wallet.writeContract(request);
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`${label} reverted`);
  return { label, hash };
}

/** Send a tx we expect the chain to refuse, so there is a reverted tx on the explorer to point at. */
async function sendExpectingRevert(label: string, address: Hex, a: typeof abi.VeilVault, functionName: string, args: unknown[]): Promise<Tx> {
  let error = "did not revert";
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await pub.simulateContract({ address, abi: a, functionName, args, account } as any);
  } catch (e) {
    error = revertInfo(e);
  }
  let hash = "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hash = await wallet.writeContract({ address, abi: a, functionName, args, gas: 600_000n } as any);
    const rc = await pub.waitForTransactionReceipt({ hash: hash as Hex });
    if (rc.status === "success") return { label, hash, reverted: false, error: "UNEXPECTED: transaction succeeded" };
  } catch {
    // some nodes refuse to broadcast a tx that fails simulation; the decoded error above is still the result
  }
  return { label, hash, reverted: true, error };
}

const order = (isBuy: boolean, qty: bigint, mark: bigint, margin: bigint) => ({
  marketID: addr.marketID,
  subaccountID: addr.subaccountID,
  feeRecipient: "",
  price: isBuy ? (mark * 101n) / 100n : (mark * 99n) / 100n, // 1% slippage bound
  quantity: qty,
  cid: `veil-${Date.now()}`,
  orderType: isBuy ? "buy" : "sell",
  margin,
  triggerPrice: 0n,
});
const placeOrder = (label: string, isBuy: boolean, qty: bigint, mark: bigint, margin: bigint) =>
  send(label, addr.exchange, abi.MockExchange, "createDerivativeLimitOrder", [addr.vault, order(isBuy, qty, mark, margin)]);

// ------------------------------------------------------------ commit log

async function commit(d: Omit<Decision, "id" | "logTx" | "recordHash" | "record">, extra: object): Promise<Decision> {
  const record = JSON.stringify({ v: 1, chainId, agent: account.address, vault: addr.vault, ...d, ...extra });
  const recordHash = keccak256(toHex(record));
  const args = [recordHash, ACTIONS.indexOf(d.action), Math.min(Math.round(d.leverageBefore * 10_000), 2 ** 32 - 1), Math.min(Math.round(d.leverageAfter * 10_000), 2 ** 32 - 1)];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { request, result } = await pub.simulateContract({ address: addr.agentLog, abi: abi.AgentLog, functionName: "log", args, account } as any);
  const logTx = await wallet.writeContract(request);
  await pub.waitForTransactionReceipt({ hash: logTx });
  const full: Decision = { ...d, id: Number(result), logTx, recordHash, record };
  decisions.push(full);
  appendFileSync(storeFile, JSON.stringify(full) + "\n");
  console.log(`[decision #${full.id}] ${full.action} ${r2(full.leverageBefore)}x -> ${r2(full.leverageAfter)}x | ${full.rationale}`);
  return full;
}

// ------------------------------------------------------------------ policy

let lastSession: number | null = decisions.length ? SESSIONS.indexOf(decisions[decisions.length - 1].session) : null;

function plan(s: Snap): { action: Action; maxLev: number; why: string } | null {
  const gapSafe = gapSafeLeverage();
  const maxLev = s.session === 0 ? POLICY.weekdayMaxLeverage : Math.min(POLICY.weekdayMaxLeverage, gapSafe);
  if (!s.mandateActive) return null;
  if (!s.open) {
    if (s.free < POLICY.minFreeUsdt || s.orderSpendLeft < 1) return null;
    return { action: "OpenHedge", maxLev, why: `No hedge is open and ${r2(s.free)} USDT of collateral is free; opening the TSLA short at ${r2(maxLev)}x, the limit for the ${SESSIONS[s.session]} session.` };
  }
  if (s.leverage > maxLev * 1.02) {
    return {
      action: "DeLever", maxLev,
      why: s.session === 0
        ? `Leverage ${r2(s.leverage)}x is above the ${r2(maxLev)}x weekday limit; trimming.`
        : `The equity oracle freezes over the weekend. A ${POLICY.gapSigmas}-sigma Monday gap is ${r2(POLICY.gapSigmas * POLICY.weekendGapSigma * 100)}%, which a ${r2(s.leverage)}x short does not survive; cutting to ${r2(maxLev)}x keeps equity above the ${POLICY.maintenanceMargin * 100}% maintenance margin.`,
    };
  }
  if (s.session === 0 && s.leverage < POLICY.weekdayMaxLeverage * 0.9 && s.orderSpendLeft >= 1 && s.free >= 1) {
    return { action: "ReLever", maxLev, why: `Oracle is live again and leverage is ${r2(s.leverage)}x; restoring the weekday target of ${r2(maxLev)}x.` };
  }
  return null;
}

async function tick(): Promise<Decision | null> {
  const s = await snapshot();
  const sessionChanged = lastSession !== s.session;
  const p = plan(s);
  const base = { timestamp: Math.floor(Date.now() / 1000), session: SESSIONS[s.session], leverageBefore: s.leverage };
  const inputs = { mark: s.mark, notional: r2(s.notional), margin: r2(s.margin), unrealizedPnl: r2(s.pnl), freeCollateral: r2(s.free), orderSpendLeft: s.orderSpendLeft, marginSpendLeft: s.marginSpendLeft };
  const policy = { ...POLICY, gapSafeLeverage: r2(gapSafeLeverage()) };

  if (!p) {
    lastSession = s.session;
    if (!sessionChanged || !s.open) return null;
    const rationale = `Session is now ${SESSIONS[s.session]}. Leverage ${r2(s.leverage)}x is within the ${r2(s.session === 0 ? POLICY.weekdayMaxLeverage : gapSafeLeverage())}x limit for this session; no trade.`;
    return commit({ ...base, action: "Hold", leverageAfter: s.leverage, rationale, llm: { model: "deterministic-policy", source: "fallback", proposedLeverage: s.leverage }, txs: [] }, { inputs, policy });
  }

  const advice = await advise({ session: SESSIONS[s.session], proposedAction: p.action, currentLeverage: r2(s.leverage), ...inputs, policy }, { min: 1, max: p.maxLev }, { target: p.maxLev, why: p.why });
  let target = Math.min(Math.max(advice.targetLeverage, 1), p.maxLev); // guardrail: clamp whatever the model said
  // If the model's number would not move leverage in the planned direction, the policy value and its reason win.
  if ((p.action === "DeLever" && target >= s.leverage) || (p.action === "ReLever" && target <= s.leverage)) {
    target = p.maxLev;
    advice.rationale = p.why;
    advice.error = `model proposed ${advice.targetLeverage}x, which does not ${p.action === "DeLever" ? "reduce" : "raise"} leverage; policy value used`;
    advice.source = "fallback";
    advice.model = "deterministic-policy";
  }

  const txs: Tx[] = [];
  if (p.action === "OpenHedge") {
    const margin = Math.floor(Math.min(s.free * POLICY.marginBudget, s.orderSpendLeft));
    const qty = (to18(margin * target) * E18) / s.markRaw;
    txs.push(await placeOrder(`Short ${r2(f18(qty))} TSLA @ ${target.toFixed(2)}x (margin ${margin} USDT)`, false, qty, s.markRaw, to18(margin)));
  } else if (p.action === "DeLever") {
    // Reduce by fraction f, then re-post the released margin, so that notional / equity == target.
    const equity = s.margin + s.pnl;
    const f = Math.min(Math.max((s.notional - target * equity) / (s.notional - target * s.pnl), 0), 1);
    const cut = (s.qty * BigInt(Math.round(f * 1e6))) / 1_000_000n;
    txs.push(await placeOrder(`Reduce short by ${r2(f * 100)}% (buy ${r2(f18(cut))} TSLA, reduce-only)`, true, cut, s.markRaw, 0n));
    const a = await snapshot();
    if (a.open) {
      const add = Math.floor(Math.min(Math.max(a.notional / target - (a.margin + a.pnl), 0), a.free, a.marginSpendLeft));
      if (add >= 1) txs.push(await send(`Re-post ${add} USDT as position margin`, addr.exchange, abi.MockExchange, "increasePositionMargin", [addr.vault, addr.subaccountID, addr.subaccountID, addr.marketID, to18(add)]));
    }
  } else if (p.action === "ReLever") {
    const equity = s.margin + s.pnl;
    let addNotional = Math.max((target * equity - s.notional) / (1 - target / 20), 0);
    const margin = Math.floor(Math.min(addNotional / 20, s.free, s.orderSpendLeft));
    addNotional = Math.min(addNotional, margin * 20);
    if (margin >= 1) {
      const qty = (to18(addNotional) * E18) / s.markRaw;
      txs.push(await placeOrder(`Add ${r2(f18(qty))} TSLA short (margin ${margin} USDT)`, false, qty, s.markRaw, to18(margin)));
    }
  }

  const after = await snapshot();
  lastSession = s.session;
  return commit(
    { ...base, action: p.action, leverageAfter: after.leverage, rationale: advice.rationale, llm: { model: advice.model, source: advice.source, proposedLeverage: advice.targetLeverage, ...(advice.error ? { error: advice.error } : {}) }, txs },
    { inputs, policy, targetLeverage: r2(target) },
  );
}

/** Demo probes: deliberately step outside the mandate and record that the chain said no. */
async function probe(kind: "overlimit" | "withdraw"): Promise<Decision> {
  const s = await snapshot();
  let tx: Tx, what: string;
  if (kind === "overlimit") {
    const margin = Math.floor(s.orderSpendLeft) + 1;
    const qty = (to18(margin * 2) * E18) / s.markRaw;
    what = `an order committing ${margin} USDT of margin, above the ${r2(s.orderSpendLeft)} USDT left on the mandate`;
    tx = await sendExpectingRevert(`Over-limit order (margin ${margin} USDT)`, addr.exchange, abi.MockExchange, "createDerivativeLimitOrder", [addr.vault, order(false, qty, s.markRaw, to18(margin))]);
  } else {
    const amount = Math.max(Math.floor(s.free), 1);
    what = `a withdrawal of ${amount} USDT from the vault subaccount, which the mandate does not cover`;
    tx = await sendExpectingRevert(`Withdraw ${amount} USDT from vault subaccount`, addr.exchange, abi.MockExchange, "withdraw", [addr.vault, addr.subaccountID, "usdt", BigInt(amount) * 1_000_000n]);
  }
  const rationale = tx.reverted
    ? `Probe: the agent attempted ${what}. The exchange reverted with ${tx.error}. The mandate held.`
    : `Probe: the agent attempted ${what} and it was NOT rejected. Mandate is misconfigured.`;
  return commit(
    { timestamp: Math.floor(Date.now() / 1000), session: SESSIONS[s.session], action: "Rejected", leverageBefore: s.leverage, leverageAfter: s.leverage, rationale, llm: { model: "deterministic-policy", source: "fallback", proposedLeverage: s.leverage }, txs: [tx] },
    { probe: kind },
  );
}

// ------------------------------------------------------------- scheduling

let lock: Promise<unknown> = Promise.resolve();
let busy = false, lastTickAt: number | null = null, lastError: string | null = null;
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    busy = true;
    try { const r = await fn(); lastError = null; return r; }
    catch (e) { lastError = revertInfo(e); console.error("[agent] error:", lastError); throw e; }
    finally { busy = false; lastTickAt = Math.floor(Date.now() / 1000); }
  };
  const next = lock.then(run, run);
  lock = next.catch(() => undefined);
  return next;
}

setInterval(() => { if (!busy) exclusive(tick).catch(() => undefined); }, 4000);

// -------------------------------------------------------------------- http

http.createServer(async (req, res) => {
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === "OPTIONS") return json(204, {});
    const route = `${req.method} ${req.url?.split("?")[0]}`;
    if (route === "GET /status") return json(200, { address: account.address, model: LLM_MODEL, busy, lastTickAt, lastError, policy: { ...POLICY, gapSafeLeverage: gapSafeLeverage() } });
    if (route === "GET /decisions") return json(200, [...decisions].reverse());
    if (route === "POST /tick") return json(200, { decision: await exclusive(tick) });
    if (route === "POST /probe/overlimit") return json(200, { decision: await exclusive(() => probe("overlimit")) });
    if (route === "POST /probe/withdraw") return json(200, { decision: await exclusive(() => probe("withdraw")) });
    json(404, { error: "not found" });
  } catch (e) {
    json(500, { error: revertInfo(e) });
  }
}).listen(PORT, () => {
  console.log(`VEIL risk agent ${account.address} on chain ${chainId}, http://localhost:${PORT}`);
  console.log(`LLM: ${LLM_MODEL} via opencode | gap-safe leverage ${r2(gapSafeLeverage())}x | weekday max ${POLICY.weekdayMaxLeverage}x`);
});
