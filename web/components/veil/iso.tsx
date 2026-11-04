// Isometric hero illustration, drawn as plain SVG (server component).
const C = 0.866, S = 0.5, U = 34, OX = 520, OY = 96;
const P = (x: number, y: number, z = 0): [number, number] => [OX + (x - y) * C * U, OY + (x + y) * S * U - z * U];
const pts = (a: [number, number][]) => a.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");

function Slab({ x, y, w, d, z = 0, h, top, side, edge }: { x: number; y: number; w: number; d: number; z?: number; h: number; top: string; side: [string, string]; edge: string }) {
  const t = z + h;
  return (
    <g stroke={edge} strokeWidth="1.2" strokeLinejoin="round">
      <polygon points={pts([P(x, y + d, t), P(x + w, y + d, t), P(x + w, y + d, z), P(x, y + d, z)])} fill={side[0]} />
      <polygon points={pts([P(x + w, y, t), P(x + w, y + d, t), P(x + w, y + d, z), P(x + w, y, z)])} fill={side[1]} />
      <polygon points={pts([P(x, y, t), P(x + w, y, t), P(x + w, y + d, t), P(x, y + d, t)])} fill={top} />
    </g>
  );
}

type TileProps = { cx: number; cy: number; size?: number; label: string; tone?: "brand" | "plain" | "blocked"; glyph: React.ReactNode; float?: string };
function Tile({ cx, cy, size = 4, label, tone = "plain", glyph, float = "" }: TileProps) {
  const x = cx - size / 2, y = cy - size / 2, pad = size - 1.3, px = cx - pad / 2, py = cy - pad / 2;
  const brand = tone === "brand", blocked = tone === "blocked";
  const [gx, gy] = P(px, py, 0.62);
  const [lx, ly] = P(cx, cy, 0.62);
  const tw = label.length * 6.6 + 22;
  return (
    <g>
      <ellipse cx={P(cx, cy)[0]} cy={P(cx, cy)[1] + 20} rx={size * 26} ry={size * 9.5} fill="#1e3a2b" opacity=".045" />
      <g className={`lp-float ${float}`}>
        <Slab x={x} y={y} w={size} d={size} h={0.34} top="#ffffff" side={["#f1f4f2", "#e7ece9"]} edge={blocked ? "#e6c3ba" : "#d3dbd6"} />
        <Slab x={px} y={py} w={pad} d={pad} z={0.34} h={0.28} top={brand ? "#235a3c" : blocked ? "#fdf1ed" : "#f5f9f6"} side={brand ? ["#1a3f2b", "#163524"] : blocked ? ["#f6dcd5", "#f0cfc6"] : ["#e4ece7", "#dbe5df"]} edge={brand ? "#143021" : blocked ? "#e6b8ad" : "#cbd6cf"} />
        <g transform={`matrix(${C * U},${S * U},${-C * U},${S * U},${gx.toFixed(1)},${gy.toFixed(1)}) scale(${pad})`} fill="none" stroke={brand ? "#e9f6ee" : blocked ? "#ab4634" : "#2b7850"} strokeWidth={0.06} strokeLinecap="round" strokeLinejoin="round">
          {glyph}
        </g>
        <g transform={`translate(${(lx - tw / 2).toFixed(1)},${(ly - size * 17 - 34).toFixed(1)})`}>
          <rect width={tw} height="24" rx="12" fill="#fff" stroke={blocked ? "#f2d3ca" : "#e1e7e3"} />
          <circle cx="12" cy="12" r="3" fill={blocked ? "#cf5a44" : brand ? "#1e3a2b" : "#35b07a"} />
          <text x="21" y="16" fontSize="11.5" fontWeight="500" fill={blocked ? "#ab4634" : "#33423a"} style={{ fontFamily: "var(--v-sans)" }}>{label}</text>
        </g>
      </g>
    </g>
  );
}

function Link({ a, b, tone = "flow" }: { a: [number, number]; b: [number, number]; tone?: "flow" | "blocked" }) {
  const [x1, y1] = P(a[0], a[1], 0.1), [x2, y2] = P(b[0], b[1], 0.1);
  if (tone === "blocked") {
    const mx = x1 + (x2 - x1) * 0.56, my = y1 + (y2 - y1) * 0.56;
    return (
      <g>
        <line x1={x1} y1={y1} x2={mx} y2={my} stroke="#e3a898" strokeWidth="1.6" strokeDasharray="4 6" />
        <g transform={`translate(${mx.toFixed(1)},${my.toFixed(1)})`}>
          <circle r="10" fill="#fff" stroke="#e6b8ad" />
          <path d="M-3.4-3.4 3.4 3.4M3.4-3.4-3.4 3.4" stroke="#ab4634" strokeWidth="1.7" strokeLinecap="round" />
        </g>
      </g>
    );
  }
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#dbe3de" strokeWidth="5" strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#35b07a" strokeWidth="1.8" className="lp-flow" />
    </g>
  );
}

export function HeroScene() {
  const grid: React.ReactNode[] = [];
  for (let i = -24; i <= 40; i += 2) {
    const a = P(i, -30), b = P(i, 44), c = P(-30, i), d = P(44, i);
    grid.push(<line key={`x${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />, <line key={`y${i}`} x1={c[0]} y1={c[1]} x2={d[0]} y2={d[1]} />);
  }
  return (
    <svg className="lp-scene" viewBox="0 0 1080 520" role="img" aria-label="A wallet proves a credential to the registry, deposits into the vault, which holds T-bills and trades on the exchange through a bounded agent. An unverified wallet is blocked.">
      <g stroke="#eef2ef" strokeWidth="1">{grid}</g>
      <Link a={[-2, 11]} b={[5, 11]} />
      <Link a={[5, 11]} b={[5, 3]} />
      <Link a={[5, 3]} b={[5, -4]} />
      <Link a={[5, 3]} b={[13, 3]} />
      <Link a={[13, 3]} b={[13, -3]} />
      <Link a={[-3, 3]} b={[5, 3]} tone="blocked" />

      <Tile cx={5} cy={-4} label="Tokenized T-bills" float="d2" glyph={<><path d="M.22.3h.56M.22.5h.56M.22.7h.56" /></>} />
      <Tile cx={-3} cy={3} size={3.4} tone="blocked" label="Unverified wallet" float="d3" glyph={<><rect x=".2" y=".26" width=".6" height=".48" rx=".08" /><path d="M.56.5h.24" /></>} />
      <Tile cx={13} cy={-3} label="Risk agent · mandate" float="d3" glyph={<><circle cx=".5" cy=".5" r=".27" /><path d="M.4.47v.06M.6.47v.06M.5.14v.09" /></>} />
      <Tile cx={5} cy={3} size={5.2} tone="brand" label="Veil vault · vRWA" glyph={<><path d="M.2.3c.2.09.4.09.6 0" /><path d="M.25.32.5.78.75.32" /></>} />
      <Tile cx={-2} cy={11} label="Your wallet" float="d2" glyph={<><rect x=".2" y=".26" width=".6" height=".48" rx=".08" /><path d="M.56.5h.24" /></>} />
      <Tile cx={13} cy={3} label="Injective exchange" glyph={<><path d="M.2.68.38.5.52.6.8.3" /><path d="M.62.3h.18v.18" /></>} />
      <Tile cx={5} cy={11} label="ZK registry" float="d3" glyph={<><path d="M.5.16.76.27v.2c0 .17-.11.3-.26.36C.35.77.24.64.24.47v-.2z" /><path d="M.39.48.47.56.62.4" /></>} />
    </svg>
  );
}

/** Leverage through a weekend: stepped down before the close, flat while the oracle is frozen, restored on Monday. */
export function GapChart() {
  const X = (d: number) => 44 + d * 94, Y = (lev: number) => 176 - lev * 22;
  return (
    <svg className="lp-chart" viewBox="0 0 470 214" role="img" aria-label="Leverage is cut from 6x to 3.3x before the Friday close, held through the weekend freeze and restored on Monday.">
      <defs><pattern id="frz" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="7" stroke="#dfe6e2" strokeWidth="2" /></pattern></defs>
      {[0, 2, 4, 6].map((l) => <g key={l}><line x1="44" x2="452" y1={Y(l)} y2={Y(l)} stroke="#eef2ef" /><text x="12" y={Y(l) + 3.5}>{l}x</text></g>)}
      <rect x={X(1.62)} y="22" width={X(3.38) - X(1.62)} height="154" fill="url(#frz)" />
      <text x={X(2.5)} y="36" textAnchor="middle">ORACLE FROZEN</text>
      <path d={`M${X(0)} ${Y(6)}H${X(1.32)}V${Y(3.31)}H${X(3.5)}V${Y(6)}H${X(4.34)}`} fill="none" stroke="#2b7850" strokeWidth="2.4" strokeLinejoin="round" />
      <path d={`M${X(1.32)} ${Y(6)}H${X(3.38)}`} fill="none" stroke="#cf5a44" strokeWidth="1.6" strokeDasharray="4 5" />
      <g transform={`translate(${X(3.38)},${Y(6)})`}><circle r="8" fill="#fff" stroke="#e6b8ad" /><path d="M-2.8-2.8 2.8 2.8M2.8-2.8-2.8 2.8" stroke="#ab4634" strokeWidth="1.5" strokeLinecap="round" /></g>
      <circle cx={X(1.32)} cy={Y(3.31)} r="4" fill="#fff" stroke="#2b7850" strokeWidth="2" />
      <text x={X(1.32) - 8} y={Y(3.31) + 16} textAnchor="end" fill="#2b7850">agent cuts to 3.31x</text>
      <text x={X(3.38) - 14} y={Y(6) - 9} textAnchor="end" fill="#ab4634">unguarded 6x: liquidated at the gap</text>
      {["Thu", "Fri", "Sat", "Sun", "Mon"].map((d, i) => <text key={d} x={X(i + (i > 1 && i < 4 ? 0 : 0))} y="198" textAnchor="middle">{d}</text>)}
    </svg>
  );
}
