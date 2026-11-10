"use client";

import * as React from "react";

/** One 1920x1080 slide, scaled to the width of its container. */
export function DeckSlide({ html, label }: { html: string; label: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1920));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="dk-frame" role="img" aria-label={label}>
      <div className="dk-canvas" style={{ transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
