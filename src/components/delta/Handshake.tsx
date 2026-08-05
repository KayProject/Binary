"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { Panel } from "./ui";

/**
 * The x402 exchange as an actual exchange — a transcript that advances, rather
 * than three cards describing it. The steps are the real ones: the endpoint
 * answers a price, the agent signs a gasless authorisation, the data comes
 * back. Replaces the icon/title/two-lines grid the first version shipped.
 */
const STEPS = [
  {
    tag: "REQUEST",
    dir: "out" as const,
    title: "Delta asks for a read",
    line: "POST /api/delta/insight",
    body: "No key, no account, no prior relationship.",
  },
  {
    tag: "402",
    dir: "in" as const,
    title: "The endpoint quotes it",
    line: "402 Payment Required · $0.01 USDC",
    body: "A price, not a login screen.",
  },
  {
    tag: "SIGN",
    dir: "out" as const,
    title: "Delta pays itself in",
    line: "transferWithAuthorization · ERC-3009",
    body: "Gasless, signed by the agent's own key on Celo.",
  },
  {
    tag: "200",
    dir: "in" as const,
    title: "It gets served",
    line: "spread · depth · vig · implied probability",
    body: "Measurements of the live book — never the position.",
  },
];

export default function Handshake() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const [step, setStep] = useState(-1);

  useEffect(() => {
    if (!inView) return;
    // Reduced motion shows the finished transcript immediately; the timeout
    // keeps the update out of the effect body either way.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = reduce
      ? [setTimeout(() => setStep(STEPS.length - 1), 0)]
      : STEPS.map((_, i) => setTimeout(() => setStep(i), 350 + i * 750));
    return () => timers.forEach(clearTimeout);
  }, [inView]);

  return (
    <div ref={ref} className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6">
      <Panel className="p-6 lg:p-8">
        <ol className="space-y-1">
          {STEPS.map((s, i) => {
            const on = step >= i;
            return (
              <li
                key={s.tag}
                className={`flex gap-4 rounded-2xl px-4 py-4 transition-all duration-500 ${
                  on ? "bg-white/[0.04] opacity-100" : "opacity-25"
                }`}
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <span
                  className={`mt-1 shrink-0 self-start rounded-md px-2 py-1 font-mono text-[10px] font-bold leading-none tracking-wider transition-colors duration-500 ${
                    s.dir === "out"
                      ? on
                        ? "bg-act/20 text-act-soft"
                        : "bg-mid-3 text-fog"
                      : on
                        ? "bg-win/15 text-win"
                        : "bg-mid-3 text-fog"
                  }`}
                >
                  {s.tag}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-ice">{s.title}</p>
                  <p className="mt-1 truncate font-mono text-xs text-act-soft/80">
                    {s.line}
                  </p>
                  <p className="mt-1.5 text-sm text-ice/60">{s.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Panel>

      <Panel glow className="flex flex-col justify-center p-8 lg:p-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fog">
          Why it matters
        </p>
        <p className="mt-5 text-2xl font-bold leading-snug tracking-tight text-ice lg:text-3xl">
          The claim was never that an agent can trade.
        </p>
        <p className="mt-4 text-ice/70">
          It is that an agent can discover a price, pay it, and be served — on
          open rails, with nothing arranged beforehand. Delta does that with its
          own capital, against a real book.
        </p>
        <div className="mt-8 rounded-2xl bg-mid/60 p-5 ring-1 ring-inset ring-white/[0.06]">
          <p className="font-mono text-[11px] leading-relaxed text-fog">
            <span className="text-act-soft">0.001 USDC</span>
            <br />
            0xC2A4…74E9{" "}
            <span className="text-fog/60">→</span> 0x3a3a…Cfe0
            <br />
            <span className="text-fog/60">tag</span>{" "}
            <span className="text-ice/70">celo_22480bd47654</span>
          </p>
        </div>
      </Panel>
    </div>
  );
}
