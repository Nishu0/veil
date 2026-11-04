const usdFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** USDT / generic 2-decimal amounts with thousands separators. */
export function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return usdFmt.format(v)
}

export function fmtSignedUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return (v > 0 ? "+" : v < 0 ? "−" : "") + usdFmt.format(Math.abs(v))
}

export function fmtPrice(v: number | null | undefined): string {
  return fmtUsd(v)
}

export function fmtSharePrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

export function fmtLev(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  if (v > 1000) return "∞"
  return `${v.toFixed(2)}x`
}

export function fmtQty(v: number | null | undefined, digits = 4): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

export function fmtPct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "—"
  return `${v.toFixed(digits)}%`
}

export function truncate(v: string | null | undefined, head = 6, tail = 4): string {
  if (!v) return "—"
  if (v.length <= head + tail + 1) return v
  return `${v.slice(0, head)}…${v.slice(-tail)}`
}

/** Unix seconds -> local date/time string. */
export function fmtTime(sec: number | null | undefined): string {
  if (!sec) return "—"
  return new Date(sec * 1000).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

export function fmtDate(sec: number | null | undefined): string {
  if (!sec) return "—"
  return new Date(sec * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

/** "2d 4h 10m" style countdown to unix seconds `until` from `nowMs`. */
export function fmtCountdown(until: number, nowMs: number): string {
  let s = Math.floor(until - nowMs / 1000)
  if (s <= 0) return "expired"
  const d = Math.floor(s / 86400); s -= d * 86400
  const h = Math.floor(s / 3600); s -= h * 3600
  const m = Math.floor(s / 60); s -= m * 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

export const SESSION_LABEL: Record<"Open" | "PreClose" | "Weekend", string> = {
  Open: "Open",
  PreClose: "Friday pre-close",
  Weekend: "Weekend · oracle frozen",
}

/** True when a human amount string is a positive decimal number. */
export function isPositiveAmount(v: string): boolean {
  return /^\d+(\.\d{1,6})?$/.test(v.trim()) && Number(v) > 0
}
