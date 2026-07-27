// XP rules. Pure functions over already-fetched data — no network, no chain,
// so the scoring can be reasoned about and tested on its own.
//
// Two rules exist because the contract deliberately doesn't enforce them:
//
//  1. checkIn() "never reverts on repeats" — a same-day call still emits. The
//     live data is 704 CheckedIn events from 22 distinct user-days, so counting
//     events would inflate XP ~32x and hand the board to whoever taps fastest.
//     Score distinct (user, day); the day is an indexed topic, so it's free.
//  2. pick() overwrites: "last write wins until the market closes". Counting
//     every Picked event would pay a user for changing their mind, so only the
//     latest pick per (user, market) scores — matching on-chain pickOf.
import type { CheckIn, PickEvent } from "./events";
import type { Resolution } from "./grade";

export const CHECKIN_XP = 5;

// Odds-weighted, on a notional flat stake: calling a 39c long shot that lands
// pays more than a 95c favourite that lands. Same shape as payoutIfWin on the
// bet sheet, so the number means the same thing in both places, and it's the
// honest bridge to real money. The cap stops a sub-cent lottery ticket from
// dwarfing a season of good calls.
export const MAX_PICK_XP = 200;

export function pickXp(priceAtPick: number): number {
  if (!(priceAtPick > 0)) return 0;
  return Math.min(Math.round(10 / priceAtPick), MAX_PICK_XP);
}

/** Latest pick per (user, market) — mirrors the contract's last-write-wins. */
export function latestPicks(picks: PickEvent[]): PickEvent[] {
  const byKey = new Map<string, PickEvent>();
  for (const p of picks) {
    const key = `${p.user}:${p.marketId}`;
    const prev = byKey.get(key);
    if (!prev || p.block >= prev.block) byKey.set(key, p);
  }
  return [...byKey.values()];
}

/** Distinct (user, day) pairs — same-day repeats collapse to one. */
export function distinctCheckInDays(checkIns: CheckIn[]): Map<string, Set<number>> {
  const byUser = new Map<string, Set<number>>();
  for (const c of checkIns) {
    const days = byUser.get(c.user) ?? new Set<number>();
    days.add(c.day);
    byUser.set(c.user, days);
  }
  return byUser;
}

export interface Row {
  user: `0x${string}`;
  xp: number;
  checkInDays: number;
  wins: number;
  losses: number;
  pending: number; // market hasn't resolved yet
  ungraded: number; // no registry entry — conditionId was never recorded
}

export interface Graded extends PickEvent {
  resolution: Resolution;
  priceAtPick: number | null;
  // The registry entry grading actually used. Carried rather than looked up
  // again by callers: resolution is *derived* from this lookup, so a second,
  // independent lookup can disagree with it — and "unknown" (no entry) next to
  // a question title (entry found) is a contradiction a reader can see.
  conditionId: string | null;
  slug: string | null;
}

/**
 * Score a window. `from`/`to` are unix seconds; a pick counts if it happened
 * inside the window, and a check-in day counts if that UTC day falls in it.
 * Void resolutions score nothing either way — the market never had an answer,
 * so neither crediting nor penalising it is defensible.
 */
export function score(
  checkIns: CheckIn[],
  graded: Graded[],
  window?: { from: number; to: number }
): Row[] {
  const inWindow = (at: number) => !window || (at >= window.from && at < window.to);
  const dayInWindow = (day: number) => inWindow(day * 86_400);

  const rows = new Map<`0x${string}`, Row>();
  const row = (user: `0x${string}`) => {
    let r = rows.get(user);
    if (!r) {
      r = { user, xp: 0, checkInDays: 0, wins: 0, losses: 0, pending: 0, ungraded: 0 };
      rows.set(user, r);
    }
    return r;
  };

  for (const [user, days] of distinctCheckInDays(checkIns)) {
    const counted = [...days].filter(dayInWindow).length;
    if (counted === 0) continue;
    const r = row(user as `0x${string}`);
    r.checkInDays = counted;
    r.xp += counted * CHECKIN_XP;
  }

  for (const p of latestPicks(graded) as Graded[]) {
    if (!inWindow(p.at)) continue;
    const r = row(p.user);
    switch (p.resolution) {
      case "won":
        r.wins += 1;
        r.xp += p.priceAtPick === null ? 0 : pickXp(p.priceAtPick);
        break;
      case "lost":
        r.losses += 1;
        break;
      case "void":
        break;
      case "open":
        r.pending += 1;
        break;
      case "unknown":
        r.ungraded += 1;
        break;
    }
  }

  return [...rows.values()].sort((a, b) => b.xp - a.xp || b.wins - a.wins || a.user.localeCompare(b.user));
}

/** Start of the current weekly window: Monday 00:00 UTC. */
export function weekStart(now = Date.now()): number {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // Mon = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) / 1000;
}
