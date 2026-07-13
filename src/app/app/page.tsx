"use client";

import { useEffect, useState } from "react";
import type { Market } from "@/lib/polymarket/types";
import { payoutIfWin, sharesFor, takerFee } from "@/lib/polymarket/fees";

// MiniPay shell — market feed + tap-to-bet sheet. One sheet, two doors:
// unfunded taps become free picks (BinaryPlay, XP), funded taps become real
// orders. Wallet wiring lands with the broker backend; `funded` is the same
// flag that backend will provide.

const BLUE = "#0057D5";

const cents = (p: number) => `${(p * 100).toFixed(p < 0.1 || p > 0.9 ? 1 : 0)}¢`;
const pct = (p: number) => `${Math.round(p * 100)}%`;

export default function AppHome() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [error, setError] = useState(false);
  const [sheet, setSheet] = useState<{ market: Market; outcome: 0 | 1 } | null>(null);
  const [amount, setAmount] = useState(2);
  const [picked, setPicked] = useState<Record<string, 0 | 1>>({});

  // Funded = has a positive Binary balance. Stubbed until the broker backend
  // lands; free-play is the honest default for a fresh wallet.
  const funded = false;
  const balance = 0;

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/markets?limit=20")
        .then((r) => r.json())
        .then((d) => live && d.markets && setMarkets(d.markets))
        .catch(() => live && setError(true));
    load();
    const t = setInterval(load, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const sel = sheet && sheet.market.outcomes[sheet.outcome];
  const win = sel ? payoutIfWin(amount, sel.price) : 0;
  const shares = sel ? sharesFor(amount, sel.price) : 0;
  const exitFee = sel
    ? takerFee(sel.price, shares, sheet.market.feeRateBps, sheet.market.feeExponent)
    : 0;

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-white pb-28 text-neutral-900">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-100 bg-white/90 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold tracking-tight" style={{ color: BLUE }}>
          Binary
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-600">
            🔥 0
          </div>
          <div className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold">
            ${balance.toFixed(2)}
          </div>
        </div>
      </header>

      {error && (
        <p className="p-6 text-center text-sm text-neutral-500">
          Feed unavailable — pull to retry.
        </p>
      )}

      <ul className="divide-y divide-neutral-100">
        {markets.map((m) => (
          <li key={m.slug} className="px-4 py-4">
            <div className="mb-1 flex items-start gap-3">
              {m.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image} alt="" className="h-10 w-10 rounded-xl object-cover" />
              )}
              <p className="flex-1 text-[15px] font-semibold leading-snug">{m.question}</p>
              <span className="text-lg font-extrabold tabular-nums" style={{ color: BLUE }}>
                {pct(m.outcomes[0].price)}
              </span>
            </div>
            <p className="mb-3 pl-[52px] text-xs text-neutral-400">
              ${Math.round(m.volume24h).toLocaleString()} today
              {picked[m.slug] !== undefined && (
                <span className="ml-2 font-semibold text-amber-500">
                  ⚡ picked {m.outcomes[picked[m.slug]].label}
                </span>
              )}
            </p>
            <div className="flex gap-2">
              {([0, 1] as const).map((i) => (
                <button
                  key={i}
                  onClick={() => {
                    setAmount(2);
                    setSheet({ market: m, outcome: i });
                  }}
                  className="flex-1 rounded-2xl px-3 py-2.5 text-sm font-bold transition active:scale-95"
                  style={
                    i === 0
                      ? { backgroundColor: "#E7F0FD", color: BLUE }
                      : { backgroundColor: "#FDF0F0", color: "#C2410C" }
                  }
                >
                  {m.outcomes[i].label} {cents(m.outcomes[i].price)}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {sheet && sel && (
        <div
          className="fixed inset-0 z-20 flex items-end bg-black/40"
          onClick={() => setSheet(null)}
        >
          <div
            className="w-full rounded-t-3xl bg-white p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-200" />
            <p className="mb-1 text-sm text-neutral-500">{sheet.market.question}</p>
            <p className="mb-4 text-xl font-bold">
              {sel.label} · {cents(sel.price)}
            </p>

            {funded ? (
              <>
                <div className="mb-4 flex gap-2">
                  {[1, 2, 5, 10].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmount(v)}
                      className="flex-1 rounded-xl border py-2 text-sm font-bold"
                      style={
                        amount === v
                          ? { borderColor: BLUE, color: BLUE, backgroundColor: "#F0F6FF" }
                          : { borderColor: "#E5E7EB", color: "#525252" }
                      }
                    >
                      ${v}
                    </button>
                  ))}
                </div>

                <div className="mb-4 rounded-2xl bg-neutral-50 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Your bet</span>
                    <span className="font-bold tabular-nums">${amount.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-neutral-500">You win</span>
                    <span className="text-base font-extrabold tabular-nums text-green-600">
                      ${win.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-neutral-400">
                    ⓘ includes all fees · paid in full if {sel.label.toLowerCase()} wins;
                    cashing out early pays a ~${exitFee.toFixed(2)} market fee
                  </p>
                </div>

                <button
                  className="w-full rounded-2xl py-4 text-base font-bold text-white active:scale-[0.98]"
                  style={{ backgroundColor: BLUE }}
                  onClick={() => setSheet(null)} // TODO: POST /api/bets (broker backend)
                >
                  Place bet · ${amount}
                </button>
              </>
            ) : (
              <>
                <div className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm">
                  <p className="font-bold text-amber-700">⚡ Playing for XP</p>
                  <p className="mt-1 text-amber-600">
                    Lock in your free pick and grow your streak. Add money to win cash —
                    this pick would pay{" "}
                    <span className="font-bold">${payoutIfWin(2, sel.price).toFixed(2)}</span>{" "}
                    on a $2 bet.
                  </p>
                </div>

                <button
                  className="mb-2 w-full rounded-2xl py-4 text-base font-bold text-white active:scale-[0.98]"
                  style={{ backgroundColor: BLUE }}
                  onClick={() => {
                    // TODO: relay BinaryPlay.pick(keccak(conditionId), outcome)
                    setPicked((p) => ({ ...p, [sheet.market.slug]: sheet.outcome }));
                    setSheet(null);
                  }}
                >
                  Free pick · {sel.label} ⚡
                </button>
                <button
                  className="w-full rounded-2xl border py-3.5 text-base font-bold active:scale-[0.98]"
                  style={{ borderColor: BLUE, color: BLUE }}
                  onClick={() => setSheet(null)} // TODO: open top-up flow
                >
                  Add money to win cash
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
