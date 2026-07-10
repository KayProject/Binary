# Phase 0 — Broker Round-Trip Spike

**Goal:** prove Binary can, as a broker, carry ONE user's money into Polymarket and back —
end to end, with real money — before building any UI. Scripts only, ~$5–10 at risk.
This validates the whole product; everything else is UX on top of it.

Grounded in Polymarket's official `privy-safe-builder-example` (Next.js + Safe + Builder
relayer, type-2, gasless). We reuse its exact Polygon-side flow, but replace the *browser
Privy embedded wallet* with a **server-managed signer** — because our real users are on
MiniPay and cannot sign for Polygon (see `ARCHITECTURE.md`). For the spike a raw throwaway
key stands in for that managed signer.

## Status (2026-07-10)

All scripts are written and typechecked in `phase0/` (`npm run 00` … `npm run 08`).
Steps 00, 01 and 07 already ran successfully against live endpoints. Two pre-flight
questions are **resolved without spending funds**:

- **Contract addresses:** verified live via the installed `clob-client` v4.22.8 + on-chain
  reads — collateral is still **USDC.e** (`0x2791Bca1…84174`), exchange/adapter set
  unchanged from the example. The pUSD migration has not reached the CLOB contract set.
- **Bridge leg:** **Celo is not a CCTP domain** (Circle docs + no TokenMessengerV2 code
  on Celo). The funding leg rides LI.FI-routed aggregation instead. Live quotes:

  | Leg | Route | Cost | Time |
  |---|---|---|---|
  | Celo→Polygon $5 | Squid (axlUSDC) | 2.7% | ~20 s |
  | Celo→Polygon $20 | Squid — **collapses, 9.4% price impact** | — | — |
  | Celo→Polygon $20–100 | **Allbridge USDT** | 0.35–0.62% | **~22 min** |
  | Polygon→Celo $5–100 | **Squid** | ~0.28% | **~80 s** |

  Deposits are the slow leg; withdrawals are fast and cheap. This forces the
  **Deposit-leg decision** (honest pending vs small working buffer) — see ARCHITECTURE.md.

## Two halves — tested separately, then joined

1. **Polymarket half (first, cheapest to test):** managed signer → deploy Safe → fund with
   USDC.e directly on Polygon → place & fill a real ~$1 order → sell/redeem. Proves the
   trading path works for a *freshly created* wallet (the open question after Polymarket's
   April V2 upgrade).
2. **Bridge half:** USDm→USDT swap on Celo → Allbridge Celo→Polygon (~22 min leg measured
   for real) → USDT→USDC.e on Polygon; reverse via Squid (~80 s). Confirms the quoted
   costs/latency hold in practice.

Join them last for the full courier round-trip.

## Scripts (`phase0/`, `npm run <step>`)

| Step | Script | Funds? | What it does |
|---|---|---|---|
| 00 | `00-verify-config.ts` | no | Live contract set, collateral verified on-chain, env check |
| 01 | `01-signer.ts` | no | Throwaway EOA (stands in for Turnkey/Privy key) + deterministic Safe address |
| 02 | `02-deploy-safe.ts` | no (gasless) | Deploy Safe via Builder relayer; timed |
| 03 | `03-approvals.ts` | no (gasless) | One batch: collateral approvals + ERC-1155 operator approvals |
| 04 | `04-api-creds.ts` | no | Derive/create user-level CLOB API creds |
| 05 | `05-order.ts <tokenID> [usd]` | **~$1** | Real FOK market order with Builder attribution; verifies shares land in the Safe |
| 06 | `06-close-position.ts` | — | Sell into the book, or redeem post-resolution (gasless batch) |
| 07 | `07-bridge-quote.ts` | no | Live route/cost/ETA table both directions at several sizes |
| 08 | `08-bridge-execute.ts deposit\|withdraw <usd>` | **real** | Executes one bridge leg, measures wall-clock latency + realized cost |

State (throwaway key, Safe, creds, timings) persists in `phase0/.state.json` (gitignored).

## What to measure (feeds the architecture)

- **Realized bridge latency & cost per leg** (08) vs the quotes above — especially whether
  Allbridge's ~22 min estimate holds, and the withdrawal leg's ~80 s.
- **Total per-round-trip cost** (swap + bridge + swap, both ways) → minimum top-up floor.
  Quotes imply ~0.7–0.9% round trip at $20–50.
- Whether Safe deploy + order placement are truly gasless for the managed signer (02/03/05
  record timings) — confirms the signer needs no POL.
- If 05 fails for a fresh wallet (the type-3 client-bug class): the JS `clob-client` v4 +
  type-2 Safe used here is the path that reportedly works; fall back to patching the
  client's L1 auth or engage Polymarket's Builder Program.

## What's needed to run it (from Jadon)

1. **Polymarket Builder API credentials** — `polymarket.com/settings?tab=builder`
   (`API_KEY`, `SECRET`, `PASSPHRASE`) → `phase0/.env.local`.
2. **Dedicated Polygon + Celo RPC URLs** (public ones are pre-filled; fine for the spike,
   replace for anything sustained).
3. **~$5–10**: USDC.e on Polygon (trading half first) and/or USDT on Celo (bridge half).
   Fund the **Safe** printed by step 01 for trading; fund the **EOA** for bridge legs.

## Exit criteria

- [x] Contract set + collateral verified live (00).
- [x] Bridge routes, costs and ETAs quantified both directions (07); CCTP ruled out.
- [ ] Fresh Safe deployed for a server-managed signer via relayer, gasless (02).
- [ ] Real ~$1 order placed and filled from that Safe; shares in the Safe (05).
- [ ] Position sold/redeemed; USDC.e back in Safe (06).
- [ ] Real bridge legs executed and measured both directions (08).
- [ ] Full round-trip: Celo → bet on Polymarket → back to Celo; total cost recorded →
      minimum top-up floor.
- [ ] Deposit-leg decision made (honest ~22 min pending vs small working buffer).
