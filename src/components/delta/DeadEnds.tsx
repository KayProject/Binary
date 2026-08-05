"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

// Four strategies the spec records permanently as dead, because each is
// seductive enough to come back. Presented as a rotating spiral so they read
// as a procession of headstones rather than a list of FAQ rows.
const ENDS = [
  {
    id: "indicators",
    n: "I",
    title: "Predict direction from indicators",
    verdict: "The price read the same chart",
    why: "Whatever Delta computes from the candles, the market already has. Same information, same estimate. The most fun to build, the most certain to produce nothing.",
  },
  {
    id: "winrate",
    n: "II",
    title: "Optimise for win rate",
    verdict: "A dial, not a score",
    why: "Buy 95¢ favourites, win 95% of the time, finish flat. An agent told to maximise win rate finds exactly this, then bleeds rails costs behind a dashboard that looks like success.",
  },
  {
    id: "house",
    n: "III",
    title: "Be the house",
    verdict: "Somebody else's solved problem",
    why: "Running a book means bootstrapping liquidity from nothing. Polymarket's order book already solves that, for free, and Delta can simply trade against it.",
  },
  {
    id: "fees",
    n: "IV",
    title: "The taker fee kills everything",
    verdict: "False, and measured",
    why: "$1 at an ask of 0.389 delivered exactly 1/0.389 shares, and redemption paid $1 a share with no fee. Only early exit is charged — which is why Delta buys and holds.",
  },
];

const AUTO_MS = 5200;

export default function DeadEnds() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback((dir: number) => {
    setActive((a) => (a + dir + ENDS.length) % ENDS.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => go(1), AUTO_MS);
    return () => clearInterval(id);
  }, [paused, go]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="relative h-[27rem] sm:h-[25rem]"
        style={{ perspective: "1600px" }}
      >
        {ENDS.map((e, i) => {
          // Shortest signed distance around the ring, so cards spiral past the
          // ends instead of snapping back through the middle.
          let d = i - active;
          if (d > ENDS.length / 2) d -= ENDS.length;
          if (d < -ENDS.length / 2) d += ENDS.length;
          const abs = Math.abs(d);
          const isActive = d === 0;

          return (
            <button
              key={e.id}
              onClick={() => setActive(i)}
              aria-label={e.title}
              aria-current={isActive}
              className="absolute left-1/2 top-0 w-[19rem] sm:w-[24rem] focus:outline-none"
              style={{
                transform: `translateX(-50%) translateX(${d * 46}%) translateZ(${-abs * 190}px) rotateY(${d * -34}deg) scale(${1 - abs * 0.06})`,
                opacity: abs > 2 ? 0 : 1 - abs * 0.3,
                zIndex: 10 - abs,
                transition:
                  "transform 750ms cubic-bezier(0.16,1,0.3,1), opacity 750ms ease",
                transformStyle: "preserve-3d",
                pointerEvents: abs > 2 ? "none" : "auto",
              }}
            >
              <Card end={e} active={isActive} />
              {/* Mirror: only the top sliver of a flipped copy, clipped to a
                  short band. A full-height reflection smeared into the
                  neighbouring cards and read as clutter. */}
              <div
                aria-hidden
                className="h-20 overflow-hidden opacity-[0.18]"
                style={{
                  maskImage: "linear-gradient(to bottom, black 0%, transparent 85%)",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, black 0%, transparent 85%)",
                }}
              >
                {/* Flipped about its centre so the card's bottom edge lands at
                    the top of the band, which is what a reflection shows. */}
                <div className="scale-y-[-1]">
                  <Card end={e} active={isActive} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="relative z-20 mt-4 flex items-center justify-center gap-6">
        <Arrow dir={-1} onClick={() => go(-1)} />
        <div className="flex items-center gap-2">
          {ENDS.map((e, i) => (
            <button
              key={e.id}
              onClick={() => setActive(i)}
              aria-label={`Show ${e.title}`}
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                i === active ? "w-8 bg-act" : "w-2 bg-white/20 hover:bg-white/40",
              )}
            />
          ))}
        </div>
        <Arrow dir={1} onClick={() => go(1)} />
      </div>
    </div>
  );
}

function Card({
  end,
  active,
}: {
  end: (typeof ENDS)[number];
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "h-[21rem] rounded-[1.75rem] p-7 text-left backdrop-blur-xl sm:h-[19rem] sm:p-8",
        "bg-gradient-to-br from-white/[0.10] via-white/[0.05] to-transparent",
        "ring-1 ring-inset transition-shadow duration-700",
        active
          ? "shadow-[0_40px_90px_-40px_rgba(61,116,255,0.75)] ring-act/30"
          : "ring-white/[0.08]",
      )}
    >
      <div className="flex items-baseline justify-between">
        <span
          className={cn(
            "font-mono text-3xl font-black italic transition-colors duration-500",
            active ? "text-act" : "text-white/15",
          )}
        >
          {end.n}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-lose/70">
          dead
        </span>
      </div>
      <h3 className="mt-6 text-2xl font-bold leading-tight tracking-tight text-ice">
        {end.title}
      </h3>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-act-soft/80">
        {end.verdict}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-ice/70">{end.why}</p>
    </div>
  );
}

function Arrow({ dir, onClick }: { dir: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir < 0 ? "Previous" : "Next"}
      className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.05] text-fog
                 ring-1 ring-inset ring-white/10 backdrop-blur-sm
                 transition-colors hover:bg-white/[0.1] hover:text-ice"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path
          d={dir < 0 ? "M10 2 4 8l6 6" : "M6 2l6 6-6 6"}
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
