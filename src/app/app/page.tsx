"use client";

import { useEffect, useMemo, useState } from "react";
import type { Market } from "@/lib/polymarket/types";
import { LogoChip } from "@/components/Logo";
import { payoutIfWin, sharesFor, takerFee } from "@/lib/polymarket/fees";

// MiniPay app shell — Midnight Settlement identity. One bet sheet, two doors:
// unfunded taps are free picks (BinaryPlay / XP), funded taps are real orders.
// `funded`/`balance` are the flags the broker backend will provide; picks
// persist locally until the BinaryPlay relay lands.

const DEPOSIT_CONTRACT = "0xE75A70597501453Fb0DFBa9B34eA2b9495d67600";

type Pick = { outcome: 0 | 1; label: string; price: number; question: string; at: number };
type Tab = "markets" | "portfolio" | "you";

const cents = (p: number) => `${(p * 100).toFixed(p < 0.1 || p > 0.9 ? 1 : 0)}¢`;
const pct = (p: number) => `${Math.round(p * 100)}%`;

function usePicks() {
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem("binary.picks");
      if (raw) setPicks(JSON.parse(raw));
    } catch {}
  }, []);
  const addPick = (slug: string, p: Pick) =>
    setPicks((prev) => {
      const next = { ...prev, [slug]: p };
      try {
        localStorage.setItem("binary.picks", JSON.stringify(next));
      } catch {}
      return next;
    });
  return { picks, addPick };
}

export default function AppHome() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("markets");
  const [sheet, setSheet] = useState<{ market: Market; outcome: 0 | 1 } | null>(null);
  const [topUp, setTopUp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState(2);
  const { picks, addPick } = usePicks();

  // Broker-backend flags (stubbed until the funding pipeline is wired).
  const funded = false;
  const balance = 0;
  const streak = Object.keys(picks).length > 0 ? 1 : 0; // BinaryPlay read lands with wallet wiring

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
  const pickList = useMemo(
    () => Object.entries(picks).sort((a, b) => b[1].at - a[1].at),
    [picks]
  );

  const copyAddress = () => {
    navigator.clipboard?.writeText(DEPOSIT_CONTRACT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-mid pb-24 text-ice">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-mid-3 bg-mid/90 px-4 py-3 backdrop-blur">
        <LogoChip />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("you")}
            className="flex items-center gap-1 rounded-full bg-gold/10 px-3 py-1 font-mono text-sm font-bold text-gold"
          >
            🔥 {streak}
          </button>
          <button
            onClick={() => setTopUp(true)}
            className="rounded-full bg-mid-2 px-3 py-1 font-mono text-sm font-semibold text-ice"
          >
            ${balance.toFixed(2)}
          </button>
        </div>
      </header>

      {/* ── Markets ───────────────────────────────────────────── */}
      {tab === "markets" && (
        <>
          {error && (
            <p className="p-6 text-center text-sm text-fog">Feed unavailable — pull to retry.</p>
          )}
          <ul className="divide-y divide-mid-3/60">
            {markets.map((m) => (
              <li key={m.slug} className="px-4 py-4">
                <div className="mb-1 flex items-start gap-3">
                  {m.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.image} alt="" className="h-10 w-10 rounded-xl object-cover" />
                  )}
                  <p className="flex-1 text-[15px] font-semibold leading-snug">{m.question}</p>
                  <span className="font-mono text-lg font-bold tabular-nums text-act-soft">
                    {pct(m.outcomes[0].price)}
                  </span>
                </div>
                <p className="mb-3 pl-[52px] font-mono text-xs text-fog">
                  ${Math.round(m.volume24h).toLocaleString()} today
                  {picks[m.slug] && (
                    <span className="ml-2 font-semibold text-gold">
                      ⚡ {picks[m.slug].label}
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
                      className={`flex-1 rounded-2xl px-3 py-2.5 font-mono text-sm font-bold transition active:scale-95 ${
                        i === 0
                          ? "bg-act/15 text-act-soft"
                          : "bg-lose/10 text-lose"
                      }`}
                    >
                      {m.outcomes[i].label} {cents(m.outcomes[i].price)}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── Portfolio ─────────────────────────────────────────── */}
      {tab === "portfolio" && (
        <div className="px-4 py-5">
          <h2 className="mb-4 text-xl font-bold">Portfolio</h2>

          <div className="mb-5 rounded-2xl bg-mid-2 p-4">
            <p className="text-sm text-fog">Cash balance</p>
            <p className="font-mono text-3xl font-bold tabular-nums">${balance.toFixed(2)}</p>
            <button
              onClick={() => setTopUp(true)}
              className="mt-3 w-full rounded-xl bg-act py-3 text-sm font-bold text-white active:scale-[0.98]"
            >
              Top up with USDm
            </button>
          </div>

          <h3 className="mb-2 text-sm font-semibold text-fog">
            Free picks {pickList.length > 0 && `· ${pickList.length}`}
          </h3>
          {pickList.length === 0 ? (
            <p className="rounded-2xl bg-mid-2 p-4 text-sm text-fog">
              No picks yet. Tap any market to lock in a free pick and start your streak.
            </p>
          ) : (
            <ul className="space-y-2">
              {pickList.map(([slug, p]) => (
                <li key={slug} className="rounded-2xl bg-mid-2 p-4">
                  <p className="text-sm font-semibold leading-snug">{p.question}</p>
                  <p className="mt-1 font-mono text-xs text-fog">
                    <span className="font-bold text-gold">⚡ {p.label}</span> at {cents(p.price)}
                    <span className="ml-2 text-fog">
                      would pay ${payoutIfWin(2, p.price).toFixed(2)} on $2
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── You ───────────────────────────────────────────────── */}
      {tab === "you" && (
        <div className="px-4 py-5">
          <h2 className="mb-4 text-xl font-bold">You</h2>

          <div className="mb-4 rounded-2xl border border-gold/25 bg-gradient-to-b from-gold/10 to-transparent p-5 text-center">
            <p className="text-5xl">🔥</p>
            <p className="mt-1 font-mono text-3xl font-bold text-gold">{streak}</p>
            <p className="text-sm text-fog">day streak — check in daily to grow it</p>
            <button
              className="mt-4 w-full rounded-xl bg-gold py-3 text-sm font-bold text-mid active:scale-[0.98]"
              onClick={() => {}} // TODO: relay BinaryPlay.checkIn()
            >
              Check in today
            </button>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-mid-2 p-4">
              <p className="font-mono text-2xl font-bold tabular-nums">{pickList.length}</p>
              <p className="text-xs text-fog">free picks made</p>
            </div>
            <div className="rounded-2xl bg-mid-2 p-4">
              <p className="font-mono text-2xl font-bold tabular-nums">0</p>
              <p className="text-xs text-fog">real bets placed</p>
            </div>
          </div>

          <div className="rounded-2xl bg-mid-2 p-4 text-sm">
            <p className="font-semibold">How Binary works</p>
            <p className="mt-1 leading-relaxed text-fog">
              Your bets are real orders in Polymarket&apos;s book, settled in USDm on Celo.
              Binary never takes the other side — you win at true market odds.
            </p>
          </div>
        </div>
      )}

      {/* ── Bottom nav ────────────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md border-t border-mid-3 bg-mid/95 backdrop-blur">
        {(
          [
            ["markets", "Markets", "◉"],
            ["portfolio", "Portfolio", "▤"],
            ["you", "You", "☺"],
          ] as const
        ).map(([id, label, glyph]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition ${
              tab === id ? "text-act-soft" : "text-fog"
            }`}
          >
            <span className="text-lg leading-none">{glyph}</span>
            {label}
          </button>
        ))}
      </nav>

      {/* ── Bet sheet ─────────────────────────────────────────── */}
      {sheet && sel && (
        <div className="fixed inset-0 z-20 flex items-end bg-black/60" onClick={() => setSheet(null)}>
          <div
            className="w-full rounded-t-3xl border-t border-mid-3 bg-mid-2 p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-mid-3" />
            <p className="mb-1 text-sm text-fog">{sheet.market.question}</p>
            <p className="mb-4 text-xl font-bold">
              {sel.label} · <span className="font-mono">{cents(sel.price)}</span>
            </p>

            {funded ? (
              <>
                <div className="mb-4 flex gap-2">
                  {[1, 2, 5, 10].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmount(v)}
                      className={`flex-1 rounded-xl border py-2 font-mono text-sm font-bold ${
                        amount === v
                          ? "border-act bg-act/10 text-act-soft"
                          : "border-mid-3 text-fog"
                      }`}
                    >
                      ${v}
                    </button>
                  ))}
                </div>

                <div className="mb-4 rounded-2xl bg-mid p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-fog">Your bet</span>
                    <span className="font-mono font-bold tabular-nums">${amount.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-fog">You win</span>
                    <span className="font-mono text-base font-bold tabular-nums text-win">
                      ${win.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-fog/70">
                    ⓘ includes all fees · paid in full if {sel.label.toLowerCase()} wins; cashing
                    out early pays a ~${exitFee.toFixed(2)} market fee
                  </p>
                </div>

                <button
                  className="w-full rounded-2xl bg-act py-4 text-base font-bold text-white active:scale-[0.98]"
                  onClick={() => setSheet(null)} // TODO: POST /api/bets (broker backend)
                >
                  Place bet · ${amount}
                </button>
              </>
            ) : (
              <>
                <div className="mb-4 rounded-2xl border border-gold/25 bg-gold/10 p-4 text-sm">
                  <p className="font-bold text-gold">⚡ Playing for XP</p>
                  <p className="mt-1 leading-relaxed text-fog">
                    Lock in your free pick and grow your streak. Add money to win cash — this
                    pick would pay{" "}
                    <span className="font-mono font-bold text-ice">
                      ${payoutIfWin(2, sel.price).toFixed(2)}
                    </span>{" "}
                    on a $2 bet.
                  </p>
                </div>

                <button
                  className="mb-2 w-full rounded-2xl bg-act py-4 text-base font-bold text-white active:scale-[0.98]"
                  onClick={() => {
                    // TODO: relay BinaryPlay.pick(keccak(conditionId), outcome)
                    addPick(sheet.market.slug, {
                      outcome: sheet.outcome,
                      label: sel.label,
                      price: sel.price,
                      question: sheet.market.question,
                      at: Date.now(),
                    });
                    setSheet(null);
                  }}
                >
                  Free pick · {sel.label} ⚡
                </button>
                <button
                  className="w-full rounded-2xl border border-act py-3.5 text-base font-bold text-act-soft active:scale-[0.98]"
                  onClick={() => {
                    setSheet(null);
                    setTopUp(true);
                  }}
                >
                  Add money to win cash
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Top-up sheet ──────────────────────────────────────── */}
      {topUp && (
        <div className="fixed inset-0 z-20 flex items-end bg-black/60" onClick={() => setTopUp(false)}>
          <div
            className="w-full rounded-t-3xl border-t border-mid-3 bg-mid-2 p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-mid-3" />
            <h3 className="mb-1 text-xl font-bold">Top up with USDm</h3>
            <p className="mb-4 text-sm leading-relaxed text-fog">
              Send USDm from this MiniPay wallet to Binary&apos;s deposit contract on Celo. Your
              balance goes live in about 2 minutes.
            </p>

            <div className="mb-4 rounded-2xl bg-mid p-4">
              <p className="mb-1 text-xs text-fog">Deposit contract (Celo)</p>
              <p className="break-all font-mono text-sm">{DEPOSIT_CONTRACT}</p>
              <button
                onClick={copyAddress}
                className="mt-3 w-full rounded-xl border border-act py-2.5 text-sm font-bold text-act-soft active:scale-[0.98]"
              >
                {copied ? "Copied ✓" : "Copy address"}
              </button>
            </div>

            <ol className="mb-4 space-y-1.5 text-sm text-fog">
              <li>1 · Minimum $1 USDm to start</li>
              <li>2 · Funds show as “funding” while they travel</li>
              <li>3 · Withdrawals return to this wallet only — always</li>
            </ol>

            <button
              className="w-full rounded-2xl bg-act py-4 text-base font-bold text-white active:scale-[0.98]"
              onClick={() => setTopUp(false)} // TODO: MiniPay deep link / in-app transfer
            >
              Done
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
