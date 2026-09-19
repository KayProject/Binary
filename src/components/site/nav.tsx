"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";

/**
 * How far down the floating pill's lower edge sits: `top-3` plus its own height, rounded
 * up. Used as the observer's top inset so the ink swaps when the ground beneath the PILL
 * changes, not when the light band leaves the viewport.
 */
const PILL_BAND_PX = 64;

const LINKS = [
  { href: "/#markets", label: "Markets" },
  { href: "/#how", label: "How it works" },
  { href: "/#liquidity", label: "Liquidity" },
];

/**
 * The landing navigation, in two forms: flat on the ground at the top of the page, and a
 * floating pill once you scroll past it.
 *
 * It deliberately sits OUTSIDE the light band and carries `.act-light` itself. That way
 * the same markup renders correctly over either ground by switching one class, instead of
 * every link and the wordmark each having to override its own colour.
 */
export function LandingNav() {
  const [revealed, setRevealed] = useState(false);
  const [overLight, setOverLight] = useState(true);
  const sentinel = useRef<HTMLDivElement>(null);

  /**
   * The pill appears the moment the in-flow nav leaves the top of the viewport.
   *
   * A zero-height sentinel beneath the nav is what's observed, rather than a scroll
   * offset — the nav's height moves with the viewport, and a hardcoded threshold would
   * drift out of step in silence. The in-flow header stays in the flow and the pill is a
   * separate fixed element; switching the header itself to fixed would pull it out of the
   * flow, shift the page up by its own height, drag the sentinel back into view and flap
   * the pill on and off at the threshold.
   */
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setRevealed(!entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * Which band the pill is floating over.
   *
   * Shrinking the root's top by the pill's own band is what makes this about the pill
   * rather than the viewport: the light band stops intersecting at the moment its bottom
   * edge passes under the pill, not when it leaves the screen.
   */
  useEffect(() => {
    const light = document.querySelector(".act-light");
    if (!light) return;
    const observer = new IntersectionObserver(([entry]) => setOverLight(entry.isIntersecting), {
      rootMargin: `-${PILL_BAND_PX}px 0px 0px 0px`,
      threshold: 0,
    });
    observer.observe(light);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <header className="act-light relative z-20 w-full bg-transparent">
        <div className="mx-auto w-full max-w-7xl px-6 py-6 sm:px-10">
          <Bar />
        </div>
      </header>

      {/* Marks where the nav ends. Zero height, so it changes no layout. */}
      <div ref={sentinel} aria-hidden className="h-0 w-full" />

      {revealed && (
        <div
          className={`fixed inset-x-0 top-3 z-40 px-4 sm:top-4 sm:px-6 ${
            overLight ? "act-light" : ""
          } bg-transparent`}
        >
          {/* Same width as the bar it replaces, rather than hugging its contents — a bar
              that shrinks to fit reads as a different object each time a label changes. */}
          <div className="mx-auto w-full max-w-7xl">
            <Bar floating />
          </div>
        </div>
      )}
    </>
  );
}

function Bar({ floating = false }: { floating?: boolean }) {
  return (
    <nav
      className={`flex items-center justify-between gap-4 ${
        floating
          ? "rounded-full border border-edge/70 bg-surface/85 px-4 py-2.5 backdrop-blur-md sm:px-5"
          : ""
      }`}
    >
      <a href="/" className="shrink-0" aria-label="Binary, home">
        <Logo />
      </a>

      <div className="hidden items-center gap-7 sm:flex">
        {LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="text-[13px] text-ink-2 transition-colors hover:text-ink"
          >
            {link.label}
          </a>
        ))}
      </div>

      <a
        href="/app"
        className="shrink-0 rounded-full bg-ink px-5 py-2 text-[13px] font-medium text-plane transition-opacity hover:opacity-85"
      >
        Open app
      </a>
    </nav>
  );
}
