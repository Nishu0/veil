import type { Metadata } from "next";

export const metadata: Metadata = { title: "Demo · VEIL" };

export default function Demo() {
  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", background: "var(--v-paper)", padding: "20px" }}>
      <video
        controls
        preload="metadata"
        playsInline
        src="/veil-demo.mp4"
        style={{ width: "min(1280px, 100%)", borderRadius: 14, border: "1px solid var(--v-line)", boxShadow: "0 24px 60px -30px #1e3a2b59", background: "#000", display: "block" }}
      />
    </main>
  );
}
