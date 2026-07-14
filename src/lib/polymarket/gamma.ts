import type { GammaMarket, Market } from "./types";

const GAMMA = "https://gamma-api.polymarket.com";

// Curation floor: markets a $2 bet can actually get in and out of without
// getting hurt. Tune once real usage data exists.
const MIN_LIQUIDITY = 10_000;
const MIN_VOLUME_24H = 1_000;
const MAX_SPREAD = 0.05;

function normalize(raw: GammaMarket): Market | null {
  let labels: string[], prices: string[], tokens: string[];
  try {
    labels = JSON.parse(raw.outcomes);
    prices = JSON.parse(raw.outcomePrices);
    tokens = JSON.parse(raw.clobTokenIds);
  } catch {
    return null;
  }
  if (labels.length !== 2 || prices.length !== 2 || tokens.length !== 2) return null; // binary only

  return {
    question: raw.question,
    slug: raw.slug,
    conditionId: raw.conditionId,
    outcomes: [
      { label: labels[0], price: parseFloat(prices[0]), clobTokenId: tokens[0] },
      { label: labels[1], price: parseFloat(prices[1]), clobTokenId: tokens[1] },
    ],
    negRisk: raw.negRisk ?? false,
    closed: raw.closed ?? false,
    volume24h: raw.volume24hr ?? 0,
    liquidity: typeof raw.liquidity === "string" ? parseFloat(raw.liquidity) : raw.liquidity ?? 0,
    endDate: raw.endDate ?? "",
    image: raw.image ?? null,
    bestBid: raw.bestBid ?? null,
    bestAsk: raw.bestAsk ?? null,
    spread: raw.spread ?? null,
    oneDayPriceChange: raw.oneDayPriceChange ?? null,
    feesEnabled: raw.feesEnabled ?? false,
    // takerBaseFee is what the CLOB actually charged in the live calibration
    // fill — feeSchedule.rate disagrees and loses (see fees.ts).
    feeRateBps: raw.feesEnabled ? raw.takerBaseFee ?? 0 : 0,
    feeExponent: raw.feeSchedule?.exponent ?? 1,
    tickSize: raw.orderPriceMinTickSize ?? 0.001,
  };
}

function tradeable(m: Market): boolean {
  return (
    m.liquidity >= MIN_LIQUIDITY &&
    m.volume24h >= MIN_VOLUME_24H &&
    (m.spread ?? 1) <= MAX_SPREAD &&
    m.outcomes.every((o) => o.price > 0.01 && o.price < 0.99)
  );
}

// App category tabs → Gamma tag ids. Filtering happens via tag_id +
// related_tags on the Gamma side; the curation floors above still gate every
// market, so tabs widen the feed without loosening what a $2 bettor sees.
// Ids verified live: sports/crypto/politics/pop-culture each return a healthy
// list that clears the floors.
export const CATEGORIES = ["all", "sports", "crypto", "politics", "culture"] as const;
export type Category = (typeof CATEGORIES)[number];

const TAG_IDS: Record<Exclude<Category, "all">, string> = {
  sports: "1",
  crypto: "21",
  politics: "2",
  culture: "596", // Gamma slug "pop-culture", labeled "Culture"
};

export async function fetchFeed(limit = 20, category: Category = "all"): Promise<Market[]> {
  // Over-fetch: curation drops a chunk of the raw list.
  const params = new URLSearchParams({
    closed: "false",
    active: "true",
    limit: String(limit * 3),
    order: "volume24hr",
    ascending: "false",
  });
  if (category !== "all") {
    params.set("tag_id", TAG_IDS[category]);
    params.set("related_tags", "true");
  }
  const res = await fetch(`${GAMMA}/markets?${params}`, {
    next: { revalidate: 30 }, // odds refresh cadence for the feed
  });
  if (!res.ok) throw new Error(`Gamma ${res.status}`);
  const raw: GammaMarket[] = await res.json();

  return raw
    .map(normalize)
    .filter((m): m is Market => m !== null && tradeable(m))
    .slice(0, limit);
}

export async function fetchMarket(slug: string): Promise<Market | null> {
  const res = await fetch(`${GAMMA}/markets?slug=${encodeURIComponent(slug)}`, {
    next: { revalidate: 10 }, // tighter on the detail view
  });
  if (!res.ok) throw new Error(`Gamma ${res.status}`);
  const raw: GammaMarket[] = await res.json();
  return raw.length ? normalize(raw[0]) : null;
}
