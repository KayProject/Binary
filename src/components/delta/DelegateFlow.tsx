"use client";

import { useEffect, useState } from "react";

// The delegate path, at the scale it actually runs: up to 25 beneficiaries ride
// into the escrow on ONE deposit. The asymmetry on the way out is real and is
// the system's largest gas cost, so it is drawn rather than hidden.
const RIDERS = 25;
const STEPS = [
  {
    label: "Delegate",
    detail: "25 people send Δ a stake and the market they want.",
  },
  {
    label: "Commit",
    detail:
      "Δ hashes the book — who is owed what — into the deposit calldata, before any result is known.",
  },
  {
    label: "One deposit",
    detail: "All 25 enter the escrow on a single transaction.",
  },
  {
    label: "Settle & pay",
    detail: "The escrow pays Δ; Δ forwards every beneficiary their share.",
  },
];

export default function DelegateFlow() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const id = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-3xl border border-mid-3 bg-mid-2/40 p-6 lg:p-10">
      {/* Riders converging on Δ */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {Array.from({ length: RIDERS }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${
              step >= 1 ? "bg-act" : "bg-mid-3"
            }`}
            style={{ transitionDelay: `${i * 18}ms` }}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <span className="h-px w-16 bg-mid-3" />
        <span
          className={`grid h-14 w-14 place-items-center rounded-2xl border text-2xl font-extrabold transition-colors duration-500 ${
            step >= 1 ? "border-act bg-act/15 text-act-soft" : "border-mid-3 text-fog"
          }`}
        >
          Δ
        </span>
        <span className="h-px w-16 bg-mid-3" />
      </div>

      <div className="mt-6 text-center">
        <p
          className={`font-mono text-[11px] uppercase tracking-[0.18em] transition-colors duration-500 ${
            step >= 2 ? "text-act-soft" : "text-fog"
          }`}
        >
          {step >= 2 ? "1 deposit · 25 beneficiaries" : "escrow"}
        </p>
      </div>

      <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s.label}
            className={`rounded-2xl border p-4 transition-colors duration-500 ${
              step === i ? "border-act/50 bg-act/[0.06]" : "border-mid-3 bg-mid-2/30"
            }`}
          >
            <p
              className={`font-mono text-[11px] transition-colors duration-500 ${
                step === i ? "text-act-soft" : "text-fog"
              }`}
            >
              0{i + 1}
            </p>
            <p className="mt-1 font-bold text-ice">{s.label}</p>
            <p className="mt-1 text-sm text-ice/70">{s.detail}</p>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-sm text-fog">
        The gas asymmetry is real and unsolved: 25 ride in on one transaction and
        leave on 25. Batching the way out is the largest efficiency left on the
        table.
      </p>
    </div>
  );
}
