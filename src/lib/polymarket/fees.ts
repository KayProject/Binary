// Polymarket CLOB trading-fee math, calibrated against a real fill
// (2026-07-13, France-WC market: sell 2.570693 shares @ 0.388, fee $0.06105).
//
//   fee = (feeRateBps / 10_000) × (p · (1 − p))^exponent × shares
//
// The measured fill matches feeRateBps = Gamma's `takerBaseFee` (1000 → 10%),
// NOT feeSchedule.rate — trust the money, not the metadata. Two more facts
// from the live run that shape the previews:
//   - BUYS are not charged: $1 at ask 0.389 delivered exactly 1/0.389 shares.
//   - Redemption at resolution pays $1/share with no trading fee.
// So "you win" (hold to resolution) is shares × $1; the fee only bites when
// cashing out early via a sell.

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
  const gross = price * shares;
  return gross - (m.feesEnabled ? takerFee(price, shares, m.feeRateBps, m.feeExponent) : 0);
}
