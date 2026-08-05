"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Mirror carousel: a tightly packed row of small portrait cards that carousels
 * through the four recorded dead ends, flanked by two large angled wings
 * showing the active card's artwork enlarged and mirrored — the wings are the
 * mirror, the row is what they reflect.
 *
 * Each card carries generated artwork: there are no photographic assets in
 * this project and stock imagery would fight the palette, so the art is a
 * gradient mesh tinted to that card's own accent.
 */
const ENDS = [
  {
    id: "indicators",
    n: "I",
    title: "Predict direction from indicators",
    verdict: "The price read the same chart",
    why: "Whatever Delta computes from the candles, the market already has. Same information, same estimate. The most fun to build, the most certain to produce nothing.",
    art: ["#3d74ff", "#7aa2ff", "#141b2e"],
  },
  {
    id: "winrate",
    n: "II",
    title: "Optimise for win rate",
    verdict: "A dial, not a score",
    why: "Buy 95¢ favourites, win 95% of the time, finish flat. An agent told to maximise win rate finds exactly this, then bleeds rails costs behind a dashboard that looks like success.",
    art: ["#e4c87e", "#ff9d6b", "#1a1526"],
  },
  {
    id: "house",
    n: "III",
    title: "Be the house",
    verdict: "Somebody else's solved problem",
    why: "Running a book means bootstrapping liquidity from nothing. Polymarket's order book already solves that, for free, and Delta can simply trade against it.",
    art: ["#31d3a2", "#3d74ff", "#101e26"],
  },
  {
    id: "fees",
    n: "IV",
    title: "The taker fee kills everything",
    verdict: "False, and measured",
    why: "$1 at an ask of 0.389 delivered exactly 1/0.389 shares, and redemption paid $1 a share with no fee. Only early exit is charged — which is why Delta buys and holds.",
    art: ["#a78bfa", "#ff6b5e", "#1b1430"],
  },
];

const AUTO_MS = 5000;
// Spacing is a percentage of the card's own width (translateX % is relative to
// the element), so the row stays packed at every breakpoint without a rem
// constant that has to chase the card size.
const STEP_PCT = 106;
const VISIBLE = 2; // cards either side of centre

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

  const current = ENDS[active];
  const [c1, c2, c3] = current.art;

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Section container carries the active card's artwork and the grain, so
          the stage is tinted by whatever is currently on it. */}
      <div className="grain relative overflow-hidden rounded-[2rem] ring-1 ring-inset ring-white/[0.08]">
        <div
          className="absolute inset-0 transition-[background] duration-1000"
          style={{
            background: `radial-gradient(75% 60% at 50% 0%, ${c1}22 0%, transparent 65%),
                         radial-gradient(60% 50% at 12% 100%, ${c2}18 0%, transparent 70%),
                         linear-gradient(160deg, ${c3}aa 0%, rgba(11,15,26,0.94) 60%)`,
          }}
        />

        <div
          className="relative h-[24rem] sm:h-[27rem] lg:h-[30rem]"
          style={{ perspective: "1500px", transformStyle: "preserve-3d" }}
        >
          <Wing side="left" end={current} />
          <Wing side="right" end={current} />

          {ENDS.map((e, i) => {
            const d = offset(i, active);
            const abs = Math.abs(d);
            return (
              <button
                key={e.id}
                onClick={() => setActive(i)}
                aria-label={e.title}
                aria-current={d === 0}
                className="absolute left-1/2 top-1/2 w-[13rem] focus:outline-none sm:w-[15rem] lg:w-[17rem]"
                style={{
                  // Pure X-axis travel. The earlier per-card rotateY made the
                  // row look like it wasn't sliding along one axis.
                  transform: `translate(-50%,-50%) translateX(${d * STEP_PCT}%) scale(${d === 0 ? 1.06 : 0.94})`,
                  opacity: abs > VISIBLE ? 0 : 1 - abs * 0.14,
                  zIndex: 20 - abs,
                  transition:
                    "transform 800ms cubic-bezier(0.16,1,0.3,1), opacity 800ms ease",
                  pointerEvents: abs > VISIBLE ? "none" : "auto",
                }}
              >
                <Card end={e} active={d === 0} />
              </button>
            );
          })}
        </div>

        {/* Copy sits over the base of the stage, as in the reference */}
        <div className="relative z-30 mx-auto -mt-6 max-w-lg px-8 pb-10 text-center">
          {ENDS.map((e, i) => (
            <div
              key={e.id}
              className={cn(
                "transition-all duration-500",
                i === active
                  ? "relative opacity-100"
                  : "pointer-events-none absolute inset-0 opacity-0",
              )}
            >
              <p className="text-lg font-bold text-ice">{e.verdict}</p>
              <p className="mt-2 text-sm leading-relaxed text-ice/65">{e.why}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-20 mt-7 flex items-center justify-center gap-6">
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

/** Shortest signed distance around the ring, so the row wraps continuously. */
function offset(i: number, active: number) {
  let d = i - active;
  if (d > ENDS.length / 2) d -= ENDS.length;
  if (d < -ENDS.length / 2) d += ENDS.length;
  return d;
}

/**
 * The large angled panel either side. It shows the active card's artwork blown
 * up and mirrored — big and legible as a surface, not a faint ghost.
 */
function Wing({ side, end }: { side: "left" | "right"; end: (typeof ENDS)[number] }) {
  const isLeft = side === "left";
  const [a, b, base] = end.art;
  return (
    <div
      aria-hidden
      className={cn(
        // Hidden on mobile: at phone widths the wings overlap the centre, and
        // inside preserve-3d the rotated panels depth-sort IN FRONT of the flat
        // cards regardless of z-index — which blanked the active card out.
        "absolute top-1/2 hidden h-[19rem] w-[21rem] -translate-y-1/2 overflow-hidden rounded-[1.25rem] lg:block",
        isLeft ? "left-[-3rem]" : "right-[-3rem]",
      )}
      style={{
        transform: `translateY(-50%) rotateY(${isLeft ? 42 : -42}deg) scale(1.02)`,
        transformOrigin: isLeft ? "left center" : "right center",
        maskImage: `linear-gradient(to ${isLeft ? "left" : "right"}, black 12%, transparent 96%)`,
        WebkitMaskImage: `linear-gradient(to ${isLeft ? "left" : "right"}, black 12%, transparent 96%)`,
        zIndex: 5,
      }}
    >
      <div
        className="absolute inset-0 transition-[background] duration-1000"
        style={{
          transform: isLeft ? "scaleX(-1)" : undefined,
          background: `radial-gradient(110% 90% at 22% 8%, ${a}88 0%, transparent 66%),
                       radial-gradient(85% 75% at 88% 24%, ${b}77 0%, transparent 62%),
                       linear-gradient(170deg, ${base}ee 0%, rgba(11,15,26,0.92) 78%)`,
        }}
      />
      <div className="grain absolute inset-0" />
    </div>
  );
}

function Card({ end, active }: { end: (typeof ENDS)[number]; active: boolean }) {
  const [a, b, base] = end.art;
  return (
    <div
      className={cn(
        "grain relative aspect-[3/4] overflow-hidden rounded-[1.1rem] text-left",
        // Frosted: translucent fill over heavy blur, bright inset hairline.
        "bg-white/[0.055] backdrop-blur-2xl",
        "ring-1 ring-inset transition-all duration-700",
        active
          ? "shadow-[0_35px_70px_-30px_rgba(61,116,255,0.9)] ring-white/25"
          : "shadow-[0_18px_44px_-28px_rgba(0,0,0,0.9)] ring-white/[0.09]",
      )}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 85% at 20% 0%, ${a}77 0%, transparent 60%),
                       radial-gradient(95% 70% at 92% 14%, ${b}66 0%, transparent 58%),
                       linear-gradient(180deg, ${base}bb 0%, transparent 78%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent"
      />

      <div className="relative flex h-full flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <span
            className={cn(
              "font-mono text-xl font-black italic transition-colors duration-500 sm:text-2xl",
              active ? "text-ice" : "text-white/35",
            )}
          >
            {end.n}
          </span>
          <span className="rounded-full bg-lose/15 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-lose/90 ring-1 ring-inset ring-lose/25">
            dead
          </span>
        </div>
        <h3 className="mt-auto text-[0.95rem] font-bold leading-snug tracking-tight text-ice sm:text-lg lg:text-xl">
          {end.title}
        </h3>
        <span
          className="mt-2 block h-px w-full"
          style={{ background: `linear-gradient(to right, ${a}, transparent)` }}
        />
      </div>
    </div>
  );
}

function Arrow({ dir, onClick }: { dir: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir < 0 ? "Previous" : "Next"}
      className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-fog
                 ring-1 ring-inset ring-white/10 backdrop-blur-sm
                 transition-colors hover:bg-white/[0.12] hover:text-ice"
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
