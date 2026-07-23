// Resolve picks against Polymarket.
//
// Source of truth is Gamma. `closed` is a strict filter, so asking for a batch
// of condition ids with closed=true *is* the resolution check: what comes back
// has settled, what doesn't is still running. No timeouts, no guessing.
import type { PickEvent } from "./events";
import { lookupMany } from "./registry";
import type { Graded } from "./xp";

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

// Gamma accepts repeated condition_ids; 50 per call is verified to return 50.
const BATCH = 50;

export type Resolution =
  | "won"
  | "lost"
  | "void" // settled with no winning side
  | "open" // not settled yet
  | "unknown"; // conditionId never recorded — ungradeable, not a loss

interface Settled {
  conditionId: string;
  prices: [number, number];
  clobTokenIds: [string, string];,
}

async function fetchSettled(conditionIds: string[]): Promise<Map<string, Settled>> {
  const out = new Map<string, Settled>();
  for (let i = 0; i < conditionIds.length; i += BATCH) {
    const chunk = conditionIds.slice(i, i + BATCH);
    const qs = chunk.map((c) => `condition_ids=${encodeURIComponent(c)}`).join("&");
    const res = await fetch(`${GAMMA}/markets?${qs}&closed=true`, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`gamma ${res.status}`);
    for (const m of (await res.json()) as Array<Record<string, string>>) {
      try {
        const prices = (JSON.parse(m.outcomePrices) as string[]).map(Number);
        const tokens = JSON.parse(m.clobTokenIds) as string[];
        if (prices.length !== 2 || tokens.length !== 2) continue;
        out.set(m.conditionId.toLowerCase(), {
          conditionId: m.conditionId.toLowerCase(),
          prices: [prices[0], prices[1]],
          clobTokenIds: [tokens[0], tokens[1]],
        });
      } catch {}
    }
  }
  return out;
}

/**
 * Read a settled market's outcome. Resolved markets normally collapse to
 * ["0","1"], but not always: a market that settled with no winner reports
 * ["0","0"] (seen live on will-joe-biden-get-coronavirus-before-the-election).
 * A plain `price > 0.5 ? won : lost` test would score that as a loss against
 * everyone who picked it, so the degenerate cases are caught first.
 */
export function readOutcome(prices: [number, number], outcome: 0 | 1): Resolution {
  const [a, b] = prices;
  if (a + b < 0.5) return "void"; // no winning side at all
  if (Math.abs(a - b) < 0.02) return "void"; // split down the middle
  return prices[outcome] > 0.5 ? "won" : "lost";
}

/** Price of the picked outcome at the minute it was picked. */
async function priceAtPick(tokenId: string, at: number): Promise<number | null> {
  const res = await fetch(
    `${CLOB}/prices-history?market=${tokenId}&startTs=${at - 300}&endTs=${at + 300}&fidelity=1`,
    { next: { revalidate: 86_400 } } // a past price never changes
  );
  if (!res.ok) return null;
  const history = ((await res.json()) as { history?: Array<{ t: number; p: number }> }).history;
  if (!history?.length) return null;
  // Closest sample to the pick, rather than assuming an ordering.
  return history.reduce((best, h) =>
    Math.abs(h.t - at) < Math.abs(best.t - at) ? h : best
  ).p;
}

/**
 * Attach a resolution (and the price it was taken at) to every pick.
 * Picks with no registry entry come back "unknown" — the conditionId behind
 * their marketId was never recorded, so they can't be graded and must never be
 * silently counted as losses.
 */
export async function grade(picks: PickEvent[]): Promise<Graded[]> {
  const registry = await lookupMany(picks.map((p) => p.marketId));

  const conditionIds = [...registry.values()]
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map((e) => e.conditionId.toLowerCase());
  const settled = conditionIds.length ? await fetchSettled(conditionIds) : new Map<string, Settled>();

  return Promise.all(
    picks.map(async (p): Promise<Graded> => {
      const entry = registry.get(p.marketId.toLowerCase());
      if (!entry) {
        return { ...p, resolution: "unknown", priceAtPick: null, conditionId: null, slug: null };
      }
      const found = { conditionId: entry.conditionId, slug: entry.slug };

      const s = settled.get(entry.conditionId.toLowerCase());
      if (!s) return { ...p, resolution: "open", priceAtPick: null, ...found };

      const resolution = readOutcome(s.prices, p.outcome);
      // Only winners need a price — it's what their XP is weighted by.
      const price = resolution === "won" ? await priceAtPick(s.clobTokenIds[p.outcome], p.at) : null;
      return { ...p, resolution, priceAtPick: price, ...found };
    })
  );
}
