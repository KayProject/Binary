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
import { Leaderboard } from "@/components/Leaderboard";
import { MomentScreen, type Moment } from "@/components/moments";
import type { History, Play } from "@/lib/play/history";
import { payoutIfWin, sharesFor, takerFee } from "@/lib/polymarket/fees";
import { useWallet } from "@/hooks/useWallet";
import {
  PLAY_CONTRACT,
  DEPOSIT_CONTRACT,
  FAUCET_CONTRACT,
  USDM,
  approveUsdmData,
  checkInData,
  claimData,
  depositData,
  fetchFaucetState,
  fetchPlayerState,
  pickData,
  usdToWei,
  usdmAllowance,
  type FaucetState,
  type PlayerState,
} from "@/lib/chain";
import { askDelta, type DeltaInsight } from "@/lib/insight";

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

// A player's history, from the chain rather than this device. Null address =
// nothing to ask about; the caller shows a connect prompt instead.
//
// The result is tagged with the address it belongs to, so switching wallets
// derives back to null rather than setState-ing in the effect body (which
// cascades renders — same reason the localStorage hooks above defer by rAF).
// A nonce bump refetches without clearing, so a refresh doesn't flash the list
// back to a loading line.
function usePlays(address: string | null, nonce: number) {
  const [data, setData] = useState<{ address: string; result: History | "error" } | null>(null);

  useEffect(() => {
    if (!address) return;
    let live = true;
    fetch(`/api/plays?address=${address}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: History) => live && setData({ address, result: d }))
      .catch(() => live && setData({ address, result: "error" }));
    return () => {
      live = false;
    };
  }, [address, nonce]);

  const result = address && data?.address === address ? data.result : null;
  return {
    history: result && result !== "error" ? result : null,
    state: !address ? "idle" : result === "error" ? "error" : result ? "idle" : "loading",
  } as const;
}

function Chip({ tone, children }: { tone: "win" | "lose" | "sub" | "gold"; children: React.ReactNode }) {
  const tones = {
    win: "bg-(--s-card) text-(--s-win)",
    lose: "bg-(--s-card) text-(--s-lose)",
    sub: "bg-(--s-card) text-(--s-sub)",
    gold: "bg-(--s-gold-tint) text-(--s-gold)",
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

// A pick's outcome, said plainly. "unknown" is ours to own, not the player's:
// their conditionId was never recorded, so the pick can never be graded — and
// calling that a loss would be a lie.
const VERDICT: Record<Play["resolution"], { label: string; tone: "win" | "lose" | "sub" }> = {
  won: { label: "WON", tone: "win" },
  lost: { label: "LOST", tone: "lose" },
  open: { label: "LIVE", tone: "sub" },
  void: { label: "NO RESULT", tone: "sub" },
  unknown: { label: "UNTRACKED", tone: "sub" },
};

function PlayRow({ play }: { play: Play }) {
  const v = VERDICT[play.resolution];
  return (
    <li className="rounded-2xl bg-(--s-card) p-4">
      <div className="flex items-start gap-2">
        {play.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={play.image} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
        )}
        <p className="flex-1 text-sm font-semibold leading-snug">
          {play.question ?? "This market couldn’t be traced back"}
        </p>
        <Chip tone={v.tone}>{v.label}</Chip>
      </div>
      <p className="mt-1 font-mono text-xs text-(--s-sub)">
        {play.label && <span className="font-bold text-(--s-gold)">⚡ {play.label}</span>}
        {play.priceAtPick !== null && ` at ${cents(play.priceAtPick)}`}
        {play.currentPrice !== null && ` · now ${cents(play.currentPrice)}`}
        {play.xp > 0 && <span className="ml-2 font-bold text-(--s-gold)">+{play.xp} XP</span>}
      </p>
    </li>
  );
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
  // Paid Delta readout for the market open in the sheet; cleared on open.
  const [insight, setInsight] = useState<DeltaInsight | null>(null);
  const [insightBusy, setInsightBusy] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [topUp, setTopUp] = useState(false);
  const [depositUsd, setDepositUsd] = useState("");
  const [withdraw, setWithdraw] = useState(false);
  const [withdrawUsd, setWithdrawUsd] = useState("");
  // Set while a deposit is crossing the bridge; drives the header pill.
  const [fundingUsd, setFundingUsd] = useState<number | null>(null);
  const [amount, setAmount] = useState(2);
  const { picks, addPick } = usePicks();
  const [theme, toggleTheme] = useTheme();
  const { address, isMiniPay, hasWallet, userLabel, connect, logout, sendTx } = useWallet();
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [txBusy, setTxBusy] = useState<"pick" | "checkin" | "bet" | "topup" | "withdraw" | "claim" | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  // Bumped after a pick lands, so the history refetches instead of waiting out
  // the 60s scan cache.
  const [playsNonce, setPlaysNonce] = useState(0);
  const { history, state: playsState } = usePlays(address ?? null, playsNonce);
  const [graded, setGraded] = useState<Record<string, "won" | "lost">>({});
  // Distinct days checked in. The contract's checkInCount counts same-day
  // repeats too ("never reverts on repeats"), which ran ~32x hot on live data
  // — a one-day user was being shown "47 check-ins". Take the deduped figure
  // from the scorer instead, so the tile and the board can't disagree.
  const [checkInDays, setCheckInDays] = useState<number | null>(null);
  const [faucet, setFaucet] = useState<FaucetState | null>(null);
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
    fetchFaucetState(address).then(setFaucet).catch(() => {});
  }, [address]);

  useEffect(() => {
    refreshPlayer();
    const t = setInterval(refreshPlayer, 30_000);
    return () => clearInterval(t);
  }, [refreshPlayer]);

  useEffect(() => {
    let cancelled: boolean = false;
    // Deferred a frame: setState straight from an effect body cascades renders
    // (react-hooks/set-state-in-effect), the same reason the hydration reads
    // above go through rAF.
    const id = requestAnimationFrame(() => {
      if (!address) return setCheckInDays(null);
      fetch(`/api/leaderboard?window=all&address=${address}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => !cancelled && setCheckInDays(d?.me?.checkInDays ?? 0))
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [address]);

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
      // Past the scan cache, so the pick swaps from CONFIRMING to a real row.
      setTimeout(() => setPlaysNonce((n) => n + 1), 65_000);
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

  // The out-leg: the server signs payout() as owner; the contract pins the
  // destination to this wallet, so the user signs nothing and can lose nothing.
  const MIN_WITHDRAW = 0.5;
  const doWithdraw = async (usd: number) => {
    setTxError(null);
    const from = await ensureAddress();
    if (!from) return setTxError(hasWallet ? "Connection declined." : "Open Binary inside MiniPay to play.");
    setTxBusy("withdraw");
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: from, usd }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTxError(
          res.status === 402
            ? `You can withdraw up to $${(data.availableUsd ?? 0).toFixed(2)}.`
            : res.status === 503
              ? "Withdrawals are briefly paused — try again shortly."
              : data.error ?? "Withdrawal didn’t go through — try again."
        );
        return;
      }
      setWithdraw(false);
      setWithdrawUsd("");
      // No moment here: the paidOutUsd-rise detector fires PAID OUT when the
      // refresh sees it on-chain — firing both would show it twice.
      setTimeout(refreshPlayer, 3_000);
    } catch {
      setTxError("Withdrawal didn’t go through — try again.");
    } finally {
      setTxBusy(null);
    }
  };

  // Faucet promo: one free USDm drip per wallet, paid straight to the wallet.
  // While the pot is unfunded the card renders as a teaser and never offers
  // the transaction — claim() would only revert FaucetDry.
  const doClaim = async () => {
    setTxError(null);
    const from = await ensureAddress();
    if (!from) return setTxError(hasWallet ? "Connection declined." : "Open Binary inside MiniPay to play.");
    setTxBusy("claim");
    try {
      await sendTx(FAUCET_CONTRACT, claimData());
      setMoment({ t: "claimed", amount: faucet?.dripUsd ?? 1 });
      setTimeout(refreshPlayer, 3_000);
    } catch {
      setTxError("Claim didn’t go through — try again.");
    } finally {
      setTxBusy(null);
    }
  };

  // "Ask Delta (1¢)": pays the x402 fee from the user's own wallet and shows
  // Delta's live read on the market. Real payment, real measurements.
  const doAskDelta = async (market: Market) => {
    setInsightError(null);
    setInsightBusy(true);
    try {
      const result = await askDelta(
        market.outcomes[0].clobTokenId,
        market.outcomes[1].clobTokenId,
      );
      setInsight(result);
    } catch {
      setInsightError("Couldn’t get Delta’s read — payment declined or network hiccup.");
    } finally {
      setInsightBusy(false);
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
          conditionId: market.conditionId,
          // Arms the SLA when a paid Delta read preceded this bet.
          quoteId: insight?.sla?.quoteId,
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

  // The chain is the record. A pick made seconds ago hasn't been scanned yet
  // (60s cache + block time), so it's shown as CONFIRMING from the local cache
  // — otherwise the tab looks empty right after the moment that celebrates it.
  const confirming = useMemo(() => {
    if (!address || !history) return [];
    const onChain = new Set(history.plays.map((p) => p.slug).filter(Boolean));
    return pickList.filter(([slug]) => !onChain.has(slug));
  }, [address, history, pickList]);

  const playCount = (history?.plays.length ?? 0) + confirming.length;

  return (
    <main
      className={`${theme === "dark" ? "app-dark" : "app-light"} mx-auto w-full min-w-0 min-h-dvh max-w-md bg-(--s-bg) pb-24 text-(--s-text) lg:max-w-none lg:pb-0`}
    >
      {/* Header — the only chrome that spans the full width at lg. Its 4rem
          height at lg is what the sticky rails offset against (lg:top-16). */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-(--s-line) bg-(--s-bg-blur) px-4 py-3 backdrop-blur lg:h-16 lg:px-6 lg:py-0">
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

      {/* ── Shell ─────────────────────────────────────────────────
          Below lg the tab bar shows one region at a time, exactly as before.
          At lg the tabs dissolve: every region is mounted and placed as a
          column — You left, Markets centre, Portfolio right — so balance and
          open picks stay visible while browsing. The centre column is the
          only one that grows; the rails are fixed so the feed never gets
          narrower than it is on a phone. */}
      <div className="lg:mx-auto lg:grid lg:w-full lg:max-w-[1440px] lg:grid-cols-[220px_minmax(0,1fr)_240px] lg:gap-4 lg:px-4 xl:grid-cols-[280px_minmax(0,1fr)_320px] xl:gap-6 xl:px-6">
        {/* ── Markets ───────────────────────────────────────────── */}
        <section
          className={`${tab === "markets" ? "block" : "hidden"} lg:col-start-2 lg:row-start-1 lg:block`}
        >
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
          {/* Faucet promo — hidden once claimed; a teaser while the pot is dry. */}
          {address && faucet && !faucet.claimed && (
            <div className="mx-4 mt-4 rounded-2xl border border-(--s-gold) bg-(--s-card) p-4">
              <p className="text-[15px] font-bold">
                {faucet.claimable
                  ? `Claim your free $${faucet.dripUsd.toFixed(2)}`
                  : "Free USDm drops are coming"}
              </p>
              <p className="mt-1 text-sm text-(--s-sub)">
                {faucet.claimable
                  ? "Real USDm, once per wallet, straight to your wallet. No strings."
                  : "One free claim per waitlisted wallet — we’ll light this up when your wallet is approved and the pot is filled."}
              </p>
              {faucet.claimable && (
                <button
                  onClick={doClaim}
                  disabled={txBusy === "claim"}
                  className="mt-3 w-full rounded-xl bg-(--s-act) py-3 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60"
                >
                  {txBusy === "claim" ? "Confirm in your wallet…" : "Claim it"}
                </button>
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
                        setInsight(null);
                        setInsightError(null);
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
        </section>

        {/* ── Portfolio ─────────────────────────────────────────── */}
        <section
          className={`${tab === "portfolio" ? "block" : "hidden"} px-4 py-5 lg:sticky lg:top-16 lg:col-start-3 lg:row-start-1 lg:block lg:max-h-[calc(100dvh-4rem)] lg:self-start lg:overflow-y-auto`}
        >
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
            {balance >= MIN_WITHDRAW && (
              <button
                onClick={() => setWithdraw(true)}
                className="mt-2 w-full rounded-xl border border-(--s-line) py-3 text-sm font-bold text-(--s-sub) active:scale-[0.98]"
              >
                Withdraw
              </button>
            )}
          </div>

          <h3 className="mb-2 text-sm font-semibold text-(--s-sub)">
            Your plays {playCount > 0 && `· ${playCount}`}
          </h3>

          {history && (history.totals.wins > 0 || history.totals.losses > 0 || history.totals.pending > 0) && (
            <div className="mb-2 flex gap-2 font-mono text-xs">
              <span className="rounded-full bg-(--s-gold-tint) px-2.5 py-1 font-bold text-(--s-gold)">
                {history.totals.xp} XP
              </span>
              <span className="rounded-full bg-(--s-card) px-2.5 py-1">
                <span className="font-bold text-(--s-win)">{history.totals.wins}W</span>
                {" · "}
                <span className="font-bold text-(--s-lose)">{history.totals.losses}L</span>
              </span>
              {history.totals.pending > 0 && (
                <span className="rounded-full bg-(--s-card) px-2.5 py-1 text-(--s-sub)">
                  {history.totals.pending} live
                </span>
              )}
            </div>
          )}

          {!address ? (
            <p className="rounded-2xl bg-(--s-card) p-4 text-sm text-(--s-sub)">
              Sign in to see every pick you&apos;ve made — your history lives on Celo, not on
              this device.
            </p>
          ) : playsState === "loading" && !history ? (
            <p className="rounded-2xl bg-(--s-card) p-4 text-sm text-(--s-sub)">
              Reading your picks off the chain…
            </p>
          ) : playsState === "error" && !history ? (
            <p className="rounded-2xl bg-(--s-card) p-4 text-sm text-(--s-sub)">
              Couldn&apos;t load your history — it&apos;s safe on-chain, try again shortly.
            </p>
          ) : playCount === 0 ? (
            <p className="rounded-2xl bg-(--s-card) p-4 text-sm text-(--s-sub)">
              No picks yet. Tap any market to lock in a free pick and start your streak.
            </p>
          ) : (
            <ul className="space-y-2">
              {confirming.map(([slug, p]) => (
                <li key={`pending-${slug}`} className="rounded-2xl bg-(--s-card) p-4 opacity-70">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-sm font-semibold leading-snug">{p.question}</p>
                    <Chip tone="sub">CONFIRMING</Chip>
                  </div>
                  <p className="mt-1 font-mono text-xs text-(--s-sub)">
                    <span className="font-bold text-(--s-gold)">⚡ {p.label}</span> at{" "}
                    {cents(p.price)}
                  </p>
                </li>
              ))}
              {(history?.plays ?? []).map((p) => (
                <PlayRow key={p.marketId} play={p} />
              ))}
            </ul>
          )}
        </section>

        {/* ── You ───────────────────────────────────────────────── */}
        <section
          className={`${tab === "you" ? "block" : "hidden"} px-4 py-5 lg:sticky lg:top-16 lg:col-start-1 lg:row-start-1 lg:block lg:max-h-[calc(100dvh-4rem)] lg:self-start lg:overflow-y-auto`}
        >
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

          {/* Three across on a phone; in the 220px rail they stack into
              number-and-label rows rather than squeezing to ~57px columns. */}
          <div className="mb-4 grid grid-cols-3 gap-2 lg:grid-cols-1">
            <div className="rounded-2xl bg-(--s-card) p-4 lg:flex lg:items-baseline lg:justify-between lg:gap-2 lg:p-3">
              <p className="font-mono text-2xl font-bold tabular-nums">
                {player?.pickCount ?? pickList.length}
              </p>
              <p className="text-xs text-(--s-sub)">picks on-chain</p>
            </div>
            <div className="rounded-2xl bg-(--s-card) p-4 lg:flex lg:items-baseline lg:justify-between lg:gap-2 lg:p-3">
              <p className="font-mono text-2xl font-bold tabular-nums">
                {player?.longestStreak ?? 0}
              </p>
              <p className="text-xs text-(--s-sub)">longest streak</p>
            </div>
            <div className="rounded-2xl bg-(--s-card) p-4 lg:flex lg:items-baseline lg:justify-between lg:gap-2 lg:p-3">
              <p className="font-mono text-2xl font-bold tabular-nums">
                {checkInDays ?? "—"}
              </p>
              <p className="text-xs text-(--s-sub)">days checked in</p>
            </div>
          </div>

          <Leaderboard address={address} />

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
              // Chain-scored, same as the Portfolio and the board. The local
              // cache is only the fallback for a player who isn't signed in.
              const results = Object.values(graded);
              setMoment({
                t: "recap",
                picks: history?.plays.length ?? pickList.length,
                wins: history?.totals.wins ?? results.filter((r) => r === "won").length,
                losses: history?.totals.losses ?? results.filter((r) => r === "lost").length,
                streak,
                longest: player?.longestStreak ?? 0,
                checkIns: checkInDays ?? player?.checkInCount ?? 0,
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
        </section>
      </div>

      {/* ── Bottom nav — a mobile affordance only; at lg the tabs it drives
          are all on screen at once, so it goes away. ─────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md border-t border-(--s-line) bg-(--s-bg-blur) backdrop-blur lg:hidden">
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
          className="fixed inset-0 z-20 flex items-end bg-black/50 lg:items-center lg:justify-center lg:p-6"
          onClick={() => setSheet(null)}
        >
          <div
            className={`${theme === "dark" ? "app-dark" : "app-light"} w-full rounded-t-3xl border-t border-(--s-line) bg-(--s-card) p-5 pb-8 text-(--s-text) lg:max-w-md lg:rounded-3xl lg:border lg:pb-5 lg:shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle — a sheet affordance; the lg modal isn't draggable. */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-(--s-line) lg:hidden" />
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

                {/* Ask Delta — paid meta-intelligence, straight off the live book. */}
                {insight ? (
                  <div className="mb-4 rounded-2xl border border-(--s-line) bg-(--s-bg) p-4 text-sm">
                    <p className="mb-2 font-bold">Δ Delta’s read</p>
                    {(() => {
                      const side = sheet.outcome === 0 ? insight.up : insight.down;
                      return (
                        <>
                          <div className="flex justify-between">
                            <span className="text-(--s-sub)">Spread on {sel.label}</span>
                            <span className="font-mono tabular-nums">
                              {side.spread !== null ? `${(side.spread * 100).toFixed(1)}¢` : "—"}
                            </span>
                          </div>
                          <div className="mt-1 flex justify-between">
                            <span className="text-(--s-sub)">Depth at the touch</span>
                            <span className="font-mono tabular-nums">${side.depth.askUsd.toFixed(0)}</span>
                          </div>
                          <div className="mt-1 flex justify-between">
                            <span className="text-(--s-sub)">Market’s vig (both asks − $1)</span>
                            <span className="font-mono tabular-nums">
                              {insight.noArb ? `${(-insight.noArb.edge * 100).toFixed(1)}¢` : "—"}
                            </span>
                          </div>
                          <div className="mt-1 flex justify-between">
                            <span className="text-(--s-sub)">Implied probability</span>
                            <span className="font-mono tabular-nums">
                              {insight.impliedProb !== null ? pct(insight.impliedProb) : "—"}
                            </span>
                          </div>
                          {insight.sla && (
                            <p className="mt-2 text-xs text-(--s-sub) opacity-80">
                              ⓘ price-protected: bet now and fill worse than quoted → your 1¢ back
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <button
                    className="mb-4 w-full rounded-xl border border-(--s-line) py-2.5 text-sm font-bold text-(--s-sub) active:scale-[0.98] disabled:opacity-60"
                    disabled={insightBusy}
                    onClick={() => doAskDelta(sheet.market)}
                  >
                    {insightBusy ? "Asking Delta…" : "Ask Delta · 1¢"}
                  </button>
                )}
                {insightError && (
                  <p className="mb-2 text-center text-xs text-(--s-lose)">{insightError}</p>
                )}

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
          className="fixed inset-0 z-20 flex items-end bg-black/50 lg:items-center lg:justify-center lg:p-6"
          onClick={() => setTopUp(false)}
        >
          <div
            className={`${theme === "dark" ? "app-dark" : "app-light"} w-full rounded-t-3xl border-t border-(--s-line) bg-(--s-card) p-5 pb-8 text-(--s-text) lg:max-w-md lg:rounded-3xl lg:border lg:pb-5 lg:shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle — a sheet affordance; the lg modal isn't draggable. */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-(--s-line) lg:hidden" />
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

            <ol className="mb-2 space-y-1.5 text-sm text-(--s-sub)">
              <li>1 · You confirm in MiniPay — we never touch your wallet</li>
              <li>2 · Your money crosses to Polymarket (~2 min, tracked live)</li>
              <li>3 · Withdrawals return to this wallet only — always</li>
            </ol>
            <p className="mb-4 text-xs leading-relaxed text-(--s-sub)">
              Only top up here in the app — never send USDm directly to the
              contract address. A direct transfer can&apos;t be credited to you.
            </p>

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

      {/* ── Withdraw sheet ────────────────────────────────────── */}
      {withdraw && (
        <div
          className="fixed inset-0 z-20 flex items-end bg-black/50 lg:items-center lg:justify-center lg:p-6"
          onClick={() => setWithdraw(false)}
        >
          <div
            className={`${theme === "dark" ? "app-dark" : "app-light"} w-full rounded-t-3xl border-t border-(--s-line) bg-(--s-card) p-5 pb-8 text-(--s-text) lg:max-w-md lg:rounded-3xl lg:border lg:pb-5 lg:shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle — a sheet affordance; the lg modal isn't draggable. */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-(--s-line) lg:hidden" />
            <h3 className="mb-1 text-xl font-bold">Withdraw USDm</h3>
            <p className="mb-4 text-sm leading-relaxed text-(--s-sub)">
              Straight back to this wallet — the same one it came from. Any
              amount from ${MIN_WITHDRAW}, up to ${balance.toFixed(2)}.
            </p>

            <div className="mb-3 flex items-center gap-2 rounded-2xl bg-(--s-bg) p-4">
              <span className="font-mono text-2xl font-bold text-(--s-sub)">$</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={balance.toFixed(2)}
                value={withdrawUsd}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d*\.?\d{0,2}$/.test(v)) setWithdrawUsd(v);
                }}
                className="w-full bg-transparent font-mono text-2xl font-bold tabular-nums outline-none placeholder:text-(--s-sub) placeholder:opacity-50"
              />
            </div>

            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setWithdrawUsd(balance.toFixed(2))}
                className={`flex-1 rounded-xl border py-2 font-mono text-sm font-bold ${
                  withdrawUsd === balance.toFixed(2)
                    ? "border-(--s-act) bg-(--s-act-tint) text-(--s-act-soft)"
                    : "border-(--s-line) text-(--s-sub)"
                }`}
              >
                Everything · ${balance.toFixed(2)}
              </button>
            </div>

            {txError && <p className="mb-2 text-center text-xs text-(--s-lose)">{txError}</p>}
            {(() => {
              const usd = parseFloat(withdrawUsd);
              const valid = Number.isFinite(usd) && usd >= MIN_WITHDRAW && usd <= balance;
              return (
                <button
                  className="w-full rounded-2xl bg-(--s-act) py-4 text-base font-bold text-white active:scale-[0.98] disabled:opacity-60"
                  disabled={!valid || txBusy === "withdraw"}
                  onClick={() => doWithdraw(usd)}
                >
                  {txBusy === "withdraw"
                    ? "Sending to your wallet…"
                    : valid
                      ? `Withdraw $${usd.toFixed(2)}`
                      : withdrawUsd && Number.isFinite(usd)
                        ? usd > balance
                          ? `Up to $${balance.toFixed(2)}`
                          : `Minimum $${MIN_WITHDRAW}`
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
