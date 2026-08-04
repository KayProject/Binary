"use client";

import { useState } from "react";

// Four strategies the spec records permanently as dead, because each is
// seductive enough to come back. Showing the graveyard is the point: it is the
// clearest evidence that the thing was engineered rather than pitched.
const ENDS = [
  {
    title: "Predict direction from indicators",
    why: "The price already read the same chart. The most fun to build; the most certain to produce nothing.",
  },
  {
    title: "Optimise for win rate",
    why: "Buy 95¢ favourites, win 95% of the time, make $0. An agent told to maximise win rate will find this and bleed rails costs.",
  },
  {
    title: "Be the house",
    why: "Cold-start liquidity is the exact problem Polymarket's book already solves, for free.",
  },
  {
    title: "“The taker fee kills everything”",
    why: "False, and measured. Buys are free, redemption is free — only early exit is charged. So Δ buys and holds.",
  },
];

export default function DeadEnds() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {ENDS.map((e, i) => {
        const isOpen = open === i;
        return (
          <button
            key={e.title}
            onClick={() => setOpen(isOpen ? null : i)}
            aria-expanded={isOpen}
            className={`group rounded-2xl border p-6 text-left transition-colors duration-300 ${
              isOpen
                ? "border-act/50 bg-act/[0.06]"
                : "border-mid-3 bg-mid-2/40 hover:border-mid-3/80 hover:bg-mid-2/70"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-bold text-ice">{e.title}</h3>
              <span
                className={`mt-1 shrink-0 font-mono text-xs transition-colors ${
                  isOpen ? "text-act-soft" : "text-fog"
                }`}
              >
                {isOpen ? "—" : "+"}
              </span>
            </div>
            <div
              className={`grid transition-all duration-300 ease-out ${
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <p className="overflow-hidden text-ice/80">
                <span className="block pt-3">{e.why}</span>
              </p>
            </div>
            {!isOpen && (
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-fog">
                why it stays dead
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
