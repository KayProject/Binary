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

Each user has their **own Polymarket proxy wallet** (a per-user smart-contract wallet
on Polygon), owned/controlled by their Privy embedded EOA. Non-custodial: Binary never
pools funds and never holds a master account. This is Polymarket's native model, not
something we invented.

```
Deposit:
  USDm (user, Celo)
    → swap USDm→USDC on Celo (Mento/Uniswap)
    → bridge USDC Celo→Polygon (CCTP; verified supported)
    → wrap USDC→pUSD on Polygon (1:1, contract-enforced)
    → user's own Polymarket proxy wallet (funder)
    → approvals set on CTF Exchange V2

Trade:
  app builds order → user's Privy EOA signs on behalf of their proxy
    (signature type 2 = Gnosis Safe; type 3 = POLY_1271 when client bug fixed)
    → Polymarket CLOB API → on-chain settlement by their operator

Cash out / resolution:
  sell via CLOB (or redeem winning shares after resolution)
    → pUSD in user's proxy → unwrap pUSD→USDC
    → bridge Polygon→Celo → swap USDC→USDm → user's Celo wallet
```

## Components

| Component | Responsibility | Stack |
|---|---|---|
| Mobile web app (PWA) | Market feed, tap YES/NO, positions, deposit/withdraw | Next.js, TypeScript, Tailwind |
| Wallet layer | Embedded EOA per user (Celo + Polygon) + a per-user Polymarket proxy (Gnosis Safe) it controls; client-side signing | Privy + Safe proxy factory |
| Delegated signer | Server-side signing for flows where the user is absent: sweeping bridged deposits, redeeming resolved positions | Privy server-delegated actions |
| Bridge pipeline | Per-user swap → CCTP bridge → pUSD wrap orchestration, retries, status tracking | Node service |
| Market service | Curated market list, price cache, order routing (builder attribution) | Node service + Polymarket CLOB API |
| Relayer | Trades are gasless via Polymarket's proxy relayer; own relayer only for Polygon-side approvals/wrap/redemptions | Gelato/Biconomy (proxy/EOA relay, **not** 4337) |
| Rate oracle | Live USDm/USDC quote for display + deposit/withdraw conversion | Mento SDK |

## Accounting rules

1. **Ledger source of truth is USDC**: on-chain balances + Polymarket positions.
   USDm is a render-time skin. Balances are never stored in USDm.
2. USDm/USDC conversion is quoted live at deposit and withdrawal; never hardcoded 1:1.
   Spread is surfaced as a single "conversion fee" line.
3. One-tap bets are market orders with a slippage cap; partial fills are surfaced
   in the position, not hidden.

## Custody model

**Non-custodial per-user, via Polymarket's native proxy wallets.** Each user gets their
own smart-contract wallet on Polygon (a Gnosis Safe / deposit wallet), controlled by
their own Privy embedded key. Funds and positions live there. Binary never pools funds,
never holds a master account, is never the counterparty. Omnibus (pooled/custodial) and
own-contract-fork (cold-start liquidity) are both explicitly **rejected**.

Delegated signing is scoped and consented to at onboarding (sweep-on-arrival,
redeem-on-resolution only) — it lets Binary act *for* the user's own wallet when they're
offline; it does not give Binary custody.

## Build order

**Phase 0 — walking skeleton (blocks everything).** Scripts only, no UI, one fresh test
user: create Privy EOA → deploy its Safe proxy via factory → fund (swap USDm→USDC →
CCTP bridge → wrap pUSD) → place a real ~$1 order (type 2, per `privy-safe-builder-example`)
→ sell → redeem/withdraw back to USDm on Celo. Record fixed costs per round trip; set the
v1 minimum deposit from the real number. Fallback if type-2 new-wallet orders are blocked:
patch type-3 client auth or engage Polymarket builder program.

**Phase 1 — v1 product.** Privy onboarding, curated market feed, tap-to-bet,
positions, async deposit/withdraw with honest status states, delegated
sweep + redemption.

**Phase 2+ — see Future versions.**

## Polymarket integration findings (2026-07-08)

- **Per-user proxy wallets are Polymarket's native model — this IS our non-custodial path.**
  Every Polymarket user has their own smart-contract wallet on Polygon (Gnosis Safe,
  type 2; or ERC-1967 deposit wallet, type 3), controlled by their own EOA. The Privy
  EOA signs orders on behalf of the proxy. Deployed via public factories
  (Safe proxy factory `0xaacfeea0…d20e3541b`; proxy-wallet factory `0xaB45c5A4…e1A254052`).
- **Plain EOA orders (type 0) were removed** in the Apr 28 2026 "V2 exchange upgrade" —
  `"maker address not allowed, please use the deposit wallet flow"`. Expected: the proxy
  wallet *is* the maker. Doesn't affect us; we were never going to use bare EOAs as makers.
- **Two proxy flavors, current state:**
  - **Type 2 (Gnosis Safe):** proven working; Polymarket's official `privy-safe-builder-example`
    (Privy + Safe, new-user flow, gasless, builder attribution) demonstrates deploy →
    fund → approve → trade. Repo archived 2026-05-11 (reference-frozen as they push type 3).
  - **Type 3 (POLY_1271 deposit wallet):** the docs' *recommended* path for new builders,
    but a client-library auth bug currently blocks newly-created wallets:
    `"the order signer address has to be the address of the API KEY"`
    (`py-clob-client-v2` #64, #70, #51; open, maintainers quiet since early May).
    Root cause is client-side (`_l1_headers()` ignores funder) — patchable, not a protocol wall.
- **Collateral is now pUSD** — ERC-20 on Polygon, 1:1 USDC-backed, contract-enforced,
  redeemable 1:1 no fee, non-rebasing. Money flow gains one clean wrap step.
- **CCTP supports Celo→Polygon** — native burn-and-mint USDC, no wrapped-asset risk.

Reference: `docs.polymarket.com/developers/proxy-wallet`, `/trading/deposit-wallets`,
`Polymarket/privy-safe-builder-example`, `Polymarket/proxy-factories`.

## Open verifications (Phase 0 exit criteria)

- [ ] **THE spike:** deploy one per-user Safe (type 2) from a fresh Privy EOA via the
      factory, fund with a few pUSD, place & fill one real ~$1 order, sell, confirm
      settlement. Follow `privy-safe-builder-example`. If type-2 new-wallet orders are
      blocked too → patch type-3 client auth, or engage Polymarket's builder program.
- [ ] Real per-deposit round-trip cost (swap + bridge + wrap + gas) → minimum deposit floor.
- [ ] Privy delegated signing covers the sweep + redeem flows (offline user).
- [x] Collateral = pUSD (1:1 USDC). CCTP Celo→Polygon supported. Custody = non-custodial
      per-user proxy wallets (omnibus and fork both rejected).

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
