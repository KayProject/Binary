// Shapes Binary's UI consumes. Raw Gamma responses are normalized into these —
// nothing downstream should ever touch Gamma's stringified-JSON fields.

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
