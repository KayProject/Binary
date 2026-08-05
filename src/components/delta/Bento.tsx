"use client";

import { useEffect, useState } from "react";
import WorldMap from "@/components/WorldMap";
import { Panel, Reveal } from "./ui";

/**
 * Mixed-weight grid. Every tile carries a real visual rather than an icon,
 * because "icon + title + two lines, times six" is the shape that made the
 * first version read as a template.
 */
export default function Bento() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Wide: the markets Delta reaches */}
      <Reveal className="lg:col-span-2">
        <Panel interactive className="h-full p-8 lg:p-10">
          <h3 className="text-2xl font-bold tracking-tight text-ice">
            Every market, one book
          </h3>
          <p className="mt-3 max-w-md text-ice/70">
            Delta reads the same order books the world&apos;s deepest prediction
            markets run on, and routes through Binary&apos;s rails — adding no
            execution path of its own.
          </p>
          <div className="pointer-events-none mt-2 -mb-6 opacity-90">
            <WorldMap />
          </div>
        </Panel>
      </Reveal>

      {/* Tall: the batching economics, drawn */}
      <Reveal delay={0.08}>
        <Panel interactive className="flex h-full flex-col p-8">
          <h3 className="text-2xl font-bold tracking-tight text-ice">
            25 riders,
            <br />
            one transaction
          </h3>
          <p className="mt-3 text-sm text-ice/70">
            Delta packs a whole batch into a single deposit, so the group pays
            for one.
          </p>
          <BatchVisual />
        </Panel>
      </Reveal>

      {/* Three even tiles, each with a live-feeling readout */}
      <Reveal delay={0.04}>
        <Panel interactive className="h-full p-8">
          <Ticker />
          <h3 className="mt-5 text-xl font-bold text-ice">Buys and holds</h3>
          <p className="mt-2 text-sm text-ice/70">
            Buys are free, redemption is free, only early exit is charged. So
            Delta does not exit early.
          </p>
        </Panel>
      </Reveal>

      <Reveal delay={0.1}>
        <Panel interactive className="h-full p-8">
          <EvChart />
          <h3 className="mt-5 text-xl font-bold text-ice">Measured, not argued</h3>
          <p className="mt-2 text-sm text-ice/70">
            Win rate climbs with the price. Expected value never leaves zero.
          </p>
        </Panel>
      </Reveal>

      <Reveal delay={0.16}>
        <Panel interactive glow className="h-full p-8">
          <p className="font-mono text-5xl font-extrabold leading-none text-act-soft">
            Δ<span className="text-ice">=0</span>
          </p>
          <h3 className="mt-5 text-xl font-bold text-ice">No edge, no bet</h3>
          <p className="mt-2 text-sm text-ice/70">
            Same information as the market means the same estimate. Delta sits
            out far more often than it trades.
          </p>
        </Panel>
      </Reveal>
    </div>
  );
}

/** 25 dots collapsing into one — the batching claim, made visible. */
function BatchVisual() {
  const [packed, setPacked] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Settle on the packed state without cycling, deferred so the update
      // does not run synchronously inside the effect.
      const t = setTimeout(() => setPacked(true), 0);
      return () => clearTimeout(t);
    }
    const id = setInterval(() => setPacked((p) => !p), 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mt-auto pt-10">
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 25 }).map((_, i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full transition-all duration-700"
            style={{
              backgroundColor: packed ? "#3d74ff" : "#1e2840",
              transitionDelay: `${i * 22}ms`,
            }}
          />
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-fog">
        <span className="h-px flex-1 bg-white/10" />
        <span className={packed ? "text-act-soft" : ""}>
          {packed ? "1 deposit" : "25 stakes"}
        </span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  );
}

/**
 * The two curves that make the whole argument, plotted from the real maths
 * rather than invented bars: win rate rises linearly with the price you pay,
 * while expected value sits flat on zero at every one of those prices.
 */
function EvChart() {
  const W = 260;
  const H = 64;
  const pts = Array.from({ length: 46 }, (_, i) => 0.5 + (i / 45) * 0.45);

  const winPath = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * W;
      const y = H - p * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  // EV of buying at p: p·(1/p − 1) − (1 − p) = 0, for every p.
  const evY = H - 0 * H - 1;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full overflow-visible">
        <defs>
          <linearGradient id="winline" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3d74ff" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#7aa2ff" />
          </linearGradient>
        </defs>
        <path d={winPath} fill="none" stroke="url(#winline)" strokeWidth="2" />
        <line
          x1="0"
          y1={evY}
          x2={W}
          y2={evY}
          stroke="#31d3a2"
          strokeWidth="1.5"
          strokeDasharray="3 4"
        />
      </svg>
      <div className="mt-3 flex items-center gap-4 font-mono text-[9px] uppercase tracking-[0.14em] text-fog">
        <span className="flex items-center gap-1.5">
          <span className="h-px w-3 bg-act-soft" /> win rate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-px w-3 bg-win" /> expected value
        </span>
      </div>
    </div>
  );
}

/** A price that drifts, so the tile feels connected to a live thing. */
function Ticker() {
  const [p, setP] = useState(0.41);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      setP((v) => Math.min(0.92, Math.max(0.08, v + (Math.random() - 0.5) * 0.04)));
    }, 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-extrabold tabular-nums text-ice">
          {Math.round(p * 100)}¢
        </span>
        <span className="font-mono text-xs text-win">held</span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-mid-3">
        <div
          className="h-full rounded-full bg-gradient-to-r from-act to-win transition-[width] duration-1000 ease-out"
          style={{ width: `${p * 100}%` }}
        />
      </div>
    </div>
  );
}
