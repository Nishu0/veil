import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DeckSlide } from "@/components/veil/deck-slide";
import { VeilMark } from "@/components/veil/ui";

export const metadata: Metadata = { title: "Veil — pitch deck" };

const ORDER = ["cover", "problem", "solution", "built", "plan"];
const LABELS = ["Cover", "The problem", "The solution", "What we built", "The ten days"];

// The slide format's icon element, drawn here as plain SVG.
const ICONS: Record<string, string> = {
  Lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  Database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  Trust: '<path d="M12 3 20 6v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
};

/** Slide files are written for a 1920x1080 canvas with inline styles; adapt them to this page. */
function prepare(id: string): string {
  let html = readFileSync(path.join(process.cwd(), "content/deck", `${id}.html`), "utf8");
  html = html.replace(/<aside>[\s\S]*?<\/aside>/, ""); // speaker notes stay off the page
  html = html.replace(/'Instrument Serif'/g, "var(--font-instrument-serif)").replace(/'Instrument Sans'/g, "var(--font-instrument-sans)");
  html = html.replace(/<x-icon name="(\w+)" style="color:([^;"]+);width:(\d+)px;height:(\d+)px"><\/x-icon>/g, (_, name, color, w, h) =>
    `<svg width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`);
  return html.replace(/<section id="(\w+)"[^>]*style="/, (m) => `${m}width:1920px;height:1080px;box-sizing:border-box;position:relative;overflow:hidden;`);
}

export default function DeckPage() {
  const slides = ORDER.map(prepare);
  return (
    <div className="dk">
      <header className="dk-top">
        <Link href="/" className="lp-brand"><span><VeilMark size={17} /></span>Veil</Link>
        <span>Pitch deck · {slides.length} slides</span>
        <Link href="/dashboard" className="v-btn is-primary">Launch app</Link>
      </header>
      <main className="dk-list">
        {slides.map((html, i) => (
          <section key={ORDER[i]} id={`slide-${i + 1}`}>
            <p className="dk-n">{String(i + 1).padStart(2, "0")} · {LABELS[i]}</p>
            <DeckSlide html={html} label={`Slide ${i + 1}: ${LABELS[i]}`} />
          </section>
        ))}
      </main>
    </div>
  );
}
