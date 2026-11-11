"use client";

import * as React from "react";

/** The landing nav stays out of the way over the hero and slides in once the hero has scrolled past. */
export function LandingNav({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const hero = document.querySelector(".hx");
    if (!hero) return;
    const io = new IntersectionObserver(([e]) => setShown(!e.isIntersecting), { rootMargin: "-72px 0px 0px 0px" });
    io.observe(hero);
    return () => io.disconnect();
  }, []);
  return <div className={`lp-nav-wrap${shown ? " is-shown" : ""}`} aria-hidden={!shown} inert={!shown}>{children}</div>;
}
