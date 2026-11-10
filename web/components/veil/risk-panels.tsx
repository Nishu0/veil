"use client";

// Animated isometric panels for the landing page's "Two risks" section.
// Each panel cycles through a short story; the header chips name the current step and can be clicked.
import * as React from "react";
import { Bot, CalendarClock, Check, Gauge, Radio, ScrollText, ShieldCheck, X } from "lucide-react";

// ------------------------------------------------------------- isometric kit
const U = 34, CX = 0.866 * U, SY = 0.5 * U, OX = 280, OY = 96;
type Pt = readonly [number, number];
const P = (x: number, y: number, z = 0): Pt => [OX + (x - y) * CX, OY + (x + y) * SY - z * U];
const pts = (a: Pt[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

type Paint = { top: string; left: string; right: string; edge: string };
const PAPER: Paint = { top: "#ffffff", left: "#eef2ef", right: "#e3e9e5", edge: "#cfd7d2" };
const GREEN: Paint = { top: "#2f7d55", left: "#1f5a3c", right: "#1a4a32", edge: "#143021" };
const MINT: Paint = { top: "#eef8f1", left: "#d9eee0", right: "#cbe6d4", edge: "#8fcaa5" };
const AMBER: Paint = { top: "#fdf6e6", left: "#f6e7c2", right: "#f0dcab", edge: "#d9b866" };
const RED: Paint = { top: "#fdf1ed", left: "#f6dcd5", right: "#f0cfc6", edge: "#e0a393" };

function Slab({ x, y, w, d = w, z = 0, h, paint, style }: { x: number; y: number; w: number; d?: number; z?: number; h: number; paint: Paint; style?: React.CSSProperties }) {
  const t = z + h;
  return (
    <g stroke={paint.edge} strokeWidth="1.1" strokeLinejoin="round" style={{ transition: "opacity .5s ease, transform .5s ease", ...style }}>
      <polygon points={pts([P(x, y + d, t), P(x + w, y + d, t), P(x + w, y + d, z), P(x, y + d, z)])} fill={paint.left} style={{ transition: "fill .5s, stroke .5s" }} />
      <polygon points={pts([P(x + w, y, t), P(x + w, y + d, t), P(x + w, y + d, z), P(x + w, y, z)])} fill={paint.right} style={{ transition: "fill .5s, stroke .5s" }} />
      <polygon points={pts([P(x, y, t), P(x + w, y, t), P(x + w, y + d, t), P(x, y + d, t)])} fill={paint.top} style={{ transition: "fill .5s, stroke .5s" }} />
    </g>
  );
}

/** A small plinth with an upright icon and a label pill. (cx, cy) is its centre on the grid. */
function Tile({ cx, cy, paint = PAPER, label, icon, float = "" }: { cx: number; cy: number; paint?: Paint; label: string; icon: React.ReactNode; float?: string }) {
  const s = 2.5, x = cx - s / 2, y = cy - s / 2;
  const [ix, iy] = P(cx, cy, 0.62);
  const [sx, sy] = P(cx, cy);
  const w = label.length * 6.3 + 22;
  return (
    <g>
      <ellipse cx={sx} cy={sy + 12} rx={s * CX * 0.8} ry={s * SY * 0.8} fill="#1e3a2b" opacity=".05" />
      <g className={`lp-float ${float}`}>
        <Slab x={x} y={y} w={s} h={0.3} paint={PAPER} />
        <Slab x={x + 0.36} y={y + 0.36} w={s - 0.72} z={0.3} h={0.22} paint={paint} />
        <g transform={`translate(${(ix - 11).toFixed(1)},${(iy - 15).toFixed(1)})`} style={{ color: paint === GREEN ? "#eaf6ee" : paint === AMBER ? "#a8741f" : paint === RED ? "#ab4634" : "#2b7850" }}>{icon}</g>
        <g transform={`translate(${(ix - w / 2).toFixed(1)},${(iy - 58).toFixed(1)})`}>
          <rect width={w} height="22" rx="11" fill="#fff" stroke="#e1e6e3" />
          <text x={w / 2} y="14.5" textAnchor="middle" fontSize="11" fontWeight="600" fill="#33423a" style={{ fontFamily: "var(--v-sans)" }}>{label}</text>
        </g>
      </g>
    </g>
  );
}

function Wire({ a, b, state }: { a: [number, number]; b: [number, number]; state: "idle" | "flow" | "blocked" | "frozen" }) {
  const [x1, y1] = P(a[0], a[1]), [x2, y2] = P(b[0], b[1]);
  const mx = x1 + (x2 - x1) * 0.52, my = y1 + (y2 - y1) * 0.52;
  const color = state === "flow" ? "#35b07a" : state === "blocked" ? "#cf5a44" : state === "frozen" ? "#d9b866" : "#c9d2cc";
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e4eae6" strokeWidth="5" strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={state === "blocked" ? mx : x2} y2={state === "blocked" ? my : y2} stroke={color} strokeWidth="1.9" strokeDasharray="5 7" className={state === "flow" || state === "blocked" ? "lp-flow" : ""} style={{ transition: "stroke .4s" }} />
      {state === "blocked" && (
        <g transform={`translate(${mx.toFixed(1)},${my.toFixed(1)})`} className="rk-pop">
          <circle r="10" fill="#fff" stroke="#e6b8ad" />
          <path d="M-3.4-3.4 3.4 3.4M3.4-3.4-3.4 3.4" stroke="#ab4634" strokeWidth="1.7" strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

function Grid() {
  const lines: React.ReactNode[] = [];
  for (let i = -14; i <= 24; i += 2) {
    const a = P(i, -16), b = P(i, 26), c = P(-16, i), d = P(26, i);
    lines.push(<line key={`a${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />, <line key={`b${i}`} x1={c[0]} y1={c[1]} x2={d[0]} y2={d[1]} />);
  }
  return <g stroke="#eef2ef" strokeWidth="1">{lines}</g>;
}

function Callout({ x, y, z, tone, children }: { x: number; y: number; z: number; tone: "ok" | "bad" | "warn" | "plain"; children: string }) {
  const [px, py] = P(x, y, z);
  const w = children.length * 6.5 + 26;
  const c = { ok: ["#e9f5ed", "#8fcaa5", "#1f6a43"], bad: ["#fdf1ed", "#e6b8ad", "#ab4634"], warn: ["#fdf6e6", "#e6cf9a", "#946618"], plain: ["#ffffff", "#dfe5e1", "#1c2822"] }[tone];
  return (
    <g transform={`translate(${(px - w / 2).toFixed(1)},${(py - 13).toFixed(1)})`} className="rk-pop">
      <rect width={w} height="26" rx="13" fill={c[0]} stroke={c[1]} />
      <text x={w / 2} y="17" textAnchor="middle" fontSize="12" fontWeight="600" fill={c[2]} style={{ fontFamily: "var(--v-sans)" }}>{children}</text>
    </g>
  );
}

// ----------------------------------------------------------------- cycling

/** Steps through `n` states every `ms`; stops for reduced-motion users and while off-screen. */
function useCycle(n: number, ms: number) {
  const [i, setI] = React.useState(0);
  const [run, setRun] = React.useState(0); // bumps when a step is picked by hand, to restart the timer
  const ref = React.useRef<HTMLDivElement>(null);
  const [live, setLive] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  React.useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % n), ms);
    return () => window.clearInterval(id);
  }, [live, n, ms, run]);
  const pick = (v: number) => { setI(v); setRun((r) => r + 1); };
  return { i, pick, panelRef: ref, live, run };
}

function Chip({ icon, children, tone }: { icon?: React.ReactNode; children: React.ReactNode; tone?: "ok" | "bad" | "warn" }) {
  return <span className={`lp-chip rk-chip${tone ? ` is-${tone}` : ""}`}>{icon}<span key={String(children)} className="rk-swap">{children}</span></span>;
}

type Cycle = { i: number; run: number; live: boolean; pick: (v: number) => void; panelRef: React.RefObject<HTMLDivElement | null> };
function Panel({ head, dots, i, run, live, pick, panelRef, ms, caption, children }: Cycle & { head: React.ReactNode; dots: string[]; ms: number; caption: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="lp-panel rk" ref={panelRef}>
      <div className="lp-panel-head rk-head">{head}</div>
      <div className="rk-progress"><i key={`${i}-${run}`} style={{ animationDuration: `${ms}ms`, animationPlayState: live ? "running" : "paused" }} /></div>
      <svg className="rk-scene" viewBox="0 0 560 400" role="img" aria-label={dots[i]}>
        <Grid />
        {children}
      </svg>
      <div className="rk-foot">
        <div className="rk-caption">{caption}</div>
        <div className="rk-dots" role="tablist" aria-label="Steps">
          {dots.map((d, k) => <button key={d} type="button" role="tab" aria-selected={k === i} aria-label={d} title={d} className={k === i ? "is-on" : ""} onClick={() => pick(k)} />)}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------- weekend gap guard

const GAP = [
  { day: "Thursday", oracle: "Live", lev: 6, text: "Weekday: the hedge runs at its 6x limit.", call: ["6.0x", "plain"] },
  { day: "Friday close", oracle: "Live", lev: 3.3, text: "Before the close the agent cuts to what a 4-sigma gap cannot liquidate.", call: ["agent cuts to 3.3x", "ok"] },
  { day: "Weekend", oracle: "Frozen", lev: 3.3, text: "The mark is frozen. Trading continues, and nothing can be re-priced.", call: ["3.3x · mark frozen", "warn"] },
  { day: "Monday open", oracle: "Live", lev: 3.3, text: "The price gaps 18%. At 6x this was liquidated; at 3.3x it survives.", call: ["survives the +18% gap", "ok"] },
] as const;

export function GapGuardPanel() {
  const MS = 3800;
  const c = useCycle(GAP.length, MS);
  const s = GAP[c.i];
  const layers = s.lev === 6 ? 6 : 3;
  const frozen = s.oracle === "Frozen";
  return (
    <Panel
      {...c} ms={MS} dots={GAP.map((g) => g.day)}
      head={<><Chip icon={<CalendarClock />}>{s.day}</Chip>oracle<Chip icon={<Radio />} tone={frozen ? "warn" : "ok"}>{s.oracle}</Chip>leverage<Chip icon={<Gauge />}>{s.lev === 6 ? "6.0x" : "3.3x"}</Chip></>}
      caption={<><b>De-levered before the oracle sleeps.</b> <span key={s.text} className="rk-swap">{s.text}</span></>}
    >
      <Wire a={[-1.5, 4]} b={[4, 4]} state={frozen ? "frozen" : "flow"} />
      <Wire a={[4, 9.5]} b={[4, 4]} state={c.i === 1 ? "flow" : "idle"} />
      <Wire a={[9.5, 4]} b={[4, 4]} state={c.i === 3 ? "flow" : "idle"} />
      <Tile cx={-1.5} cy={4} label={frozen ? "Oracle · frozen" : "Oracle · live"} paint={frozen ? AMBER : MINT} icon={<Radio size={22} />} float="d2" />
      {/* the position: a plate with one block per turn of leverage */}
      <Slab x={1.4} y={1.4} w={5.2} h={0.34} paint={c.i === 3 ? MINT : PAPER} />
      {Array.from({ length: 6 }, (_, k) => (
        <Slab key={k} x={2.5} y={2.5} w={3} z={0.34 + k * 0.36} h={0.3} paint={GREEN} style={{ opacity: k < layers ? 1 : 0, transform: k < layers ? "none" : "translateY(-16px)", transitionDelay: `${(k < layers ? k : 5 - k) * 60}ms` }} />
      ))}
      <Callout key={s.call[0]} x={4} y={4} z={0.34 + layers * 0.36 + 1.25} tone={s.call[1]}>{s.call[0]}</Callout>
      <Tile cx={9.5} cy={4} label="TSLA iAsset perp" paint={c.i === 3 ? RED : PAPER} icon={<Gauge size={22} />} float="d3" />
      <Tile cx={4} cy={9.5} label="Risk agent" paint={c.i === 1 ? GREEN : PAPER} icon={<Bot size={22} />} />
    </Panel>
  );
}

// ------------------------------------------------------------- agent mandate

const ACTS = [
  { act: "Place an order", ok: true, result: "Allowed", text: "Derivative orders on the vault subaccount are inside the mandate." },
  { act: "Add margin", ok: true, result: "Allowed", text: "Adding position margin is how the agent de-levers." },
  { act: "Withdraw funds", ok: false, result: "NotAuthorized", text: "The mandate grants no withdraw or transfer rights. The exchange reverts." },
  { act: "Spend over 2,500 USDT", ok: false, result: "SpendLimitExceeded", text: "Committed margin is capped. One unit over, and the order reverts." },
  { act: "Trade after 7 days", ok: false, result: "AuthorizationExpired", text: "The grant expires on its own. No key rotation needed." },
] as const;

export function MandatePanel() {
  const MS = 3200;
  const c = useCycle(ACTS.length, MS);
  const s = ACTS[c.i];
  return (
    <Panel
      {...c} ms={MS} dots={ACTS.map((a) => a.act)}
      head={<><Chip icon={<Bot />}>Agent</Chip>tries<Chip icon={<ShieldCheck />}>{s.act}</Chip><Chip icon={s.ok ? <Check /> : <X />} tone={s.ok ? "ok" : "bad"}>{s.result}</Chip></>}
      caption={<><b>Authority with edges.</b> <span key={s.text} className="rk-swap">{s.text}</span></>}
    >
      <Wire a={[-1.5, 4]} b={[4, 4]} state={s.ok ? "flow" : "blocked"} />
      <Wire a={[9.5, 4]} b={[4, 4]} state="flow" />
      <Wire a={[4, 9.5]} b={[4, 4]} state="idle" />
      <Tile cx={-1.5} cy={4} label="Risk agent" paint={s.ok ? GREEN : RED} icon={<Bot size={22} />} float="d2" />
      {/* the exchange, holding the vault's subaccount */}
      <Slab x={1.4} y={1.4} w={5.2} h={0.34} paint={s.ok ? MINT : PAPER} />
      <Slab x={2.4} y={2.4} w={3.2} z={0.34} h={0.5} paint={PAPER} />
      <Slab x={3} y={3} w={2} z={0.84} h={0.42} paint={GREEN} />
      <Callout key={s.result + s.act} x={4} y={4} z={2.7} tone={s.ok ? "ok" : "bad"}>{s.ok ? "exchange accepts" : `reverts: ${s.result}`}</Callout>
      <Tile cx={9.5} cy={4} label="AgentLog · hashed" paint={MINT} icon={<ScrollText size={22} />} float="d3" />
      <Tile cx={4} cy={9.5} label="Vault funds" icon={<ShieldCheck size={22} />} />
    </Panel>
  );
}
