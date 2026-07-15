"use client";

// Moment screens: full-screen takeovers for the things worth celebrating (or
// saying plainly). Sheets handle inputs; these fire AFTER something happens.
// Gold is reserved for wins/streaks — celebration moments go full gold-burst,
// results that aren't wins stay on the app surface and say it straight.

import { useEffect, useRef, useState } from "react";

export type Moment =
  | { t: "picked"; label: string; price: number; question: string; streak: number }
  | { t: "bet"; label: string; price: number; question: string; usd: number; win: number }
  | { t: "checkedin"; streak: number }
  | { t: "win"; label: string; question: string; wouldHavePaid: number }
  | { t: "loss"; label: string; question: string }
  | { t: "pending"; step: 1 | 2 | 3; usd?: number }
  | { t: "funded"; balance: number }
  | { t: "cashout"; amount: number }
  | {
      t: "recap";
      picks: number;
      wins: number;
      losses: number;
      streak: number;
      longest: number;
      checkIns: number;
    }
  | { t: "rankup"; rank: number }
  | { t: "share"; heading: string; line: string; text: string };

const BURST = new Set(["picked", "bet", "checkedin", "win", "funded", "cashout", "rankup"]);
const cents = (p: number) => `${(p * 100).toFixed(p < 0.1 || p > 0.9 ? 1 : 0)}¢`;

export function shareOrCopy(text: string): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && navigator.share) {
    return navigator
      .share({ text })
      .then(() => "shared" as const)
      .catch(() => "failed" as const);
  }
  return navigator.clipboard
    ?.writeText(text)
    .then(() => "copied" as const)
    .catch(() => "failed" as const) ?? Promise.resolve("failed" as const);
}

/** Animated $-count-up (skipped under prefers-reduced-motion). */
function useCountUp(target: number, ms = 900): number {
  const [value, setValue] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    // Reduced motion collapses the ramp to a single frame — same code path.
    const dur = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = dur === 0 ? 1 : Math.min((now - t0) / dur, 1);
      setValue(target * (1 - Math.pow(1 - k, 3))); // ease-out cubic
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return value;
}

function Particles() {
  // Deterministic scatter — no hydration mismatch, no Math.random.
  const spots = [
    [8, 18, 0], [22, 70, 0.4], [38, 30, 0.9], [55, 78, 0.2], [68, 22, 0.7],
    [82, 60, 1.1], [90, 32, 0.5], [15, 48, 1.3], [72, 45, 1.6], [45, 60, 1.9],
  ] as const;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {spots.map(([x, y, d], i) => (
        <span
          key={i}
          className="moment-particle text-lg"
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }}
        >
          {i % 3 === 0 ? "✦" : i % 3 === 1 ? "•" : "✧"}
        </span>
      ))}
    </div>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return (
    <p className="moment-pop text-center text-4xl font-black italic tracking-tight">{children}</p>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-(--m-chip) px-4 py-1.5 font-mono text-sm font-bold">
      {children}
    </span>
  );
}

export interface MomentHandlers {
  onClose: () => void;
  onShare: (heading: string, line: string, text: string) => void;
  onGoBet: () => void; // close + land on markets, ready to bet
}

export function MomentScreen({
  moment,
  themeClass,
  handlers,
}: {
  moment: Moment;
  themeClass: string;
  handlers: MomentHandlers;
}) {
  const { onClose, onShare, onGoBet } = handlers;
  const burst = BURST.has(moment.t);
  const [copied, setCopied] = useState(false);

  // One visual system, two grounds: burst screens repoint the local --m-*
  // slots at the burst tokens; quiet screens keep the app surface.
  const ground = burst
    ? "moment-burst-bg [--m-text:var(--s-burst-text)] [--m-sub:var(--s-burst-sub)] [--m-chip:var(--s-burst-chip)]"
    : "bg-(--s-bg) [--m-text:var(--s-text)] [--m-sub:var(--s-sub)] [--m-chip:var(--s-card)]";

  const primaryBtn = burst
    ? "w-full rounded-2xl bg-(--m-text) py-4 text-base font-bold text-(--s-burst-a) active:scale-[0.98]"
    : "w-full rounded-2xl bg-(--s-act) py-4 text-base font-bold text-white active:scale-[0.98]";
  const ghostBtn = "w-full py-3 text-center text-sm font-semibold text-(--m-sub)";

  const shareBtn = (heading: string, line: string, text: string, label = "Share") => (
    <button className={primaryBtn} onClick={() => onShare(heading, line, text)}>
      {label}
    </button>
  );

  return (
    // Full-bleed on a phone, where a takeover IS the screen. At lg it becomes
    // a centred card on a dimmed backdrop — a burst gradient stretched across
    // a 1440px desktop reads as a broken page, not a celebration.
    <div className="fixed inset-0 z-30 flex flex-col lg:items-center lg:justify-center lg:bg-black/60 lg:p-6">
      <div
        className={`${themeClass} moment-rise relative mx-auto flex w-full max-w-md flex-1 flex-col ${ground} text-(--m-text) lg:h-[640px] lg:max-h-full lg:flex-none lg:overflow-hidden lg:rounded-3xl lg:shadow-2xl`}
      >
        {burst && <Particles />}
        <div className="flex justify-end p-4">
          <button
            aria-label="Close"
            onClick={onClose}
            className="rounded-full bg-(--m-chip) px-3 py-1 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-8">
          {moment.t === "picked" && (
            <>
              <Headline>LOCKED ⚡</Headline>
              <p className="text-center text-sm text-(--m-sub)">{moment.question}</p>
              <Chip>
                {moment.label} · {cents(moment.price)}
              </Chip>
              {moment.streak > 0 && <p className="font-mono text-sm">🔥 Streak: {moment.streak}</p>}
              <div className="mt-6 w-full space-y-1">
                {shareBtn(
                  "My pick",
                  `${moment.label} on “${moment.question}”`,
                  `I'm calling ${moment.label} at ${cents(moment.price)} on “${moment.question}” — binary-io.vercel.app`,
                  "Share my pick"
                )}
                <button className={ghostBtn} onClick={onClose}>
                  Back to markets
                </button>
              </div>
            </>
          )}

          {moment.t === "bet" && (
            <>
              <Headline>BET PLACED</Headline>
              <p className="text-center text-sm text-(--m-sub)">{moment.question}</p>
              <Chip>
                ${moment.usd} on {moment.label} · {cents(moment.price)}
              </Chip>
              <p className="font-mono text-lg font-bold">
                Pays ${moment.win.toFixed(2)} if you&apos;re right
              </p>
              <div className="mt-6 w-full space-y-1">
                {shareBtn(
                  "My bet",
                  `$${moment.usd} on ${moment.label}`,
                  `Real money on ${moment.label} at ${cents(moment.price)} — “${moment.question}”. binary-io.vercel.app`,
                  "Share my bet"
                )}
                <button className={ghostBtn} onClick={onClose}>
                  Done
                </button>
              </div>
            </>
          )}

          {moment.t === "checkedin" && (
            <>
              <p className="moment-pop text-7xl">🔥</p>
              <Headline>DAY {moment.streak}</Headline>
              <p className="text-center text-sm text-(--m-sub)">
                {moment.streak >= 30
                  ? "A full month. You don't miss."
                  : moment.streak >= 7
                    ? "One week straight — you're on fire."
                    : moment.streak >= 3
                      ? "Three days running. Keep it alive."
                      : "Streak started. Come back tomorrow."}
              </p>
              <div className="mt-6 w-full space-y-1">
                {shareBtn(
                  "My streak",
                  `${moment.streak}-day streak`,
                  `🔥 ${moment.streak}-day streak calling markets on Binary — binary-io.vercel.app`,
                  "Share my streak"
                )}
                <button className={ghostBtn} onClick={onClose}>
                  Back
                </button>
              </div>
            </>
          )}

          {moment.t === "win" && (
            <>
              <Headline>YOU CALLED IT</Headline>
              <p className="text-center text-sm text-(--m-sub)">{moment.question}</p>
              <Chip>{moment.label} ✓</Chip>
              <p className="text-center font-mono text-sm text-(--m-sub)">
                A $2 bet would&apos;ve paid{" "}
                <span className="font-bold text-(--m-text)">${moment.wouldHavePaid.toFixed(2)}</span>
              </p>
              <div className="mt-6 w-full space-y-1">
                {shareBtn(
                  "Called it",
                  `${moment.label} on “${moment.question}”`,
                  `Called it: ${moment.label} on “${moment.question}” ✓ — binary-io.vercel.app`,
                  "Share the call"
                )}
                <button className={ghostBtn} onClick={onGoBet}>
                  Bet real money on the next one
                </button>
              </div>
            </>
          )}

          {moment.t === "loss" && (
            <>
              <p className="text-center text-2xl font-black italic">Not this one.</p>
              <p className="text-center text-sm text-(--m-sub)">{moment.question}</p>
              <Chip>{moment.label} ✕</Chip>
              <p className="text-center text-sm text-(--m-sub)">
                The market went the other way. Your streak doesn&apos;t care — it counts showing up.
              </p>
              <div className="mt-6 w-full space-y-1">
                <button className={primaryBtn} onClick={onGoBet}>
                  Next market →
                </button>
                <button className={ghostBtn} onClick={onClose}>
                  Close
                </button>
              </div>
            </>
          )}

          {moment.t === "pending" && (
            <>
              <p className="text-center text-2xl font-black italic">
                Giving you your betting power…
              </p>
              {moment.usd !== undefined && (
                <Chip>${moment.usd.toFixed(2)} on its way</Chip>
              )}
              <ol className="mt-2 w-full space-y-3">
                {(
                  [
                    ["USDm sent", 1],
                    ["Confirming on Celo", 2],
                    ["Crossing to Polymarket (~2 min)", 3],
                  ] as const
                ).map(([label, step]) => {
                  const done = moment.step > step;
                  const active = moment.step === step;
                  return (
                    <li
                      key={step}
                      className={`flex items-center gap-3 rounded-2xl bg-(--m-chip) p-4 text-sm font-semibold ${
                        active ? "moment-step-active" : done ? "" : "opacity-40"
                      }`}
                    >
                      <span className="font-mono text-base">{done ? "✓" : active ? "●" : "○"}</span>
                      {label}
                    </li>
                  );
                })}
              </ol>
              <p className="text-center text-xs text-(--m-sub)">
                Usually about 2 minutes. Safe to close and keep browsing — we&apos;ll light it up
                the moment it lands, and money only ever returns to this wallet.
              </p>
              <div className="mt-4 w-full">
                <button className={ghostBtn} onClick={onClose}>
                  Close
                </button>
              </div>
            </>
          )}

          {moment.t === "funded" && <FundedBody balance={moment.balance} goBet={onGoBet} close={onClose} primaryBtn={primaryBtn} ghostBtn={ghostBtn} />}

          {moment.t === "cashout" && (
            <CashoutBody amount={moment.amount} close={onClose} primaryBtn={primaryBtn} ghostBtn={ghostBtn} />
          )}

          {moment.t === "recap" && (
            <>
              <p className="text-center text-2xl font-black italic">Your week on Binary</p>
              <div className="grid w-full grid-cols-2 gap-2">
                {(
                  [
                    [`${moment.wins}–${moment.losses}`, "record on graded picks"],
                    [String(moment.picks), "picks locked"],
                    [`🔥 ${moment.streak}`, "current streak"],
                    [String(moment.longest), "longest streak"],
                  ] as const
                ).map(([big, small]) => (
                  <div key={small} className="rounded-2xl bg-(--m-chip) p-4">
                    <p className="font-mono text-2xl font-bold tabular-nums text-(--s-gold)">{big}</p>
                    <p className="text-xs text-(--m-sub)">{small}</p>
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-(--m-sub)">{moment.checkIns} check-ins all-time</p>
              <div className="mt-4 w-full space-y-1">
                {shareBtn(
                  "My week",
                  `${moment.wins}–${moment.losses} this week`,
                  `My week on Binary: ${moment.wins}–${moment.losses} on graded picks, 🔥 ${moment.streak}-day streak — binary-io.vercel.app`,
                  "Share my week"
                )}
                <button className={ghostBtn} onClick={onClose}>
                  Close
                </button>
              </div>
            </>
          )}

          {moment.t === "rankup" && (
            <>
              <Headline>#{moment.rank}</Headline>
              <p className="text-center text-sm text-(--m-sub)">
                You broke into the top {moment.rank <= 10 ? 10 : 100} on the leaderboard.
              </p>
              <div className="mt-6 w-full space-y-1">
                {shareBtn(
                  "Rank up",
                  `#${moment.rank} on Binary`,
                  `Just hit #${moment.rank} on the Binary leaderboard — binary-io.vercel.app`,
                  "Share it"
                )}
                <button className={ghostBtn} onClick={onClose}>
                  Back
                </button>
              </div>
            </>
          )}

          {moment.t === "share" && (
            <>
              <div className="w-full rounded-3xl border border-(--s-gold-line) bg-(--s-card) p-6 text-(--s-text)">
                <p className="text-xl font-black italic tracking-tight">
                  BI<span className="text-(--s-act-soft)">NARY</span>
                </p>
                <p className="mt-4 text-lg font-bold leading-snug">{moment.heading}</p>
                <p className="mt-1 font-mono text-sm text-(--s-gold)">{moment.line}</p>
                <p className="mt-4 text-xs text-(--s-sub)">binary-io.vercel.app</p>
              </div>
              <div className="mt-4 w-full space-y-1">
                <button
                  className={primaryBtn}
                  onClick={() =>
                    shareOrCopy(moment.text).then((r) => {
                      if (r === "copied") {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }
                    })
                  }
                >
                  {copied ? "Copied ✓" : "Share"}
                </button>
                <button className={ghostBtn} onClick={onClose}>
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FundedBody({
  balance,
  goBet,
  close,
  primaryBtn,
  ghostBtn,
}: {
  balance: number;
  goBet: () => void;
  close: () => void;
  primaryBtn: string;
  ghostBtn: string;
}) {
  const shown = useCountUp(balance);
  return (
    <>
      <Headline>MONEY&apos;S IN</Headline>
      <p className="font-mono text-5xl font-black tabular-nums">${shown.toFixed(2)}</p>
      <p className="text-center text-sm text-(--m-sub)">
        Your balance is live. Every bet is a real order in Polymarket&apos;s book.
      </p>
      <div className="mt-6 w-full space-y-1">
        <button className={primaryBtn} onClick={goBet}>
          Place your first bet
        </button>
        <button className={ghostBtn} onClick={close}>
          Later
        </button>
      </div>
    </>
  );
}

function CashoutBody({
  amount,
  close,
  primaryBtn,
  ghostBtn,
}: {
  amount: number;
  close: () => void;
  primaryBtn: string;
  ghostBtn: string;
}) {
  const shown = useCountUp(amount);
  return (
    <>
      <Headline>PAID OUT</Headline>
      <p className="font-mono text-5xl font-black tabular-nums">${shown.toFixed(2)}</p>
      <p className="text-center text-sm text-(--m-sub)">
        USDm is back in your wallet — the same one it came from. Always.
      </p>
      <div className="mt-6 w-full space-y-1">
        <button className={primaryBtn} onClick={close}>
          Done
        </button>
        <button className={ghostBtn} onClick={close}>
          Close
        </button>
      </div>
    </>
  );
}
