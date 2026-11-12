// Product analytics (self-hosted Umami at stats.veilrwa.xyz). No cookies, no wallet addresses, no names:
// only an event name and, where useful, a coarse label.
declare global {
  interface Window { umami?: { track: (event: string, data?: Record<string, string | number | boolean>) => void } }
}

export function track(event: string, data?: Record<string, string | number | boolean>) {
  try { window.umami?.track(event, data); } catch { /* analytics must never break the app */ }
}
