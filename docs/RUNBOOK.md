# Test Runbook

Everything testable in this repo, in execution order. Tier 1 costs nothing and can run
today; Tier 2 is the Phase 0 money run (~$2.50 in, ~$2.20 back). Record results in the
tables at the bottom — those numbers feed ARCHITECTURE.md decisions (top-up floor,
buffer yes/no).

## Tier 1 — free, no credentials

Run all of these before spending a cent. Any failure here stops the money run.

| # | What | Command (repo root unless noted) | Pass looks like |
|---|---|---|---|
| 1 | Contract unit tests | `cd contracts && forge test` | `10 passed` |
| 2 | Funding machine + netting tests | `npx tsx --test src/lib/funding/funding.test.ts` | `pass 7` |
| 3 | Production build | `rm -rf .next && npm run build` | routes `/api/markets`, `/api/markets/[slug]`, `/app` listed |
| 4 | Live market feed | `npm run dev`, then `curl localhost:3000/api/markets?limit=5` | JSON with real questions, prices 0–1, `clobTokenId`s |
| 5 | Feed detail | `curl localhost:3000/api/markets/<slug-from-step-4>` | single market JSON |
| 6 | App shell | open `localhost:3000/app` on a phone-sized viewport | feed renders, tap YES/NO opens bet sheet, amounts + payout preview work |
| 7 | Spike env sanity | `cd phase0 && npm run 00` | live contract table, collateral `USDC` at `0x2791…`, env ✓/✗ list |
| 8 | Spike signer | `cd phase0 && npm run 01` | prints EOA + derived Safe (idempotent — reuses `.state.json`) |
| 9 | Bridge quote table | `cd phase0 && npm run 07` | route table both directions, several sizes |
| 10 | Mento quote | `cd phase0 && npm run 10 -- 20 quote` | `$20 USDm → ~$20.01 USDT (cost ≈ −0.06%)` |

## Tier 2 — Phase 0 money run

### Prerequisites

1. **Builder credentials** — polymarket.com → Settings → Builder tab → create keys →
   paste into `phase0/.env.local` (`POLYMARKET_BUILDER_API_KEY/_SECRET/_PASSPHRASE`).
   If Polymarket blocks the signup/settings page from Nigeria, stop and record that —
   it's a product-level finding, not a test failure.
2. **Fund the spike EOA** (address from `npm run 01`):
   - Celo: **$1.50 USDm + 1.5 CELO**
   - Arbitrum: **$0.15 ETH**
   - Polygon: **~$0.30 POL**
3. Same money flows through every step — nothing is funded twice.

### Run order (one command at a time; each prints its own timing)

| # | Command (`cd phase0`) | Proves | Record |
|---|---|---|---|
| M1 | `npm run 10 -- 1.5` | USDm→USDT entry leg (Mento) | realized rate vs quote |
| M2 | `npm run 09 -- hop1 1.4` | Celo→Arbitrum mesh leg | **wall-clock seconds**, amount out |
| M3 | `npm run 09 -- hop2 1.3` | Arbitrum→Polygon mesh leg | **wall-clock seconds**, amount out |
| M4 | swap USDT→USDC.e on Polygon (any DEX UI or LI.FI, ~$1.30) and send USDC.e to the **Safe** from step 8 | funding the trading wallet | swap cost |
| M5 | `npm run 02` | gasless Safe deploy via relayer | seconds; confirm EOA spent no POL |
| M6 | `npm run 03` | gasless approval batch | seconds |
| M7 | `npm run 04` | user API creds derive/create for a fresh wallet | works at all (post-V2 open question) |
| M8 | `npm run 05 -- <tokenID> 1` — tokenID from `curl localhost:3000/api/markets?limit=5` (pick highest volume, copy `clobTokenId`) | **THE test**: real $1 order from a fresh server-signed Safe | fill, shares in Safe |
| M9 | `npm run 06 -- <tokenID>` | exit via sell | proceeds back in Safe |
| M10 | `npm run 08 -- withdraw 1` (USDT variant) or Squid UI for USDC.e | Polygon→Celo return leg | seconds + cost |

Timings auto-persist to `phase0/.state.json` (`timings` key) — copy them into the
results table below when done.

### If M8 fails
That's the type-3-era auth bug class. Capture the exact error JSON, then: retry with a
different liquid market; if it persists, the fallback is patching the clob-client L1
auth header or contacting the Builder Program — documented in PHASE0.md.

## Results (measured 2026-07-13, run at $1.50 scale)

| Leg | Expected (quoted) | Measured | Date |
|---|---|---|---|
| Mento USDm→USDT | ~0% (−0.06%) | −0.05% (gain), 8.3 s | 07-13 |
| Mesh hop1 Celo→Arb | 0.03% + ~$0.07, est 1–3 min | **0.03% exactly, 23 s** | 07-13 |
| Mesh hop2 Arb→Polygon | 0% + ~$0.08, est 1–2 min | **0%, 1,146 s (~19 min)** ⚠️ | 07-13 |
| USDT→USDC.e swap | ~0.01–0.05% | 0.14% (LI.FI/Sushi) | 07-13 |
| pUSD wrap (new, post-V2) | — | 4.6 s, gasless | 07-13 |
| Safe deploy (gasless) | ~10–30 s | 5.0 s (Safe now unused — see below) | 07-13 |
| Deposit wallet deploy + approvals | — | ~5 s each, gasless | 07-13 |
| $1 order fill | < 3 s | **1.6 s, matched** | 07-13 |
| Sell exit | < 3 s | 1.4 s; gross $0.99716, **net $0.9361 after 1000 bps CLOB fee (~$0.061)** | 07-13 |
| pUSD unwrap → USDC.e | — | 4.8 s, gasless | 07-13 |
| Withdraw Polygon→Celo (Squid → USDm direct) | ~0.28%, ~80 s | **0.23%, 66 s — lands as USDm directly** | 07-13 |

Post-V2 reality (April 28, 2026 upgrade — discovered live during this run):
- Collateral is **pUSD** (`0xC011a7E1…2DFB`); wrap via CollateralOnramp `0x93070a…B8ee`,
  unwrap via CollateralOfframp `0x2957922E…5854` (`wrap/unwrap(asset, to, amount)`).
- Old `@polymarket/clob-client` is dead → `@polymarket/clob-client-v2`; builder
  attribution = bytes32 `BUILDER_CODE` on orders, no HMAC.
- New wallets cannot trade as type-2 Safes ("maker address not allowed") → EIP-1271
  **deposit wallets** (steps 12/13), signatureType 3, funder = deposit wallet.
- The CLOB now charges trading fees (1000 bps rate on this market's fee schedule) —
  the fee model must absorb/display this.

### Decisions unblocked by these numbers
- **Deposit buffer (layer 3)**: if hop1+hop2 measure ≤ ~3 min, launch without it.
- **Minimum top-up floor**: set so fixed fees (~$0.15/batch) stay under ~1% → floor ≈
  batch size ÷ users per batch.
- **Exit criteria** in PHASE0.md get ticked from this table.
