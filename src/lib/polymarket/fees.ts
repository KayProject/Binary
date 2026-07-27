import type { Market } from "./types";

/** Shares received for a $ amount bought at `price` (buys are fee-free). */
export function sharesFor(amount: number, price: number): number {
  if (price <= 0 || price >= 1) return 0;
  return amount / price;
}

/** Taker fee in $ for trading `shares` at `price`. */
export function takerFee(
  price: number,
  shares: number,
  feeRateBps: number,
  exponent = 1
): number {
  if (feeRateBps <= 0 || shares <= 0) return 0;
  return (feeRateBps / 10_000) * Math.pow(price * (1 - price), exponent) * shares;
}

/** $ payout if the position is held to resolution and wins. No fee. */
export function payoutIfWin(amount: number, price: number): number {
  return sharesFor(amount, price);
}

/** Net $ received for selling `shares` at `price` right now. */
export function cashOutNet(price: number, shares: number, m: Market): number {
  if (!m.feesEnabled) return price * shares;
  const fee = takerFee(price, shares, m.feeRateBps, m.feeExponent);
  return price * shares - fee;
}