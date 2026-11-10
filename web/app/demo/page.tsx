import type { Metadata } from "next";

export const metadata: Metadata = { title: "Demo · VEIL" };

export default function Demo() {
  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", background: "var(--v-paper)", padding: "28px 20px" }}>
      <div style={{ width: "min(1120px, 100%)", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, font: "600 19px var(--v-sans)", letterSpacing: "-0.045em", color: "var(--v-ink)" }}>
          <span className="vd-brand-mark">V</span>
          VEIL · 70-second demo
          <a className="v-btn" href="/dashboard" style={{ marginLeft: "auto" }}>
            Open the app
          </a>
        </div>
        <video
          controls
          preload="metadata"
          playsInline
          src="/veil-demo.mp4"
          style={{ width: "100%", borderRadius: 14, border: "1px solid var(--v-line)", boxShadow: "0 24px 60px -30px #1e3a2b59", background: "#000", display: "block" }}
        />
        <p style={{ margin: 0, color: "var(--v-mute)", font: "400 13px/1.55 var(--v-sans)" }}>
          A private, compliant prime account on Injective — the credential, the zero-knowledge proof, permissioned transfers, the weekend gap, and the agent&apos;s mandate.
        </p>
      </div>
    </main>
  );
}
