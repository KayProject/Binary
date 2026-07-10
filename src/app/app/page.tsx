"use client";

import { useEffect, useState } from "react";
import type { Market } from "@/lib/polymarket/types";

// MiniPay shell — market feed + tap-to-bet sheet. Wallet wiring lands after
// Phase 0; the bet action is a stub behind the same interface the backend
// bet API will expose.

const BLUE = "#0057D5";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export default function AppHome() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [error, setError] = useState(false);
  const [sheet, setSheet] = useState<{ market: Market; outcome: 0 | 1 } | null>(null);
  const [amount, setAmount] = useState(2);

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

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-white pb-28 text-neutral-900">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-100 bg-white/90 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold tracking-tight" style={{ color: BLUE }}>
          Binary
        </h1>
        <div className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold">
          $0.00
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
            <div className="mb-3 flex items-start gap-3">
              {m.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image} alt="" className="h-10 w-10 rounded-lg object-cover" />
              )}
              <p className="flex-1 text-[15px] font-semibold leading-snug">{m.question}</p>
            </div>
            <div className="flex gap-2">
              {([0, 1] as const).map((i) => (
                <button
                  key={i}
                  onClick={() => {
                    setAmount(2);
                    setSheet({ market: m, outcome: i });
                  }}
                  className="flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition active:scale-95"
                  style={
                    i === 0
                      ? { backgroundColor: BLUE, color: "white" }
                      : { backgroundColor: "#EEF2F7", color: "#1a1a2e" }
                  }
                >
                  {m.outcomes[i].label} · {pct(m.outcomes[i].price)}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {sheet && (
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
              {sheet.market.outcomes[sheet.outcome].label} ·{" "}
              {pct(sheet.market.outcomes[sheet.outcome].price)}
            </p>

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

            <p className="mb-4 text-center text-sm text-neutral-500">
              Win ≈ $
              {(amount / sheet.market.outcomes[sheet.outcome].price).toFixed(2)} if{" "}
              {sheet.market.outcomes[sheet.outcome].label.toLowerCase()} — real Polymarket
              odds
            </p>

            <button
              className="w-full rounded-2xl py-4 text-base font-bold text-white active:scale-[0.98]"
              style={{ backgroundColor: BLUE }}
              onClick={() => setSheet(null)} // TODO: POST /api/bets once the broker backend lands
            >
              Top up to bet
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
