"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Market } from "@/lib/polymarket/types";
import { LogoChip } from "@/components/Logo";
import { payoutIfWin, sharesFor, takerFee } from "@/lib/polymarket/fees";
import { useWallet } from "@/hooks/useWallet";
import {
  DEPOSIT_CONTRACT,
  PLAY_CONTRACT,
  checkInData,
  pickData,
  fetchPlayerState,
  type PlayerState,
} from "@/lib/chain";

// MiniPay app shell. Two themes — light (original) and Midnight Settlement
// (dark) — behind a toggle; components read only the --s-* semantic tokens.
// One bet sheet, two doors: free picks are REAL BinaryPlay transactions on
// Celo (user pays only gas); funded real-money bets await the broker backend.

type Pick = { outcome: 0 | 1; label: string; price: number; question: string; at: number };
type Tab = "markets" | "portfolio" | "you";
type Theme = "light" | "dark";

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

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("binary.theme") as Theme | null;
      if (saved === "light" || saved === "dark") setTheme(saved);
      else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
    } catch {}
  }, []);
  const toggle = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("binary.theme", next);
      } catch {}
      return next;
    });
  return [theme, toggle];
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
  const [theme, toggleTheme] = useTheme();
  const { address, isMiniPay, hasWallet, userLabel, connect, logout, sendTx } = useWallet();
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [txBusy, setTxBusy] = useState<"pick" | "checkin" | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // Real bets stay locked until the broker backend lands; everything the
  // chain can already tell us is live: streak, pick count, net deposits.
  const funded = false;
  const balance = player?.depositedUsd ?? 0;
  const streak = player?.streak ?? 0;

  const refreshPlayer = useCallback(() => {
    if (!address) return;
    fetchPlayerState(address).then(setPlayer).catch(() => {});
  }, [address]);

  useEffect(() => {
    refreshPlayer();
    const t = setInterval(refreshPlayer, 30_000);
    return () => clearInterval(t);
  }, [refreshPlayer]);

  const ensureAddress = async () => address ?? (await connect());

  const doCheckIn = async () => {
    setTxError(null);
    const from = await ensureAddress();
    if (!from) return setTxError(hasWallet ? "Connection declined." : "Open Binary inside MiniPay to play.");
    setTxBusy("checkin");
    try {
      await sendTx(PLAY_CONTRACT, checkInData());
      setTimeout(refreshPlayer, 3_000);
      setTimeout(refreshPlayer, 8_000);
    } catch {
      setTxError("Check-in didn’t go through — try again.");
    } finally {
      setTxBusy(null);
    }
  };

  const doPick = async (market: Market, outcome: 0 | 1) => {
    setTxError(null);
    const from = await ensureAddress();
    if (!from) return setTxError(hasWallet ? "Connection declined." : "Open Binary inside MiniPay to play.");
    setTxBusy("pick");
    try {
      await sendTx(PLAY_CONTRACT, pickData(market.conditionId, outcome));
      addPick(market.slug, {
        outcome,
        label: market.outcomes[outcome].label,
        price: market.outcomes[outcome].price,
        question: market.question,
        at: Date.now(),
      });
      setSheet(null);
      setTimeout(refreshPlayer, 3_000);
      setTimeout(refreshPlayer, 8_000);
    } catch {
      setTxError("Pick didn’t go through — try again.");
    } finally {
      setTxBusy(null);
    }
  };

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
    <main
      className={`${theme === "dark" ? "app-dark" : "app-light"} mx-auto min-h-dvh max-w-md bg-(--s-bg) pb-24 text-(--s-text)`}
    >
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-(--s-line) bg-(--s-bg-blur) px-4 py-3 backdrop-blur">
        <LogoChip />
        <div className="flex items-center gap-2">
          {!address && hasWallet && !isMiniPay && (
            <button
              onClick={connect}
              className="rounded-full bg-(--s-act) px-3 py-1 text-sm font-bold text-white"
            >
              Sign in
            </button>
          )}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-full bg-(--s-card) px-2.5 py-1 text-sm"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <button
            onClick={() => setTab("you")}
            className="flex items-center gap-1 rounded-full bg-(--s-gold-tint) px-3 py-1 font-mono text-sm font-bold text-(--s-gold)"
          >
            🔥 {streak}
          </button>
          <button
            onClick={() => setTopUp(true)}
            className="rounded-full bg-(--s-card) px-3 py-1 font-mono text-sm font-semibold"
          >
            ${balance.toFixed(2)}
          </button>
        </div>
      </header>

      {/* ── Markets ───────────────────────────────────────────── */}
      {tab === "markets" && (
        <>
          {error && (
            <p className="p-6 text-center text-sm text-(--s-sub)">
              Feed unavailable — pull to retry.
            </p>
          )}
          <ul className="divide-y divide-(--s-line)">
            {markets.map((m) => (
              <li key={m.slug} className="px-4 py-4">
                <div className="mb-1 flex items-start gap-3">
                  {m.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.image} alt="" className="h-10 w-10 rounded-xl object-cover" />
                  )}
                  <p className="flex-1 text-[15px] font-semibold leading-snug">{m.question}</p>
                  <span className="font-mono text-lg font-bold tabular-nums text-(--s-act-soft)">
                    {pct(m.outcomes[0].price)}
                  </span>
                </div>
                <p className="mb-3 pl-[52px] font-mono text-xs text-(--s-sub)">
                  ${Math.round(m.volume24h).toLocaleString()} today
                  {picks[m.slug] && (
                    <span className="ml-2 font-semibold text-(--s-gold)">
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
                          ? "bg-(--s-act-tint) text-(--s-act-soft)"
                          : "bg-(--s-lose-tint) text-(--s-lose)"
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

          <div className="mb-5 rounded-2xl bg-(--s-card) p-4">
            <p className="text-sm text-(--s-sub)">Cash balance</p>
            <p className="font-mono text-3xl font-bold tabular-nums">${balance.toFixed(2)}</p>
            <button
              onClick={() => setTopUp(true)}
              className="mt-3 w-full rounded-xl bg-(--s-act) py-3 text-sm font-bold text-white active:scale-[0.98]"
            >
              Top up with USDm
            </button>
          </div>

          <h3 className="mb-2 text-sm font-semibold text-(--s-sub)">
            Free picks {pickList.length > 0 && `· ${pickList.length}`}
          </h3>
          {pickList.length === 0 ? (
            <p className="rounded-2xl bg-(--s-card) p-4 text-sm text-(--s-sub)">
              No picks yet. Tap any market to lock in a free pick and start your streak.
            </p>
          ) : (
            <ul className="space-y-2">
              {pickList.map(([slug, p]) => (
                <li key={slug} className="rounded-2xl bg-(--s-card) p-4">
                  <p className="text-sm font-semibold leading-snug">{p.question}</p>
                  <p className="mt-1 font-mono text-xs text-(--s-sub)">
                    <span className="font-bold text-(--s-gold)">⚡ {p.label}</span> at{" "}
                    {cents(p.price)}
                    <span className="ml-2">would pay ${payoutIfWin(2, p.price).toFixed(2)} on $2</span>
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

          <div className="mb-4 rounded-2xl border border-(--s-gold-line) bg-(--s-gold-tint) p-5 text-center">
            <p className="text-5xl">🔥</p>
            <p className="mt-1 font-mono text-3xl font-bold text-(--s-gold)">{streak}</p>
            <p className="text-sm text-(--s-sub)">day streak — check in daily to grow it</p>
            <button
              className="mt-4 w-full rounded-xl bg-(--s-gold-solid) py-3 text-sm font-bold text-(--s-gold-contrast) active:scale-[0.98] disabled:opacity-60"
              disabled={txBusy === "checkin" || player?.checkedInToday}
              onClick={doCheckIn}
            >
              {player?.checkedInToday
                ? "Checked in ✓ — back tomorrow"
                : txBusy === "checkin"
                  ? "Confirming…"
                  : address
                    ? "Check in today"
                    : "Connect & check in"}
            </button>
            {txError && <p className="mt-2 text-xs text-(--s-lose)">{txError}</p>}
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-(--s-card) p-4">
              <p className="font-mono text-2xl font-bold tabular-nums">
                {player?.pickCount ?? pickList.length}
              </p>
              <p className="text-xs text-(--s-sub)">picks on-chain</p>
            </div>
            <div className="rounded-2xl bg-(--s-card) p-4">
              <p className="font-mono text-2xl font-bold tabular-nums">
                {player?.longestStreak ?? 0}
              </p>
              <p className="text-xs text-(--s-sub)">longest streak</p>
            </div>
            <div className="rounded-2xl bg-(--s-card) p-4">
              <p className="font-mono text-2xl font-bold tabular-nums">
                {player?.checkInCount ?? 0}
              </p>
              <p className="text-xs text-(--s-sub)">check-ins</p>
            </div>
          </div>

          {address ? (
            <div className="mb-4 rounded-2xl bg-(--s-card) p-4">
              <p className="break-all font-mono text-xs text-(--s-sub)">
                {isMiniPay ? "MiniPay wallet" : userLabel ? `Signed in · ${userLabel}` : "Wallet"}
                <br />
                {address}
              </p>
              {logout && (
                <button
                  onClick={logout}
                  className="mt-3 w-full rounded-xl border border-(--s-line) py-2 text-xs font-bold text-(--s-sub) active:scale-[0.98]"
                >
                  Sign out
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={connect}
              className="mb-4 w-full rounded-2xl border border-(--s-act) py-3 text-sm font-bold text-(--s-act-soft) active:scale-[0.98]"
            >
              {hasWallet ? "Sign in" : "Open in MiniPay to play"}
            </button>
          )}

          <div className="rounded-2xl bg-(--s-card) p-4 text-sm">
            <p className="font-semibold">How Binary works</p>
            <p className="mt-1 leading-relaxed text-(--s-sub)">
              Your bets are real orders in Polymarket&apos;s book, settled in USDm on Celo.
              Binary never takes the other side — you win at true market odds.
            </p>
          </div>
        </div>
      )}

      {/* ── Bottom nav ────────────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md border-t border-(--s-line) bg-(--s-bg-blur) backdrop-blur">
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
              tab === id ? "text-(--s-act-soft)" : "text-(--s-sub)"
            }`}
          >
            <span className="text-lg leading-none">{glyph}</span>
            {label}
          </button>
        ))}
      </nav>

      {/* ── Bet sheet ─────────────────────────────────────────── */}
      {sheet && sel && (
        <div
          className="fixed inset-0 z-20 flex items-end bg-black/50"
          onClick={() => setSheet(null)}
        >
          <div
            className={`${theme === "dark" ? "app-dark" : "app-light"} w-full rounded-t-3xl border-t border-(--s-line) bg-(--s-card) p-5 pb-8 text-(--s-text)`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-(--s-line)" />
            <p className="mb-1 text-sm text-(--s-sub)">{sheet.market.question}</p>
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
                          ? "border-(--s-act) bg-(--s-act-tint) text-(--s-act-soft)"
                          : "border-(--s-line) text-(--s-sub)"
                      }`}
                    >
                      ${v}
                    </button>
                  ))}
                </div>

                <div className="mb-4 rounded-2xl bg-(--s-bg) p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-(--s-sub)">Your bet</span>
                    <span className="font-mono font-bold tabular-nums">${amount.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-(--s-sub)">You win</span>
                    <span className="font-mono text-base font-bold tabular-nums text-(--s-win)">
                      ${win.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-(--s-sub) opacity-80">
                    ⓘ includes all fees · paid in full if {sel.label.toLowerCase()} wins; cashing
                    out early pays a ~${exitFee.toFixed(2)} market fee
                  </p>
                </div>

                <button
                  className="w-full rounded-2xl bg-(--s-act) py-4 text-base font-bold text-white active:scale-[0.98]"
                  onClick={() => setSheet(null)} // TODO: POST /api/bets (broker backend)
                >
                  Place bet · ${amount}
                </button>
              </>
            ) : (
              <>
                <div className="mb-4 rounded-2xl border border-(--s-gold-line) bg-(--s-gold-tint) p-4 text-sm">
                  <p className="font-bold text-(--s-gold)">⚡ Playing for XP</p>
                  <p className="mt-1 leading-relaxed text-(--s-sub)">
                    Lock in your free pick and grow your streak. Add money to win cash — this
                    pick would pay{" "}
                    <span className="font-mono font-bold text-(--s-text)">
                      ${payoutIfWin(2, sel.price).toFixed(2)}
                    </span>{" "}
                    on a $2 bet.
                  </p>
                </div>

                {txError && <p className="mb-2 text-center text-xs text-(--s-lose)">{txError}</p>}
                <button
                  className="mb-2 w-full rounded-2xl bg-(--s-act) py-4 text-base font-bold text-white active:scale-[0.98] disabled:opacity-60"
                  disabled={txBusy === "pick"}
                  onClick={() => doPick(sheet.market, sheet.outcome)}
                >
                  {txBusy === "pick"
                    ? "Confirming…"
                    : address
                      ? `Free pick · ${sel.label} ⚡`
                      : `Connect & pick ${sel.label} ⚡`}
                </button>
                <button
                  className="w-full rounded-2xl border border-(--s-act) py-3.5 text-base font-bold text-(--s-act-soft) active:scale-[0.98]"
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
        <div
          className="fixed inset-0 z-20 flex items-end bg-black/50"
          onClick={() => setTopUp(false)}
        >
          <div
            className={`${theme === "dark" ? "app-dark" : "app-light"} w-full rounded-t-3xl border-t border-(--s-line) bg-(--s-card) p-5 pb-8 text-(--s-text)`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-(--s-line)" />
            <h3 className="mb-1 text-xl font-bold">Top up with USDm</h3>
            <p className="mb-4 text-sm leading-relaxed text-(--s-sub)">
              Send USDm from this MiniPay wallet to Binary&apos;s deposit contract on Celo. Your
              balance goes live in about 2 minutes.
            </p>

            <div className="mb-4 rounded-2xl bg-(--s-bg) p-4">
              <p className="mb-1 text-xs text-(--s-sub)">Deposit contract (Celo)</p>
              <p className="break-all font-mono text-sm">{DEPOSIT_CONTRACT}</p>
              <button
                onClick={copyAddress}
                className="mt-3 w-full rounded-xl border border-(--s-act) py-2.5 text-sm font-bold text-(--s-act-soft) active:scale-[0.98]"
              >
                {copied ? "Copied ✓" : "Copy address"}
              </button>
            </div>

            <ol className="mb-4 space-y-1.5 text-sm text-(--s-sub)">
              <li>1 · Minimum $1 USDm to start</li>
              <li>2 · Funds show as “funding” while they travel</li>
              <li>3 · Withdrawals return to this wallet only — always</li>
            </ol>

            <button
              className="w-full rounded-2xl bg-(--s-act) py-4 text-base font-bold text-white active:scale-[0.98]"
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
