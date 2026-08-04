"use client";

import { useEffect, useRef, useState } from "react";

const DURATION = 900;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Tweens between values so a poll updates the figure without it snapping or
 * the row reflowing. `format` runs on every frame, so callers keep control of
 * digits and separators.
 */
export default function AnimatedNumber({
  value,
  format,
  className = "",
}: {
  value: number | null;
  format: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value ?? 0);
  const fromRef = useRef(value ?? 0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (value === null) return;
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    // Reduced motion snaps rather than tweens. It still goes through rAF so the
    // state update never happens synchronously inside the effect body.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduceMotion ? 0 : DURATION;

    const start = performance.now();
    const step = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const current = from + (to - from) * easeOutCubic(t);
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return (
    <span className={`tabular-nums ${className}`}>
      {value === null ? "—" : format(display)}
    </span>
  );
}
