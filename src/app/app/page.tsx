"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Market } from "@/lib/polymarket/types";
import { LogoChip } from "@/components/Logo";
import {
  AllIcon,
  CryptoIcon,
  CultureIcon,
  MarketsIcon,
  PoliticsIcon,
  PortfolioIcon,
  SportsIcon,
  YouIcon,
} from "@/components/icons";
import { MomentScreen, type Moment } from "@/components/moments";
import { payoutIfWin, sharesFor, takerFee } from "@/lib/polymarket/fees";
import { useWallet } from "@/hooks/useWallet";
import {
  PLAY_CONTRACT,
  DEPOSIT_CONTRACT,
  USDM,
  approveUsdmData,
  checkInData,
  depositData,
  fetchPlayerState,
  pickData,
  usdToWei,
  usdmAllowance,
  type PlayerState,
} from "@/lib/chain";

// MiniPay app shell. Two themes — light (original) and Midnight Settlement
// (dark) — behind a toggle; components read only the --s-* semantic tokens.
// One bet sheet, two doors: free picks are REAL BinaryPlay transactions on
// Celo (user pays only gas); funded real-money bets await the broker backend.

type Pick = { outcome: 0 | 1; label: string; price: number; question: string; at: number };
type Tab = "markets" | "portfolio" | "you";
type Theme = "light" | "dark";
type Category = "all" | "sports" | "crypto" | "politics" | "culture";

const CATEGORIES: [Category, string, (p: { className?: string }) => React.ReactElement][] = [
  ["all", "All", AllIcon],
  ["sports", "Sports", SportsIcon],
  ["crypto", "Crypto", CryptoIcon],
  ["politics", "Politics", PoliticsIcon],
  ["culture", "Culture", CultureIcon],
];

const cents = (p: number) => `${(p * 100).toFixed(p < 0.1 || p > 0.9 ? 1 : 0)}¢`;
const pct = (p: number) => `${Math.round(p * 100)}%`;

// localStorage hydration below is deferred one frame (rAF): the server frame
// and first client frame must match, so the stored value can't be read during
// render, and setState directly in an effect body cascades renders.
function usePicks() {
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem("binary.picks");
        if (raw) setPicks(JSON.parse(raw));
      } catch {}
    });
    return () => cancelAnimationFrame(id);
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
    const id = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem("binary.theme") as Theme | null;
        if (saved === "light" || saved === "dark") setTheme(saved);
        else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
      } catch {}
    });
    return () => cancelAnimationFrame(id);
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
  const [category, setCategory] = useState<Category>("all");
  const [feedLoading, setFeedLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("markets");
  const [sheet, setSheet] = useState<{ market: Market; outcome: 0 | 1 } | null>(null);
  const [topUp, setTopUp] = useState(false);
  const [depositUsd, setDepositUsd] = useState("");
  // Set while a deposit is crossing the bridge; drives the header pill.
  const [fundingUsd, setFundingUsd] = useState<number | null>(null);
  const [amount, setAmount] = useState(2);
  const { picks, addPick } = usePicks();
  const [theme, toggleTheme] = useTheme();
  const { address, isMiniPay, hasWallet, userLabel, connect, logout, sendTx } = useWallet();
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [txBusy, setTxBusy] = useState<"pick" | "checkin" | "bet" | "topup" | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [graded, setGraded] = useState<Record<string, "won" | "lost">>({});
  const prevPlayer = useRef<PlayerState | null>(null);
  // Funding-tracker baseline: net deposits + credited pUSD when it opened.
  const pendingBase = useRef<{ net: number; credited: number | null } | null>(null);

  // Funded = money has entered the pipeline via the deposits contract. The
  // bets API double-checks the credited pUSD balance before every order.
  const funded = (player?.depositedUsd ?? 0) > 0;
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

  // Withdrawal-landed detector: cumulative payouts only ever rise, and a rise
  // means USDm just arrived back in the user's wallet.
  useEffect(() => {
    const prev = prevPlayer.current;
    prevPlayer.current = player;
    if (!prev || !player) return;
    if (player.paidOutUsd > prev.paidOutUsd) {
      setMoment({ t: "cashout", amount: player.paidOutUsd - prev.paidOutUsd });
    }
  }, [player]);

  // Deposit-in-flight watcher: runs whenever money is crossing, whether or
  // not the tracker screen is open ("close it, we'll light it up"). Advances
  // the tracker when the deposit confirms on Celo; fires MONEY'S IN when the
  // broker reports the pUSD credited.
  useEffect(() => {
    if (fundingUsd === null) return;
    const base = pendingBase.current;
    if (!base) return;
    const tick = async () => {
      refreshPlayer();
      const net = prevPlayer.current?.depositedUsd ?? 0;
      if (net > base.net) {
        setMoment((m) =>
          m?.t === "pending" && m.step < 3 ? { t: "pending", step: 3, usd: m.usd } : m
        );
      }
      try {
        const r = await fetch("/api/account").then((x) => x.json());
        if (r.configured && typeof r.creditedUsd === "number") {
          if (base.credited === null) base.credited = r.creditedUsd;
          else if (r.creditedUsd > base.credited) {
            setFundingUsd(null);
            // Take over the tracker or an idle screen; never stomp another moment.
            setMoment((m) =>
              m === null || m.t === "pending" ? { t: "funded", balance: net } : m
            );
          }
        }
      } catch {}
    };
    const iv = setInterval(tick, 8_000);
    return () => clearInterval(iv);
  }, [fundingUsd, refreshPlayer]);

  // Grade past picks against resolved markets (client-side v1: a closed
  // market's outcome price collapses to ~0/1). One result moment per batch.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem("binary.graded");
        if (raw) setGraded(JSON.parse(raw));
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Design review hatch: /app?moment=<type> renders any moment with sample
  // data — no on-chain event needed to see a screen on a real device.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const t = new URLSearchParams(window.location.search).get("moment");
      if (!t) return;
      const q = "Will Nigeria win AFCON 2027?";
      const samples: Record<string, Moment> = {
        picked: { t: "picked", label: "YES", price: 0.39, question: q, streak: 5 },
        bet: { t: "bet", label: "YES", price: 0.39, question: q, usd: 5, win: 12.82 },
        checkedin: { t: "checkedin", streak: 7 },
        win: { t: "win", label: "YES", question: q, wouldHavePaid: 5.13 },
        loss: { t: "loss", label: "NO", question: q },
        pending: { t: "pending", step: 3, usd: 10 },
        funded: { t: "funded", balance: 25 },
        cashout: { t: "cashout", amount: 31.4 },
        recap: { t: "recap", picks: 9, wins: 4, losses: 2, streak: 7, longest: 11, checkIns: 23 },
        rankup: { t: "rankup", rank: 8 },
        share: {
          t: "share",
          heading: q,
          line: "YES · 39¢",
          text: `I'm calling YES on “${q}” — binary-io.vercel.app`,
        },
      };
      if (samples[t]) setMoment(samples[t]);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    const ungraded = Object.entries(picks).filter(([slug]) => !graded[slug]);
    if (ungraded.length === 0) return;
    let live = true;
    (async () => {
      const results: Record<string, "won" | "lost"> = {};
      for (const [slug, p] of ungraded.slice(0, 4)) {
        try {
          const d = await fetch(`/api/markets/${slug}`).then((r) => r.json());
          if (d.market?.closed) {
            results[slug] = d.market.outcomes[p.outcome].price > 0.5 ? "won" : "lost";
          }
        } catch {}
      }
      if (!live || Object.keys(results).length === 0) return;
      setGraded((g) => {
        const merged = { ...g, ...results };
        try {
          localStorage.setItem("binary.graded", JSON.stringify(merged));
        } catch {}
        return merged;
      });
      const [slug, result] = Object.entries(results)[0];
      const p = picks[slug];
      setMoment((m) =>
        m ??
        (result === "won"
          ? { t: "win", label: p.label, question: p.question, wouldHavePaid: payoutIfWin(2, p.price) }
          : { t: "loss", label: p.label, question: p.question })
      );
    })();
    return () => {
      live = false;
    };
  }, [picks, graded]);

  const ensureAddress = async () => address ?? (await connect());

  const doCheckIn = async () => {
    setTxError(null);
    const from = await ensureAddress();
    if (!from) return setTxError(hasWallet ? "Connection declined." : "Open Binary inside MiniPay to play.");
    setTxBusy("checkin");
    try {
      await sendTx(PLAY_CONTRACT, checkInData());
      setMoment({ t: "checkedin", streak: (player?.checkedInToday ? streak : streak + 1) || 1 });
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
      // The chain only records keccak(conditionId), which can't be reversed —
      // without this row the pick is ungradeable for good. Deliberately not
      // awaited into the happy path: the pick is already on-chain, so a
      // registry hiccup must never surface as a failed pick.
      fetch("/api/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditionId: market.conditionId, slug: market.slug }),
      }).catch(() => {});
      addPick(market.slug, {
        outcome,
        label: market.outcomes[outcome].label,
        price: market.outcomes[outcome].price,
        question: market.question,
        at: Date.now(),
      });
      setSheet(null);
      setMoment({
        t: "picked",
        label: market.outcomes[outcome].label,
        price: market.outcomes[outcome].price,
        question: market.question,
        streak,
      });
      setTimeout(refreshPlayer, 3_000);
      setTimeout(refreshPlayer, 8_000);
    } catch {
      setTxError("Pick didn’t go through — try again.");
    } finally {
      setTxBusy(null);
    }
  };

  // Deposits go through deposit() on the contract (approve first if needed) —
  // a raw USDm transfer never emits Deposited, so it would never be credited.
  const MIN_DEPOSIT = 2; // below this, bridge fees eat a real chunk of it
  const doTopUp = async (usd: number) => {
    setTxError(null);
    const from = await ensureAddress();
    if (!from) return setTxError(hasWallet ? "Connection declined." : "Open Binary inside MiniPay to play.");
    setTxBusy("topup");
    try {
      const wei = usdToWei(usd);
      const allowance = await usdmAllowance(from).catch(() => 0n);
      if (allowance < wei) {
        await sendTx(USDM, approveUsdmData(wei));
      }
      const net = player?.depositedUsd ?? 0;
      let credited: number | null = null;
      try {
        const r = await fetch("/api/account").then((x) => x.json());
        if (r.configured && typeof r.creditedUsd === "number") credited = r.creditedUsd;
      } catch {}
      await sendTx(DEPOSIT_CONTRACT, depositData(wei));
      pendingBase.current = { net, credited };
      setFundingUsd(usd);
      setTopUp(false);
      setDepositUsd("");
      setMoment({ t: "pending", step: 2, usd });
      setTimeout(refreshPlayer, 3_000);
    } catch {
      setTxError("Deposit didn’t go through — try again.");
    } finally {
      setTxBusy(null);
    }
  };

  const doBet = async (market: Market, outcome: 0 | 1, usd: number) => {
    setTxError(null);
    const from = await ensureAddress();
    if (!from) return setTxError(hasWallet ? "Connection declined." : "Open Binary inside MiniPay to play.");
    setTxBusy("bet");
    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: from,
          tokenID: market.outcomes[outcome].clobTokenId,
          usd,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTxError(
          res.status === 409
            ? "Your deposit is still funding — give it a minute."
            : data.error ?? "Bet didn’t go through — try again."
        );
        return;
      }
      setSheet(null);
      setMoment({
        t: "bet",
        label: market.outcomes[outcome].label,
        price: market.outcomes[outcome].price,
        question: market.question,
        usd,
        win: payoutIfWin(usd, market.outcomes[outcome].price),
      });
      setTimeout(refreshPlayer, 3_000);
    } catch {
      setTxError("Bet didn’t go through — try again.");
    } finally {
      setTxBusy(null);
    }
  };

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`/api/markets?limit=40&category=${category}`)
        .then((r) => r.json())
        .then((d) => {
          if (!live) return;
          if (d.markets) setMarkets(d.markets);
          else setError(true);
          setFeedLoading(false);
        })
        .catch(() => {
          if (!live) return;
          setError(true);
          setFeedLoading(false);
        });
    load();
    const t = setInterval(load, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [category]);

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

  return (
    <main
      className={`${theme === "dark" ? "app-dark" : "app-light"} mx-auto w-full min-w-0 min-h-dvh max-w-md bg-(--s-bg) pb-24 text-(--s-text)`}
    >
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-(--s-line) bg-(--s-bg-blur) px-4 py-3 backdrop-blur">
        <LogoChip />
        <div className="flex items-center gap-2">
          {!address && !isMiniPay && (
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
            onClick={() => (fundingUsd !== null ? setMoment({ t: "pending", step: 2, usd: fundingUsd }) : setTopUp(true))}
            className="rounded-full bg-(--s-card) px-3 py-1 font-mono text-sm font-semibold"
          >
            {fundingUsd !== null ? (
              <span className="moment-step-active text-(--s-act-soft)">
                +${fundingUsd.toFixed(2)}…
              </span>
            ) : (
              `$${balance.toFixed(2)}`
            )}
          </button>
        </div>
      </header>

      {/* ── Markets ───────────────────────────────────────────── */}
      {tab === "markets" && (
        <>
          <div
            className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Market categories"
          >
            {CATEGORIES.map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={id === category}
                onClick={() => {
                  if (id === category) return;
                  setCategory(id);
                  setMarkets([]);
                  setFeedLoading(true);
                  setError(false);
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-3.5 text-sm font-semibold transition active:scale-95 ${
                  id === category ? "bg-(--s-act) text-white" : "bg-(--s-card) text-(--s-sub)"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </button>
            ))}
          </div>
          {!address && (
            <div className="mx-4 mt-4 rounded-2xl border border-(--s-act) bg-(--s-act-tint) p-4">
              <p className="text-[15px] font-bold">Play free. Win real cash.</p>
              <p className="mt-1 text-sm text-(--s-sub)">
                Pick a side on real Polymarket markets — free picks build your streak,
                deposits win USDm.
              </p>
              {hasWallet ? (
                <button
                  onClick={connect}
                  className="mt-3 w-full rounded-xl bg-(--s-act) py-3 text-sm font-bold text-white active:scale-[0.98]"
                >
                  Sign in to start
                </button>
              ) : (
                <a
                  href="https://www.opera.com/products/minipay"
                  className="mt-3 block w-full rounded-xl bg-(--s-act) py-3 text-center text-sm font-bold text-white active:scale-[0.98]"
                >
                  Get MiniPay to start
                </a>
              )}
            </div>
          )}
          {error && (
            <p className="p-6 text-center text-sm text-(--s-sub)">
              Feed unavailable — pull to retry.
            </p>
          )}
          {!error && !feedLoading && markets.length === 0 && (
            <p className="p-6 text-center text-sm text-(--s-sub)">
              Nothing liquid here right now — check back soon.
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

          <button
            className="mb-4 w-full rounded-2xl border border-(--s-gold-line) bg-(--s-gold-tint) py-3 text-sm font-bold text-(--s-gold) active:scale-[0.98]"
            onClick={() => {
              const results = Object.values(graded);
              setMoment({
                t: "recap",
                picks: pickList.length,
                wins: results.filter((r) => r === "won").length,
                losses: results.filter((r) => r === "lost").length,
                streak,
                longest: player?.longestStreak ?? 0,
                checkIns: player?.checkInCount ?? 0,
              });
            }}
          >
            Your week on Binary →
          </button>

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
            ["markets", "Markets", MarketsIcon],
            ["portfolio", "Portfolio", PortfolioIcon],
            ["you", "You", YouIcon],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
              tab === id ? "text-(--s-act-soft)" : "text-(--s-sub)"
            }`}
          >
            <Icon className={`h-6 w-6 transition ${tab === id ? "scale-110" : ""}`} />
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

                {txError && <p className="mb-2 text-center text-xs text-(--s-lose)">{txError}</p>}
                <button
                  className="w-full rounded-2xl bg-(--s-act) py-4 text-base font-bold text-white active:scale-[0.98] disabled:opacity-60"
                  disabled={txBusy === "bet"}
                  onClick={() => doBet(sheet.market, sheet.outcome, amount)}
                >
                  {txBusy === "bet" ? "Placing…" : `Place bet · $${amount}`}
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
              Your USDm becomes betting power in about 2 minutes. Any amount from ${MIN_DEPOSIT}.
            </p>

            <div className="mb-3 flex items-center gap-2 rounded-2xl bg-(--s-bg) p-4">
              <span className="font-mono text-2xl font-bold text-(--s-sub)">$</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="10.00"
                value={depositUsd}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d*\.?\d{0,2}$/.test(v)) setDepositUsd(v);
                }}
                className="w-full bg-transparent font-mono text-2xl font-bold tabular-nums outline-none placeholder:text-(--s-sub) placeholder:opacity-50"
              />
            </div>

            <div className="mb-4 flex gap-2">
              {[5, 10, 20].map((v) => (
                <button
                  key={v}
                  onClick={() => setDepositUsd(String(v))}
                  className={`flex-1 rounded-xl border py-2 font-mono text-sm font-bold ${
                    depositUsd === String(v)
                      ? "border-(--s-act) bg-(--s-act-tint) text-(--s-act-soft)"
                      : "border-(--s-line) text-(--s-sub)"
                  }`}
                >
                  ${v}
                </button>
              ))}
            </div>

            <ol className="mb-4 space-y-1.5 text-sm text-(--s-sub)">
              <li>1 · You confirm in MiniPay — we never touch your wallet</li>
              <li>2 · Your money crosses to Polymarket (~2 min, tracked live)</li>
              <li>3 · Withdrawals return to this wallet only — always</li>
            </ol>

            {txError && <p className="mb-2 text-center text-xs text-(--s-lose)">{txError}</p>}
            {(() => {
              const usd = parseFloat(depositUsd);
              const valid = Number.isFinite(usd) && usd >= MIN_DEPOSIT;
              return (
                <button
                  className="w-full rounded-2xl bg-(--s-act) py-4 text-base font-bold text-white active:scale-[0.98] disabled:opacity-60"
                  disabled={!valid || txBusy === "topup"}
                  onClick={() => doTopUp(usd)}
                >
                  {txBusy === "topup"
                    ? "Confirm in your wallet…"
                    : valid
                      ? `Top up $${usd.toFixed(2)}`
                      : depositUsd && Number.isFinite(usd)
                        ? `Minimum $${MIN_DEPOSIT}`
                        : "Enter an amount"}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Moment screens (full-screen takeovers) ────────────── */}
      {moment && (
        <MomentScreen
          moment={moment}
          themeClass={theme === "dark" ? "app-dark" : "app-light"}
          handlers={{
            onClose: () => setMoment(null),
            onShare: (heading, line, text) => setMoment({ t: "share", heading, line, text }),
            onGoBet: () => {
              setMoment(null);
              setTab("markets");
            },
          }}
        />
      )}
    </main>
  );
}
