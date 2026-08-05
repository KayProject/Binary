"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Mirror carousel: a row of frosted cards that carousels through the four
 * recorded dead ends, flanked by two angled panels holding a live mirrored
 * copy of that same row — so the reflections travel with it rather than
 * sitting there as decoration.
 *
 * Each card carries its own generated artwork. There are no photographic
 * assets in this project, and stock imagery would fight the palette, so the
 * art is a gradient mesh per card, tinted to that card's accent.
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
const STEP = 21; // rem between card centres

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
        className="relative h-[26rem] overflow-hidden rounded-[2rem]"
        style={{ perspective: "1500px" }}
      >
        {/* Angled mirror walls. Each holds the same row, flipped, blurred and
            dimmed, so it tracks the carousel in real time. */}
        <MirrorWall side="left" active={active} />
        <MirrorWall side="right" active={active} />

        {/* The row itself */}
        <div className="absolute inset-0">
          {ENDS.map((e, i) => {
            const d = offset(i, active);
            const abs = Math.abs(d);
            return (
              <button
                key={e.id}
                onClick={() => setActive(i)}
                aria-label={e.title}
                aria-current={d === 0}
                className="absolute left-1/2 top-1/2 w-[17rem] focus:outline-none"
                style={{
                  transform: `translate(-50%,-50%) translateX(${d * STEP}rem) scale(${d === 0 ? 1 : 0.88})`,
                  opacity: abs > 1 ? 0 : 1,
                  zIndex: 10 - abs,
                  transition:
                    "transform 800ms cubic-bezier(0.16,1,0.3,1), opacity 800ms ease",
                  pointerEvents: abs > 1 ? "none" : "auto",
                }}
              >
                <Card end={e} active={d === 0} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Copy for the active card sits under the row, as in the reference */}
      <div className="relative mx-auto mt-8 max-w-xl text-center">
        {ENDS.map((e, i) => (
          <p
            key={e.id}
            className={cn(
              "transition-all duration-500",
              i === active
                ? "relative opacity-100"
                : "pointer-events-none absolute inset-0 opacity-0",
            )}
          >
            <span className="block text-lg font-bold text-ice">{e.verdict}</span>
            <span className="mt-2 block text-sm leading-relaxed text-ice/65">
              {e.why}
            </span>
          </p>
        ))}
      </div>

      <div className="relative z-20 mt-8 flex items-center justify-center gap-6">
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

function MirrorWall({ side, active }: { side: "left" | "right"; active: number }) {
  const isLeft = side === "left";
  return (
    <div
      aria-hidden
      className={cn(
        "absolute top-0 h-full w-[34rem] overflow-hidden",
        isLeft ? "left-0" : "right-0",
      )}
      style={{
        // Angled inward like a wall, pulled forward in Z so the foreshortening
        // does not shrink it to nothing, and only lightly veiled.
        transform: `perspective(1400px) rotateY(${isLeft ? 46 : -46}deg) translateZ(-60px) scale(1.3)`,
        transformOrigin: isLeft ? "left center" : "right center",
        maskImage: `linear-gradient(to ${isLeft ? "left" : "right"}, black 0%, rgba(0,0,0,0.55) 45%, transparent 92%)`,
        WebkitMaskImage: `linear-gradient(to ${isLeft ? "left" : "right"}, black 0%, rgba(0,0,0,0.55) 45%, transparent 92%)`,
      }}
    >
      <div
        // Blurred past legibility on purpose: reversed text that can almost be
        // read looks like a bug, where a soft reflection reads as glass.
        className="absolute inset-0 opacity-[0.62] blur-[4px]"
        style={{ transform: "scaleX(-1)" }}
      >
        {ENDS.map((e, i) => {
          const d = offset(i, active);
          return (
            <div
              key={e.id}
              className="absolute left-1/2 top-1/2 w-[17rem]"
              style={{
                transform: `translate(-50%,-50%) translateX(${d * STEP}rem) scale(${d === 0 ? 1 : 0.88})`,
                opacity: Math.abs(d) > 1 ? 0 : 1,
                transition:
                  "transform 800ms cubic-bezier(0.16,1,0.3,1), opacity 800ms ease",
              }}
            >
              <Card end={e} active={false} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({ end, active }: { end: (typeof ENDS)[number]; active: boolean }) {
  const [a, b] = end.art;
  return (
    <div
      className={cn(
        "grain relative h-[20rem] overflow-hidden rounded-[1.5rem] text-left",
        // Frosted: a genuinely translucent fill over heavy blur, a bright
        // inset hairline, and grain on top — not a flat white tint.
        "bg-white/[0.055] backdrop-blur-2xl",
        "ring-1 ring-inset transition-all duration-700",
        active
          ? "shadow-[0_45px_90px_-45px_rgba(61,116,255,0.85)] ring-white/[0.18]"
          : "shadow-[0_25px_60px_-40px_rgba(0,0,0,0.9)] ring-white/[0.09]",
      )}
    >
      {/* Generated artwork — a gradient mesh in the card's own accent */}
      <div
        className="absolute inset-x-0 top-0 h-40"
        style={{
          background: `radial-gradient(120% 100% at 18% 0%, ${a}66 0%, transparent 62%),
                       radial-gradient(90% 80% at 92% 18%, ${b}55 0%, transparent 60%),
                       linear-gradient(180deg, ${end.art[2]}cc 0%, transparent 100%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
      />

      <div className="relative flex h-full flex-col p-6">
        <div className="flex items-start justify-between">
          <span
            className={cn(
              "font-mono text-3xl font-black italic transition-colors duration-500",
              active ? "text-ice" : "text-white/30",
            )}
          >
            {end.n}
          </span>
          <span className="rounded-full bg-lose/15 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-lose/90 ring-1 ring-inset ring-lose/20">
            dead
          </span>
        </div>
        <h3 className="mt-auto text-[1.4rem] font-bold leading-tight tracking-tight text-ice">
          {end.title}
        </h3>
        <p
          className="mt-3 h-px w-full"
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
