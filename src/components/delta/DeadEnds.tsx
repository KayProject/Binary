"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { cn } from "@/lib/cn";

// Four strategies the spec records permanently as dead, because each is
// seductive enough to come back. The graveyard is the most credible thing on
// the page: it is the part a marketing site would never publish.
const ENDS = [
  {
    id: "indicators",
    title: "Predict direction from indicators",
    verdict: "The price read the same chart",
    why: "Whatever Delta can compute from the candles, the market already has. Same information means the same estimate. It is the most fun to build and the most certain to produce nothing.",
  },
  {
    id: "winrate",
    title: "Optimise for win rate",
    verdict: "Win rate is a dial, not a score",
    why: "Buy 95¢ favourites, win 95% of the time, and finish flat. An agent told to maximise win rate will find exactly this and bleed rails costs behind a dashboard that looks like success.",
  },
  {
    id: "house",
    title: "Be the house",
    verdict: "Cold-start liquidity is somebody else's solved problem",
    why: "Running a book means bootstrapping liquidity from nothing. Polymarket's order book already solves that, for free, and Delta can simply trade against it.",
  },
  {
    id: "fees",
    title: "“The taker fee kills everything”",
    verdict: "False, and measured",
    why: "$1 at an ask of 0.389 delivered exactly 1/0.389 shares, and redemption paid $1 a share with no fee. Only early exit is charged. That is why Delta buys and holds — a constraint that came out of measurement, not preference.",
  },
];

export default function DeadEnds() {
  return (
    <Accordion.Root
      type="single"
      collapsible
      className="grid gap-3 lg:grid-cols-2 lg:gap-4"
    >
      {ENDS.map((e) => (
        <Accordion.Item
          key={e.id}
          value={e.id}
          className={cn(
            "group overflow-hidden rounded-[1.5rem]",
            "bg-gradient-to-b from-mid-2/90 to-mid-2/40",
            "ring-1 ring-inset ring-white/[0.07]",
            "transition-shadow duration-500",
            "data-[state=open]:shadow-[0_20px_60px_-30px_rgba(61,116,255,0.6)]",
            "data-[state=open]:ring-act/30",
          )}
        >
          <Accordion.Header>
            <Accordion.Trigger className="flex w-full items-start gap-4 p-6 text-left lg:p-7">
              <span
                aria-hidden
                className="mt-1 h-2 w-2 shrink-0 rounded-full bg-lose/70 transition-colors duration-300 group-data-[state=open]:bg-act"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold leading-snug text-ice lg:text-xl">
                  {e.title}
                </span>
                <span className="mt-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-fog">
                  {e.verdict}
                </span>
              </span>
              <span
                aria-hidden
                className="mt-1 shrink-0 text-fog transition-transform duration-300 group-data-[state=open]:rotate-45"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 1v14M1 8h14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content
            className="overflow-hidden data-[state=closed]:animate-acc-up data-[state=open]:animate-acc-down"
          >
            <p className="px-6 pb-7 pl-12 text-ice/70 lg:pr-7">{e.why}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
