"use client";

// The centre of the hero: an accretion disc of short streaks orbiting the Veil mark, a bright ring
// passing in front of it, and a lensed halo over the top. Two canvases: one sharp, one blurred copy for glow.
import * as React from "react";

const W = 680, H = 400, R = 64;          // logical canvas size and the mark's radius (disc + its border)
const TILT = 0.2, ROLL = (-7 * Math.PI) / 180;

type Streak = { r: number; a: number; w: number; len: number; level: number; width: number };

export function HeroOrb() {
  const sharp = React.useRef<HTMLCanvasElement>(null);
  const soft = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const cv = sharp.current, glow = soft.current;
    if (!cv || !glow) return;
    const ctx = cv.getContext("2d"), gtx = glow.getContext("2d");
    if (!ctx || !gtx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [cv, glow]) { c.width = W * dpr; c.height = H * dpr; }
    const cx = W / 2, cy = H / 2, cosR = Math.cos(ROLL), sinR = Math.sin(ROLL);

    // deterministic pseudo-random so the disc looks the same on every load
    let seed = 11;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const streaks: Streak[] = Array.from({ length: 1100 }, () => {
      const u = rnd();
      const r = R * (1.12 + 3.9 * Math.pow(u, 1.7));           // crowded near the mark, sparse outside
      const near = (R * 1.12) / r;
      return {
        r, a: rnd() * Math.PI * 2,
        w: 0.5 * Math.pow(near, 1.5) + 0.03,                     // inner orbits are faster
        len: 0.035 + 0.11 * near * (0.5 + rnd()),
        level: Math.min(3, Math.floor((0.25 + 0.75 * near) * (0.55 + 0.45 * rnd()) * 4)),
        width: 0.7 + 1.1 * near * rnd(),
      };
    });
    const halo = Array.from({ length: 170 }, () => ({ r: R * (1.07 + 0.5 * Math.pow(rnd(), 1.6)), a: rnd() * Math.PI * 2, w: 0.1 + 0.25 * rnd(), len: 0.05 + 0.12 * rnd() }));

    // a point on a tilted, slightly rolled orbit
    const at = (r: number, a: number): [number, number] => {
      const x = r * Math.cos(a), y = r * Math.sin(a) * TILT;
      return [cx + x * cosR - y * sinR, cy + x * sinR + y * cosR];
    };
    const ALPHA = [0.2, 0.36, 0.55, 0.8];

    const drawStreaks = (t: number, front: boolean) => {
      for (let level = 0; level < 4; level++) {
        ctx.beginPath();
        for (const s of streaks) {
          if (s.level !== level) continue;
          const a = s.a + t * s.w;
          if (Math.sin(a) > 0 !== front) continue;               // sin > 0 is the half nearer the viewer
          const [x0, y0] = at(s.r, a), [x1, y1] = at(s.r, a + s.len);
          ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        }
        ctx.strokeStyle = `rgba(${level > 1 ? "38,132,86" : "43,120,80"},${ALPHA[level] * (front ? 1 : 0.6)})`;
        ctx.lineWidth = 0.8 + level * 0.3;
        ctx.stroke();
      }
    };
    const ring = (rx: number, from: number, to: number, alpha: number, width: number) => {
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, rx * TILT, ROLL, from, to);
      ctx.strokeStyle = `rgba(30,110,70,${alpha})`; ctx.lineWidth = width; ctx.stroke();
    };

    const draw = (ms: number) => {
      const t = reduce ? 0 : ms / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = "round";

      // behind the mark: everything here is clipped to outside the disc
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, R, 0, Math.PI * 2, true); ctx.clip("evenodd");
      drawStreaks(t, false);
      ring(R * 1.72, Math.PI, Math.PI * 2, 0.3, 1.2);
      // lensed halo: light from the far side of the disc bent over the top of the mark
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (const h of halo) {
          const a = h.a + t * h.w, up = -Math.sin(a);            // 1 at the top, -1 at the bottom
          if (pass === 0 ? up < 0.15 : up > -0.35) continue;
          ctx.moveTo(cx + h.r * Math.cos(a), cy + h.r * Math.sin(a));
          ctx.arc(cx, cy, h.r, a, a + h.len);
        }
        ctx.strokeStyle = `rgba(38,132,86,${pass === 0 ? 0.5 : 0.16})`;
        ctx.lineWidth = pass === 0 ? 1.2 : 0.9;
        ctx.stroke();
      }
      ctx.restore();

      // in front of the mark
      drawStreaks(t, true);
      ring(R * 1.72, 0, Math.PI, 0.85, 2);
      ring(R * 1.5, 0.25, Math.PI - 0.25, 0.35, 1);

      gtx.setTransform(1, 0, 0, 1, 0, 0);
      gtx.clearRect(0, 0, glow.width, glow.height);
      gtx.drawImage(cv, 0, 0);
    };

    let raf = 0, visible = true;
    const loop = (ms: number) => { if (visible) draw(ms); raf = requestAnimationFrame(loop); };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(cv);
    if (reduce) draw(0); else raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  return (
    <>
      <canvas ref={soft} className="hx-disc-glow" aria-hidden />
      <canvas ref={sharp} className="hx-disc-fx" aria-hidden />
    </>
  );
}
