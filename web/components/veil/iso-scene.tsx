// Isometric hero illustration: wallet -> ZK registry -> vault -> T-bills / exchange <- agent.
// Pure SVG, computed on the server.
const U = 56; // grid unit in px
const CX = 0.866 * U, SY = 0.5 * U;
const OX = 548, OY = 306;
const P = (x: number, y: number, z = 0) => [OX + (x - y) * CX, OY + (x + y) * SY - z] as const;
const pts = (a: (readonly [number, number])[]) => a.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");

type Tile = { id: string; x: number; y: number; s: number; h: number; label: string; sub?: string; tone?: "brand"; float?: string; glyph: React.ReactNode };

function Slab({ t }: { t: Tile }) {
  const { x, y, s, h } = t;
  const z = 6;
  const top = [P(x, y, z + h), P(x + s, y, z + h), P(x + s, y + s, z + h), P(x, y + s, z + h)];
  const left = [P(x, y + s, z + h), P(x + s, y + s, z + h), P(x + s, y + s, z), P(x, y + s, z)];
  const right = [P(x + s, y, z + h), P(x + s, y + s, z + h), P(x + s, y + s, z), P(x + s, y, z)];
  const i = s * 0.17;
  const plate = [P(x + i, y + i, z + h), P(x + s - i, y + i, z + h), P(x + s - i, y + s - i, z + h), P(x + i, y + s - i, z + h)];
  const [cx, cy] = P(x + s / 2, y + s / 2, z + h);
  const [sx, sy] = P(x + s / 2, y + s / 2, 0);
  const brand = t.tone === "brand";
  const lw = Math.max(t.label.length * 6.6, (t.sub?.length ?? 0) * 5.6) + 26;
  const [lx, ly] = P(x + s / 2, y + s / 2, z + h + s * SY + (t.sub ? 24 : 18));
  return (
    <g className={`lp-float ${t.float ?? ""}`}>
      <ellipse cx={sx} cy={sy + 4} rx={s * CX * 0.82} ry={s * SY * 0.82} fill="#1e3a2b" opacity=".05" />
      <polygon points={pts(left)} fill="#eef2ef" stroke="#cfd7d2" strokeLinejoin="round" />
      <polygon points={pts(right)} fill="#e3e9e5" stroke="#cfd7d2" strokeLinejoin="round" />
      <polygon points={pts(top)} fill="#fff" stroke="#cfd7d2" strokeLinejoin="round" />
      <polygon points={pts(plate)} fill={brand ? "url(#veil-g)" : "#f3f7f4"} stroke={brand ? "#17301f" : "#dbe3de"} strokeLinejoin="round" />
      <g transform={`matrix(0.866 0.5 -0.866 0.5 ${cx.toFixed(1)} ${cy.toFixed(1)})`} stroke={brand ? "#eaf6ee" : "#2b7850"} fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        {/* rotate so the glyph reads upright on screen instead of along a grid axis */}
        <g transform="rotate(-45)">{t.glyph}</g>
      </g>
      <g>
        <rect x={lx - lw / 2} y={ly - (t.sub ? 19 : 13)} width={lw} height={t.sub ? 38 : 26} rx="13" fill="#fff" stroke="#e1e6e3" />
        <text x={lx} y={ly + (t.sub ? -3 : 4)} textAnchor="middle" fontSize="12" fontWeight="600" fill="#1c2822" style={{ fontFamily: "var(--v-sans)" }}>{t.label}</text>
        {t.sub && <text x={lx} y={ly + 11} textAnchor="middle" fontSize="9.5" fill="#7b8882" style={{ fontFamily: "var(--v-mono)" }}>{t.sub}</text>}
      </g>
    </g>
  );
}

const TILES: Tile[] = [
  { id: "wallet", x: -7.6, y: -1, s: 2, h: 14, label: "Your wallet", float: "d2",
    glyph: <><rect x="-17" y="-12" width="34" height="24" rx="5" /><path d="M5 0h12" /><circle cx="8" cy="0" r="1.6" fill="currentColor" /></> },
  { id: "zk", x: -4.4, y: -1, s: 2, h: 14, label: "ZK registry", sub: "nullifier + expiry", float: "d3",
    glyph: <><circle r="16" /><circle r="9.5" /><circle r="3" fill="#2b7850" stroke="none" /></> },
  { id: "vault", x: -1.6, y: -1.6, s: 3.2, h: 26, label: "Veil vault", sub: "vRWA shares", tone: "brand",
    glyph: <><path d="M-22 -16 0 22l22-38" strokeWidth="4" /><path d="M-9 -16 0 0l9-16" strokeWidth="2.4" opacity=".6" /></> },
  { id: "tbill", x: 3, y: -4.2, s: 2, h: 14, label: "T-bills", sub: "60%", float: "d2",
    glyph: <><path d="M-15 -11h30M-15 0h30M-15 11h30" /></> },
  { id: "exchange", x: 3, y: -0.2, s: 2, h: 14, label: "Exchange", sub: "TSLA iAsset perp", float: "d3",
    glyph: <><path d="M-13 -14v28M0 -8v20M13 -15v24" strokeWidth="5" /></> },
  { id: "agent", x: 3, y: 3.2, s: 2, h: 14, label: "Risk agent", sub: "bounded mandate",
    glyph: <><rect x="-15" y="-13" width="30" height="26" rx="6" /><circle cx="-6" cy="-1" r="2" fill="#2b7850" stroke="none" /><circle cx="6" cy="-1" r="2" fill="#2b7850" stroke="none" /><path d="M-5 7h10" /></> },
];

const line = (a: [number, number], b: [number, number]) => `M${P(a[0], a[1], 4).join(" ")}L${P(b[0], b[1], 4).join(" ")}`;
const FLOWS: [[number, number], [number, number]][] = [
  [[-5.6, 0], [-4.4, 0]], // wallet -> zk
  [[-2.4, 0], [-1.6, 0]], // zk -> vault
  [[1.6, -1], [2.3, -1]], [[2.3, -1], [2.3, -3.2]], [[2.3, -3.2], [3, -3.2]], // vault -> tbill
  [[1.6, 0.8], [3, 0.8]], // vault -> exchange
  [[4, 3.2], [4, 1.8]], // agent -> exchange
];

export function IsoScene() {
  const grid: string[] = [];
  for (let i = -13; i <= 13; i++) {
    grid.push(`M${P(i, -13).join(" ")}L${P(i, 13).join(" ")}`);
    grid.push(`M${P(-13, i).join(" ")}L${P(13, i).join(" ")}`);
  }
  return (
    <svg className="lp-scene" viewBox="0 0 1120 596" role="img" aria-label="A wallet proves a credential to the ZK registry, deposits into the Veil vault, which holds T-bills and a hedge on the exchange managed by a bounded risk agent.">
      <defs>
        <linearGradient id="veil-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2f7751" /><stop offset="1" stopColor="#1e3a2b" /></linearGradient>
        <radialGradient id="veil-fade" cx="50%" cy="46%" r="62%"><stop offset=".55" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" /></radialGradient>
      </defs>
      <path d={grid.join("")} stroke="#edf1ee" strokeWidth="1" fill="none" />
      <rect width="1120" height="596" fill="url(#veil-fade)" />
      {FLOWS.map((f, i) => <path key={`b${i}`} d={line(f[0], f[1])} stroke="#cfe6d7" strokeWidth="3" strokeLinecap="round" fill="none" />)}
      {FLOWS.map((f, i) => <path key={i} className="lp-flow" d={line(f[0], f[1])} stroke="#2b7850" strokeWidth="2" strokeLinecap="round" fill="none" />)}
      {TILES.map((t) => <Slab key={t.id} t={t} />)}
    </svg>
  );
}

/** Leverage through a week: cut before the Friday close, frozen oracle band, Monday gap. */
export function GapChart() {
  const x = (d: number) => 44 + d * 70; // d: 0 = Mon … 7 = next Mon
  const y = (lev: number) => 150 - lev * 20;
  const guarded = `M${x(0)} ${y(6)}H${x(4.55)}L${x(4.75)} ${y(3.3)}H${x(7)}`;
  const naive = `M${x(4.55)} ${y(6)}H${x(7)}`;
  return (
    <svg className="lp-chart" viewBox="0 0 560 190" width="100%" role="img" aria-label="Leverage is cut from 6x to 3.3x before the Friday close and held through the frozen weekend, so the Monday gap does not liquidate the position.">
      {[0, 2, 4, 6].map((l) => <g key={l}><path d={`M44 ${y(l)}H534`} stroke="#eef1ef" /><text x="36" y={y(l) + 3} textAnchor="end">{l}x</text></g>)}
      <rect x={x(4.75)} y="14" width={x(7) - x(4.75)} height="136" fill="#fdf6e6" />
      <text x={(x(4.75) + x(7)) / 2} y="28" textAnchor="middle" fill="#a8741f">ORACLE FROZEN</text>
      <path d={naive} stroke="#c9d0cc" strokeWidth="2" strokeDasharray="4 5" fill="none" />
      <path d={guarded} stroke="#2b7850" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
      <path d={`M${x(7)} 18V150`} stroke="#ab4634" strokeDasharray="3 4" />
      <circle cx={x(7)} cy={y(6)} r="4.5" fill="#fff" stroke="#ab4634" strokeWidth="2" />
      <text x={x(7) - 9} y={y(6) - 9} textAnchor="end" fill="#ab4634">6x: liquidated</text>
      <circle cx={x(7)} cy={y(3.3)} r="4.5" fill="#2b7850" />
      <text x={x(7) - 9} y={y(3.3) + 16} textAnchor="end" fill="#2b7850">3.3x: survives</text>
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"].map((d, i) => <text key={i} x={x(i)} y="172" textAnchor="middle">{d}</text>)}
    </svg>
  );
}
