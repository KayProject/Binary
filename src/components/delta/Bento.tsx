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
          <div className="flex h-16 items-end gap-1.5">
            {[38, 52, 30, 64, 46, 78, 41, 88, 57].map((h, i) => (
              <span
                key={i}
                className="flex-1 rounded-t-sm bg-gradient-to-t from-act/25 to-act"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <h3 className="mt-5 text-xl font-bold text-ice">Measured, not argued</h3>
          <p className="mt-2 text-sm text-ice/70">
            Four strategies were killed by measurement before this one survived.
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
