export interface MarketOutcome {
  label: string; // "Yes" / "No" (or team names on some markets)
  price: number; // 0..1 — also the implied probability
  clobTokenId: string; // token to trade via the CLOB
}

export interface Market {
  question: string;
  slug: string;
  conditionId: string;
  outcomes: [MarketOutcome, MarketOutcome];
  negRisk: boolean;
  closed: boolean; // resolved — outcome prices have collapsed to 0/1
  volume24h: number;
  liquidity: number;
  endDate: string; // ISO
  image: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  oneDayPriceChange: number | null;
  // Fee + order-book granularity (post-V2 the CLOB charges real trading fees;
  // payout previews must price them in — see lib/polymarket/fees.ts).
  feesEnabled: boolean;
  feeRateBps: number; // taker fee scalar, bps (0 when feesEnabled=false)
  feeExponent: number; // exponent on the p·(1−p) term
  tickSize: number; // orderPriceMinTickSize — 0.001, 0.0025, …
}

// Raw Gamma market — only the fields we read.
export interface GammaMarket {
  question: string;
  slug: string;
  conditionId: string;
  outcomes: string; // JSON-stringified string[]
  outcomePrices: string; // JSON-stringified string[]
  clobTokenIds: string; // JSON-stringified string[]
  negRisk?: boolean;
  volume24hr?: number;
  liquidity?: string | number;
  endDate?: string;
  image?: string;
  active?: boolean;
  closed?: boolean;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  oneDayPriceChange?: number;
  feesEnabled?: boolean;
  takerBaseFee?: number; // bps
  feeSchedule?: { exponent?: number; rate?: number; takerOnly?: boolean };
  orderPriceMinTickSize?: number;
}

function normalizeGammaMarket(gammaMarket: GammaMarket): Market {
  const outcomes = JSON.parse(gammaMarket.outcomes) as string[];
  const outcomePrices = JSON.parse(gammaMarket.outcomePrices) as string[];
  const clobTokenIds = JSON.parse(gammaMarket.clobTokenIds) as string[];

  return {
    question: gammaMarket.question,
    slug: gammaMarket.slug,
    conditionId: gammaMarket.conditionId,
    outcomes: [
      { label: outcomes[0], price: parseFloat(outcomePrices[0]), clobTokenId: clobTokenIds[0] },
      { label: outcomes[1], price: parseFloat(outcomePrices[1]), clobTokenId: clobTokenIds[1] }
    ],
    negRisk: gammaMarket.negRisk ?? false,
    closed: gammaMarket.closed ?? false,
    volume24h: gammaMarket.volume24hr ?? 0,
    liquidity: typeof gammaMarket.liquidity === 'string' ? parseFloat(gammaMarket.liquidity) : gammaMarket.liquidity,
    endDate: gammaMarket.endDate ?? '',
    image: gammaMarket.image ?? null,
    bestBid: gammaMarket.bestBid ?? null,
    bestAsk: gammaMarket.bestAsk ?? null,
    spread: gammaMarket.spread ?? null,
    oneDayPriceChange: gammaMarket.oneDayPriceChange ?? null,
    feesEnabled: gammaMarket.feesEnabled ?? false,
    feeRateBps: gammaMarket.takerBaseFee ?? 0,
    feeExponent: gammaMarket.feeSchedule?.exponent ?? 0,
    tickSize: gammaMarket.orderPriceMinTickSize ?? 0
  };
}
