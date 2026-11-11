"use client";

// Landing hero backdrop: lines of text on two receding planes (a ceiling and a floor) that
// vanish into the Veil mark. The ceiling carries what stays private, the floor what the chain sees.
// Hovering pushes nearby lines aside; pressing a line grabs it, and it springs back when released.
import * as React from "react";

const PRIVATE = [
  "name ████", "passport ██████", "jurisdiction ███", "accredited investor", "KYC passed", "holder secret ██████",
  "issuer signature ok", "date of birth ██/██/████", "address ████████", "credential valid until 2026-12-11", "Poseidon(secret, 1)",
  "documents never leave this browser", "eligible · nothing else revealed", "zero-knowledge proof", "Groth16",
];
const PUBLIC = [
  "nullifier 0x1b7e…90aa", "proof verified", "wallet 0x9a3f…c21e", "mint 2,500 vRWA", "TransferRestricted", "transfer allowed",
  "T-bills 60% · margin 30% · idle 10%", "mandate 2,500 USDT · 7d", "leverage 6.0x → 3.3x", "oracle frozen", "Monday gap +18%",
  "position survives", "SpendLimitExceeded", "NotAuthorized", "decision hash 0xdb6c…5c97", "TSLA iAsset perp · reduce-only",
];

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type Atlas = { img: HTMLCanvasElement; at: Map<string, number>; cw: number; ch: number };
/** Every character rasterised once, side by side; frames then only stamp from it. */
function makeAtlas(chars: string[], px: number, family: string): Atlas {
  const img = document.createElement("canvas");
  const m = img.getContext("2d")!;
  m.font = `500 ${px}px ${family}`;
  const cw = Math.ceil(m.measureText("M").width) + 2, ch = Math.ceil(px * 1.25);
  img.width = cw * chars.length; img.height = ch;
  const c = img.getContext("2d")!;
  c.font = `500 ${px}px ${family}`; c.textAlign = "center"; c.textBaseline = "middle";
  const at = new Map<string, number>();
  chars.forEach((s, i) => { c.fillStyle = s === "█" ? "#7fa08d" : "#236a45"; c.fillText(s, i * cw + cw / 2, ch / 2); at.set(s, i * cw); });
  return { img, at, cw, ch };
}

type Plane = { sign: 1 | -1; D: number; q: number; zc: number; slots: number };
type Lane = { X: number; plane: Plane; text: string; bright: number; edge: number; off: number; s0: number; far: [number, number] };
type Grab = { lane: number; ax: number; ay: number; ox: number; oy: number; vx: number; vy: number; held: boolean };

const Z_END = 0.92;   // depth where a line enters, just past the edge of the hero
const SPEED = 2.2;    // characters per second

export function HeroTunnel() {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = ref.current, host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const still = document.createElement("canvas"); // guide lines and glow, painted once per resize
    const chars = [...new Set([...PRIVATE, ...PUBLIC].join(""))].filter((c) => c !== " ");

    let big: Atlas | null = null, small: Atlas | null = null;
    let W = 0, H = 0, cx = 0, cy = 0, spreadW = 1, E = 1;
    let lanes: Lane[] = [];
    let raf = 0, visible = true, alive = true, painted = 0;
    const t0 = performance.now();
    const pointer = { x: -1e4, y: -1e4, inside: false };
    let hover = 0;            // eases to 1 while the pointer is over the hero
    let grab: Grab | null = null;

    const pos = (X: number, d: number, p: Plane): [number, number] => [cx + (X * spreadW) / d, cy + (p.sign * p.D) / d];

    const build = () => {
      const family = `${getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() || "ui-monospace"}, ui-monospace, Menlo, monospace`;
      big = makeAtlas(chars, 36, family);
      small = makeAtlas(chars, 14, family);
    };

    const layout = () => {
      const box = host.getBoundingClientRect();
      W = box.width; H = box.height;
      if (W < 1 || H < 1) return;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      still.width = canvas.width; still.height = canvas.height;
      // the vanishing point is the centre of the Veil mark
      const orb = host.querySelector(".hx-disc")?.getBoundingClientRect();
      cx = orb ? orb.left - box.left + orb.width / 2 : W / 2;
      cy = orb ? orb.top - box.top + orb.height / 2 : H / 2;
      const narrow = W < 700;
      spreadW = W * (narrow ? 1.05 : 0.78);
      const count = Math.max(12, Math.round((2 * spreadW) / (narrow ? 15 : 22))); // one line every ~22px at the near edge
      E = (2 * spreadW) / count;                     // lane spacing (and glyph height) at depth 1
      const plane = (sign: 1 | -1, dist: number): Plane => {
        const D = Math.max(120, dist);
        // q is chosen so a character at the near edge is as wide as it is tall x 0.62
        const q = 1 / Math.sqrt(1 - Math.min(0.5, (0.62 * E) / D)) - 1;
        const zc = Math.max(1.6, Math.pow((q * D) / 1.1, 2 / 3));
        return { sign, D, q, zc, slots: (Math.sqrt(zc) - 1) / q };
      };
      const planes = [plane(1, H - cy), plane(-1, cy)];
      const rand = rng(7);
      lanes = [];
      for (const p of planes) {
        const pool = p.sign < 0 ? PRIVATE : PUBLIC;
        for (let i = 0; i < count; i++) {
          const X = -1 + ((i + 0.5) * 2) / count;
          let text = "";
          while (text.length < 300) text += `${pool[Math.floor(rand() * pool.length)]}    `;
          const roll = rand();
          lanes.push({
            X, plane: p, text,
            bright: roll < 0.1 ? 1 : roll < 0.3 ? 0.45 : 0.6 + 0.35 * rand(),
            edge: 1 - smooth(0.45, 1, Math.abs(X)),
            off: Math.floor(rand() * text.length),
            s0: Math.floor((Math.sqrt(Z_END) - 1) / p.q) - 1,
            far: pos(X, Z_END, p),
          });
        }
      }
      // static layer: a soft glow and one faint guide line per lane
      const s = still.getContext("2d")!;
      s.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.clearRect(0, 0, W, H);
      const glow = s.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W * 0.42, H * 0.62));
      glow.addColorStop(0, "rgba(53,176,122,0.16)"); glow.addColorStop(1, "rgba(53,176,122,0)");
      s.fillStyle = glow; s.fillRect(0, 0, W, H);
      s.lineWidth = 0.8;
      for (const l of lanes) {
        const a = 0.14 * l.bright * l.edge;
        if (a < 0.01) continue;
        const g = s.createLinearGradient(l.far[0], l.far[1], cx, cy);
        g.addColorStop(0, "rgba(43,120,80,0)"); g.addColorStop(0.55, `rgba(43,120,80,${(a * 0.6).toFixed(3)})`);
        g.addColorStop(0.9, `rgba(43,120,80,${a.toFixed(3)})`); g.addColorStop(1, "rgba(43,120,80,0)");
        s.strokeStyle = g; s.beginPath(); s.moveTo(l.far[0], l.far[1]); s.lineTo(cx, cy); s.stroke();
      }
      paint(performance.now());
    };

    /** How far a point on lane `li` is pushed: away from the pointer on hover, with the drag when grabbed. */
    const shift = (x: number, y: number, li: number, nx: number, ny: number): [number, number] => {
      let dx = 0, dy = 0;
      if (hover > 0.01 && grab?.lane !== li) {
        const px = x - pointer.x, py = y - pointer.y, d2 = px * px + py * py;
        if (d2 < 101_400) {
          const k = 14 * hover * Math.tanh((px * nx + py * ny) / 22) * Math.exp(-d2 / 16_900);
          dx += nx * k; dy += ny * k;
        }
      }
      if (grab?.lane === li) {
        const f = Math.exp(-((x - grab.ax) ** 2 + (y - grab.ay) ** 2) / 28_900);
        dx += grab.ox * f; dy += grab.oy * f;
      }
      return [dx, dy];
    };

    const paint = (now: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(still, 0, 0);
      if (!big || !small) return;
      const travel = reduce ? 0 : ((now - t0) / 1000) * SPEED;
      const whole = Math.floor(travel), frac = travel - whole;
      const live = hover > 0.01 || grab !== null;
      for (let li = 0; li < lanes.length; li++) {
        const l = lanes[li];
        if (l.edge * l.bright < 0.02) continue;
        const p = l.plane, n = l.text.length, count = Math.ceil(p.slots - l.s0) + 2;
        for (let c = 0; c < count; c++) {
          // each character sits in a depth slot; the text slides through the slots toward the mark
          const slot = l.s0 + c + frac;
          const d = (1 + p.q * slot) ** 2;
          if (d >= p.zc) break;
          if (d < Z_END) continue;
          const ch = l.text[(((l.s0 + c - whole + l.off) % n) + n) % n];
          if (ch === " ") continue;
          let x0 = cx + (l.X * spreadW) / d, y0 = cy + (p.sign * p.D) / d;
          if (y0 > H + 20 || y0 < -20 || x0 < -40 || x0 > W + 40) continue;
          const d1 = (1 + p.q * (slot + 1)) ** 2;
          let x1 = cx + (l.X * spreadW) / d1, y1 = cy + (p.sign * p.D) / d1;
          let vx = x1 - x0, vy = y1 - y0, len = Math.hypot(vx, vy) || 1;
          if (live) {
            const nx = -vy / len, ny = vx / len;
            const a = shift(x0, y0, li, nx, ny), b = shift(x1, y1, li, nx, ny);
            x0 += a[0]; y0 += a[1]; x1 += b[0]; y1 += b[1];
            vx = x1 - x0; vy = y1 - y0; len = Math.hypot(vx, vy) || 1;
          }
          const k = (p.zc - d) / (p.zc - Z_END);            // 1 at the edge, 0 at the mark
          const alpha = 0.66 * l.bright * l.edge * smooth(0, 0.55, k) * (0.35 + 0.65 * Math.min(1, k));
          if (alpha < 0.02) continue;
          const tall = (0.95 * E) / d;
          const A = tall * dpr < 16 ? small : big;
          const sx = A.at.get(ch);
          if (sx === undefined) continue;
          // stretch the glyph box onto the segment between this slot and the next, so text follows a bent line
          const nx = -vy / len, ny = vx / len;
          ctx.globalAlpha = alpha;
          ctx.setTransform((dpr * vx) / A.cw, (dpr * vy) / A.cw, (dpr * nx * tall) / A.ch, (dpr * ny * tall) / A.ch, (dpr * (x0 + x1)) / 2, (dpr * (y0 + y1)) / 2);
          ctx.drawImage(A.img, sx, 0, A.cw, A.ch, -A.cw / 2, -A.ch / 2, A.cw, A.ch);
        }
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    const frame = (now: number) => {
      raf = 0;
      hover += ((pointer.inside ? 1 : 0) - hover) * 0.07;
      if (grab && !grab.held) {
        // released: a damped spring pulls the line back
        grab.vx = (grab.vx - 0.09 * grab.ox) * 0.86; grab.vy = (grab.vy - 0.09 * grab.oy) * 0.86;
        grab.ox += grab.vx; grab.oy += grab.vy;
        if (Math.hypot(grab.ox, grab.oy) < 0.3 && Math.hypot(grab.vx, grab.vy) < 0.3) grab = null;
      }
      if (hover > 0.01 || grab || now - painted >= 32) { painted = now; paint(now); }
      if (visible && alive && !(reduce && !grab && hover < 0.01)) raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf && alive) raf = requestAnimationFrame(frame); };

    // which line is under the pointer, if any
    const laneAt = (x: number, y: number) => {
      let hit = -1, best = 14;
      lanes.forEach((l, i) => {
        if (l.edge * l.bright < 0.08) return;
        const ux = l.far[0] - cx, uy = l.far[1] - cy, len = Math.hypot(ux, uy) || 1;
        const along = ((x - cx) * ux + (y - cy) * uy) / len;
        if (along < 46 || along > len) return;
        const off = Math.abs((x - cx) * uy - (y - cy) * ux) / len;
        if (off < best) { best = off; hit = i; }
      });
      return hit;
    };
    const local = (e: PointerEvent): [number, number] => { const b = host.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const onControl = (e: PointerEvent) => !!(e.target as Element | null)?.closest?.("a, button");

    const move = (e: PointerEvent) => {
      const [x, y] = local(e);
      pointer.x = x; pointer.y = y; pointer.inside = true;
      if (grab?.held) { grab.ox = x - grab.ax; grab.oy = y - grab.ay; }
      else host.style.cursor = !onControl(e) && laneAt(x, y) >= 0 ? "grab" : "";
      wake();
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || onControl(e)) return;
      const [x, y] = local(e);
      const lane = laneAt(x, y);
      if (lane < 0) return;
      e.preventDefault();
      grab = { lane, ax: x, ay: y, ox: 0, oy: 0, vx: 0, vy: 0, held: true };
      host.setPointerCapture(e.pointerId);
      host.style.cursor = "grabbing";
      wake();
    };
    const up = (e: PointerEvent) => {
      if (grab?.held) { grab.held = false; host.releasePointerCapture?.(e.pointerId); host.style.cursor = ""; wake(); }
    };
    const leave = () => { pointer.inside = false; wake(); };

    build(); layout();
    void document.fonts.ready.then(() => { if (alive) { build(); layout(); } });
    const ro = new ResizeObserver(layout); ro.observe(host);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); });
    io.observe(canvas);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    host.addEventListener("pointerleave", leave);
    if (!reduce) wake();

    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      host.removeEventListener("pointermove", move); host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointerup", up); host.removeEventListener("pointercancel", up); host.removeEventListener("pointerleave", leave);
    };
  }, []);

  return <canvas ref={ref} className="hx-canvas" aria-hidden />;
}
