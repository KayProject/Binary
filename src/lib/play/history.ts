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

const createPlay = (graded: Graded, markets: Map<string, any>) => {
  const market = graded.conditionId ? markets.get(graded.conditionId.toLowerCase()) ?? null : null;
  const side = market?.outcomes[graded.outcome] ?? null;

  return {
    marketId: graded.marketId,
    conditionId: graded.conditionId,
    slug: graded.slug,
    question: market?.question ?? null,
    image: market?.image ?? null,
    outcome: graded.outcome,
    label: side?.label ?? null,
    resolution: graded.resolution,
    priceAtPick: graded.priceAtPick,
    currentPrice: graded.resolution === "open" && side ? side.price : null,
    xp: graded.resolution === "won" && graded.priceAtPick !== null ? pickXp(graded.priceAtPick) : 0,
    at: graded.at,
  };
};

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

  const plays = mine.map((p) => createPlay(p, markets)).sort((a, b) => b.at - a.at);

  return { totals, plays };
}
