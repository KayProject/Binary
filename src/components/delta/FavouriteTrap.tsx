"use client";

import { useState } from "react";

// The trap the whole spec exists to avoid: at a fair price, win rate is a dial
// you can turn to any number you like and it buys you nothing. Buying at price
// p with a $1 stake wins (1/p - 1) when it resolves your way and loses $1 when
// it doesn't, and the market prices your way at p — so EV is exactly zero at
// every point on the slider. The visitor discovers that by trying to beat it.
const STAKE = 100;
const BETS = 100;

export default function FavouriteTrap() {
  const [price, setPrice] = useState(0.82);

  const wins = BETS * price;
  const losses = BETS - wins;
  const profitPerWin = STAKE * (1 / price - 1);
  const gross = wins * profitPerWin;
  const lost = losses * STAKE;
  const net = gross - lost;

  // Rounding residue would otherwise render the punchline as "−$0".
  const money = (n: number) => {
    const v = Math.abs(n) < 0.5 ? 0 : n;
    return `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  return (
    <div className="rounded-3xl border border-mid-3 bg-mid-2/40 p-6 lg:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fog">
            Buy the favourite at
          </p>
          <p className="mt-2 text-6xl font-extrabold leading-none text-ice tabular-nums">
            {Math.round(price * 100)}¢
          </p>
        </div>
        <p className="text-sm text-fog max-w-xs">
          Drag toward the safe end. Watch the win rate climb — and watch what it
          pays.
        </p>
      </div>

      <input
        type="range"
        min={50}
        max={95}
        step={1}
        value={Math.round(price * 100)}
        onChange={(e) => setPrice(Number(e.target.value) / 100)}
        aria-label="Price of the favourite in cents"
        className="mt-8 w-full accent-act"
      />

      <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-mid-3 sm:grid-cols-3">
        <div className="bg-mid-2/60 px-5 py-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fog">
            Win rate
          </p>
          <p className="mt-2 text-3xl font-bold text-win tabular-nums">
            {Math.round(price * 100)}%
          </p>
          <p className="mt-1 text-sm text-fog tabular-nums">
            {wins.toFixed(0)} wins · {losses.toFixed(0)} losses
          </p>
        </div>
        <div className="bg-mid-2/60 px-5 py-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fog">
            Won / lost
          </p>
          <p className="mt-2 text-3xl font-bold text-ice tabular-nums">
            {money(gross)}
          </p>
          <p className="mt-1 text-sm text-lose tabular-nums">{money(-lost)}</p>
        </div>
        <div className="bg-mid-2/60 px-5 py-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fog">
            Net, over {BETS} bets
          </p>
          <p className="mt-2 text-3xl font-extrabold text-gold tabular-nums">
            {money(net)}
          </p>
          <p className="mt-1 text-sm text-fog">at any price on the dial</p>
        </div>
      </div>

      <p className="mt-6 max-w-2xl text-ice/80">
        Win rate is a <strong className="text-ice">dial, not a score</strong>. An
        agent told to maximise it will find 95¢ favourites, win almost always,
        and bleed rails costs behind a beautiful dashboard. Δ is not measured on
        how often it is right.
      </p>
    </div>
  );
}
