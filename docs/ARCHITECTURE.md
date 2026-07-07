# Binary — Technical Architecture

Mobile-first prediction market interface. Users deposit and think entirely in **USDm**
(Mento Dollar, Celo); liquidity and settlement come from **Polymarket** on Polygon.
Binary owns the UX; Polymarket owns the markets.

## Product model

- Every market is a binary question. YES/NO shares price 0–100¢; winners redeem at $1.
- Prices, positions, and P&L are displayed in USDm. The user never sees Polygon,
  USDC, bridges, or gas.
- v1 accepts bridge latency: **funding is async, betting is instant from a settled
  balance.** The two flows are never merged in the UI.

## Money flow

```
Deposit:
  USDm (user, Celo)
    → swap USDm→USDC on Celo (Mento/Uniswap)
    → bridge USDC Celo→Polygon (CCTP preferred; see Open verifications)
    → user's embedded Polygon wallet (Privy)
    → allowance set on Polymarket exchange contracts

Trade:
  app builds order → user's embedded wallet signs (EOA signature)
    → Polymarket CLOB API → on-chain settlement by their operator

Cash out / resolution:
  sell via CLOB (or redeem winning shares after resolution)
    → USDC in user's Polygon wallet
    → bridge Polygon→Celo → swap USDC→USDm → user's Celo wallet
```

## Components

| Component | Responsibility | Stack |
|---|---|---|
| Mobile web app (PWA) | Market feed, tap YES/NO, positions, deposit/withdraw | Next.js, TypeScript, Tailwind |
| Wallet layer | Embedded EOA per user on Celo + Polygon; client-side signing | Privy |
| Delegated signer | Server-side signing for flows where the user is absent: sweeping bridged deposits, redeeming resolved positions | Privy server-delegated actions |
| Bridge pipeline | Per-user swap + bridge orchestration, retries, status tracking | Node service |
| Market service | Curated market list, price cache, order routing | Node service + Polymarket CLOB API |
| Relayer | Sponsored gas for on-chain actions on Polygon (approvals, redemptions) | Gelato/Biconomy (EOA relay, **not** 4337 — CLOB requires EOA/proxy signatures) |
| Rate oracle | Live USDm/USDC quote for display + deposit/withdraw conversion | Mento SDK |

## Accounting rules

1. **Ledger source of truth is USDC**: on-chain balances + Polymarket positions.
   USDm is a render-time skin. Balances are never stored in USDm.
2. USDm/USDC conversion is quoted live at deposit and withdrawal; never hardcoded 1:1.
   Spread is surfaced as a single "conversion fee" line.
3. One-tap bets are market orders with a slippage cap; partial fills are surfaced
   in the position, not hidden.

## Custody model

Non-custodial at rest: funds and positions live in each user's own embedded wallet.
Binary's servers hold no user funds in v1. Delegated signing is scoped and consented
to at onboarding (sweep-on-arrival, redeem-on-resolution only).

## Build order

**Phase 0 — walking skeleton (blocks everything).** One wallet, scripts only, no UI:
deposit USDm → swap → bridge → place a real small order via CLOB API → sell →
withdraw to Celo. Record fixed costs per round trip; set the v1 minimum deposit
from the real number.

**Phase 1 — v1 product.** Privy onboarding, curated market feed, tap-to-bet,
positions, async deposit/withdraw with honest status states, delegated
sweep + redemption.

**Phase 2+ — see Future versions.**

## Open verifications (Phase 0 exit criteria)

- [ ] CLOB API accepts orders from arbitrary EOAs (credential derivation, geo,
      min order size, tick rules) — read API ToS; check the builder program for
      blessed access / order attribution.
- [ ] CCTP supports Celo→Polygon. If not: pick a third-party route and reassess
      wrapped-asset risk.
- [ ] Real per-deposit round-trip cost (swap + bridge + sponsored gas) → minimum
      deposit floor.
- [ ] Privy delegated signing covers the sweep + redeem flows.

## Risks

| Risk | Position |
|---|---|
| Polymarket revokes API access / geoblocks | No contract with them. Mitigate via builder program; accept as v1 platform risk. |
| USDm peg drift | Rate oracle + dynamic conversion quote; never 1:1 hardcode. |
| Thin books on long-tail markets | Curate liquid markets only in v1; slippage caps. |
| Nigerian gambling/betting regulation | Open business question; tracked, not a v1 blocker. |
| Bridge downtime | Deposits queue with visible status; no funds at risk (per-user, no float). |

## Future versions

- **Float + batching**: pre-funded Polygon/Celo working wallets front deposits and
  withdrawals for instant UX; bridging becomes a batched treasury rebalance instead
  of per-user transfers. Cuts per-deposit fixed costs and removes latency from UX.
  Requires treasury ops: monitoring, alerts, rebalancer.
- Limit orders and full order-book UI.
- Full Polymarket catalog browsing (v1 is a curated feed).
- User market discovery/watchlists, streaks, shareable win cards.
- In-app USDm on-ramp via MiniPay deep links.
