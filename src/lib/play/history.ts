// One player's history, rebuilt from their on-chain picks.
//
// Sits next to xp.ts on purpose: xp.ts answers "how does everyone rank", this
// answers "what did I do", and both read the same graded scan (board.ts) and
// score with the same score(). A player's XP here and their XP on the board are
// therefore the same number by construction.
import { fetchByConditionIds } from "@/lib/polymarket/gamma";
import type { Board } from "./board";
import type { Resolution } from "./grade";
import { latestPicks, pickXp, score, type Graded, type Row } from "./xp";

export interface Play {
  marketId: string;
  conditionId: string | null; // null = never registered, so ungradeable forever
  slug: string | null;
  question: string | null; // null when the market can't be resolved back
  image: string | null;
  outcome: 0 | 1;
  label: string | null;
  resolution: Resolution;
  priceAtPick: number | null; // winners only — it's what XP is weighted by
  currentPrice: number | null; // my side's live price, while still running
  xp: number;
  at: number;
}

export type Totals = Omit<Row, "user">;

export interface History {
  totals: Totals;
  plays: Play[];
}

const EMPTY: Totals = { xp: 0, checkInDays: 0, wins: 0, losses: 0, pending: 0, ungraded: 0 };

export async function historyFor(address: string, { checkIns, graded }: Board): Promise<History> {
  const user = address.toLowerCase();

  // latestPicks mirrors the contract's last-write-wins, so a player who changed
  // their mind sees the pick that actually counts — one row, not two.
  const mine = latestPicks(graded.filter((p) => p.user === user)) as Graded[];
  const myCheckIns = checkIns.filter((c) => c.user === user);

  // score() returns one row per user, and ours is the only one it can find.
  const row = score(myCheckIns, mine)[0];
  const totals: Totals = row
    ? {
        xp: row.xp,
        checkInDays: row.checkInDays,
        wins: row.wins,
        losses: row.losses,
        pending: row.pending,
        ungraded: row.ungraded,
      }
    : EMPTY;

  // marketId is keccak(conditionId) and one-way, so the question a pick was
  // about is only recoverable through the registry written at pick time. That
  // lookup already happened during grading, and its result is what resolution
  // means — so it's read off the pick rather than repeated here.
  const conditionIds = mine.flatMap((p) => (p.conditionId ? [p.conditionId] : []));
  const markets = conditionIds.length ? await fetchByConditionIds(conditionIds) : new Map();

  const plays = mine
    .map((p): Play => {
      const market = p.conditionId ? markets.get(p.conditionId.toLowerCase()) ?? null : null;
      const side = market?.outcomes[p.outcome] ?? null;

      return {
        marketId: p.marketId,
        conditionId: p.conditionId,
        slug: p.slug,
        question: market?.question ?? null,
        image: market?.image ?? null,
        outcome: p.outcome,
        label: side?.label ?? null,
        resolution: p.resolution,
        priceAtPick: p.priceAtPick,
        // A settled market's price collapses to 1 or 0, which would read as
        // odds — only show it while the pick still has something to say.
        currentPrice: p.resolution === "open" && side ? side.price : null,
        xp: p.resolution === "won" && p.priceAtPick !== null ? pickXp(p.priceAtPick) : 0,
        at: p.at,
      };
    })
    .sort((a, b) => b.at - a.at);

  return { totals, plays };
}
