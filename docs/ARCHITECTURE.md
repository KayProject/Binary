# Binary — Technical Architecture

**Binary is a MiniPay-native broker that routes real bets into Polymarket, settled in
USDm on Celo.** Users see live Polymarket markets and odds, bet with their own USDm
inside MiniPay, and get paid back in USDm. Binary carries the money to Polymarket and
back; it never takes the other side of a bet and puts up no float of its own.

Positioning: *"Polymarket's markets, in your pocket, in USDm."* Real money, real
Polymarket liquidity — not points (beats Myriad, the points-only incumbent in MiniPay),
not our own thin pools (no cold-start).

---

## Why the architecture is shaped this way (hard constraints)

These are not preferences — they are physics, and they dictate every decision below.

1. **MiniPay is Celo-only, legacy-tx-only, and cannot sign messages.** No EIP-712, no
   `personal_sign`, no other chains. A MiniPay user therefore **cannot** place a
   Polymarket order (an EIP-712 message on Polygon) or hold pUSD. Confirmed against
   MiniPay docs.
2. **Polymarket lives on Polygon**; orders are off-chain EIP-712 signatures against a
   per-user proxy wallet; collateral is **USDC.e** (verified live 2026-07-10: clob-client
   v4.22.8 config + on-chain symbol at `0x2791Bca1…84174`; the pUSD migration has not
   reached the CLOB contract set).
3. **No float.** Binary has no capital to front bets or take positions. Every cent that
   reaches Polymarket is the user's own money.
4. **Proof of Ship** requires a Celo-mainnet smart contract generating real MiniPay
   transaction activity.

**Consequence:** the user cannot reach Polygon, and we will not use our own money — so
Binary must move the *user's* money to Polymarket for them. That makes Binary a
**broker/courier**, and it makes the Polygon-side wallets **Binary-key-managed** (the
user can't hold or sign for a Polygon key through MiniPay). This custody is unavoidable;
we make it per-user, isolated, and trade-or-return-only. See Custody & Security.

---

## What Binary is NOT

- **Not the house / not a bookmaker.** Binary never takes a side, never sets odds, holds
  no float, bears no position risk. Users buy real Polymarket shares at Polymarket odds.
- **Not an omnibus pool.** Funds are never commingled in one pot. One isolated Polygon
  wallet per user; a user's shares are provably theirs.
- **Not a market maker on Celo.** No Celo AMM/parimutuel — that would lose the Polymarket
  liquidity that is the entire selling point.

Binary is a **courier + broker**: it authenticates the user (MiniPay), moves their money
(Celo↔Polygon), places their order (Polymarket Builder Program), and returns their money.

---

## Core UX/latency decision: funded balance, not bet-by-bet bridging

The one slow leg is the Celo↔Polygon bridge (~tens of seconds even at best). If every bet
triggered a fresh bridge, every bet would be slow. So:

> **Users top up once; bets are instant.** A deposit bridges USDm → the user's Polygon
> wallet (as pUSD) a single time. From then on, bets are placed against that
> already-on-Polygon balance — **sub-second, gasless**. Only top-up and withdrawal pay
> the bridge latency; the bet itself never does.

This is the decisive latency optimization and it costs no float — the money on Polygon is
the user's own top-up, not ours. Trade-off: between bets the user's balance sits on Polygon
in a Binary-managed wallet (custody), and withdrawal has bridge latency (shown as pending).

---

## Money flow

```
TOP UP (once; pays bridge latency):
  USDm (user's MiniPay wallet, Celo)               [1 MiniPay tx, self-authenticating]
    → Binary Deposit Contract on Celo (logs deposit for audit + Proof of Ship)
    → USDm→USDT via Mento Broker on Celo — the same rails MiniPay Pockets uses.
      Verified on-chain: constant-sum oracle pricing, ~0% cost (quoted +0.059% in the
      user's favor), flat $20–$500. Broker 0x777A8255cA72412f0d706dc03C9D1987306B4CaD,
      USDm/USDT exchangeId 0x773bcec109cee923b5e04706044fd9d6a5121b1a6a4c059c36fdbe5b845d4e9b.
    → USDT0 Legacy Mesh: Celo →(0.03% + ~$0.07)→ Arbitrum hub →(0% + ~$0.08)→ Polygon
    → swap USDT→USDC.e on Polygon                    [est. minutes; measured in Phase 0]
    → user's per-user proxy (Gnosis Safe) balance    [ready to trade]

  Why this rail (all verified 2026-07-10):
  - Celo is NOT a CCTP domain (Circle docs; no TokenMessengerV2 code on Celo). CCTP is out.
  - Aggregators miss the best route: LI.FI doesn't integrate USDT0; its best was Allbridge
    USDT at 0.35–0.62% and ~22 min (fast Squid route collapses above ~$5 — dust axlUSDC
    liquidity on Celo).
  - Celo's native USDT is in Tether's **USDT0 Legacy Mesh** (LayerZero OFT, hub-and-spoke
    via Arbitrum; Celo→Polygon has no direct peer). Quoted on-chain: hop 1 exactly 0.03%
    + 1.05 CELO (~$0.07); hop 2 zero-fee + ~$0.08 ETH. **Fixed fees per message, not per
    dollar → batching amortizes to ~0.03–0.2% total.**
    Contracts: Celo OFT 0xf10E161027410128E63E75D0200Fb6d34b2db243 (eid 30125) ·
    Arbitrum hub 0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92 (eid 30110) ·
    Polygon 0x6BA10300f0DC58B7a1e4c0e41f5daBb7D7829e13 (eid 30109).

BET (instant, gasless, many times):
  tap YES/NO → backend builds order → Binary-managed signer signs (type-2, on behalf of
  the user's Safe) → Polymarket CLOB API (Builder attribution) → filled in Polymarket's
  real book. Position = real outcome shares in the user's Safe.

CASH OUT / RESOLUTION:
  sell via CLOB, or redeem winning shares after Polymarket/UMA resolution → USDC.e in Safe.

WITHDRAW (fast + cheap; funds only ever go to the user's recorded Celo address):
  USDC.e → bridge Polygon→Celo (Squid via LI.FI, ~80 s, ~0.28% at all sizes)
    → swap USDC→USDm → user's MiniPay wallet.
```

---

## Latency budget & optimizations

| Leg | Naive | Optimized | How |
|---|---|---|---|
| Deposit tx (Celo) | ~5 s | ~1–5 s | Celo ~1 s blocks; single tx into Deposit Contract |
| Swap USDm→USDT (Celo) | ~5 s | ~1–3 s | Mento/DEX; batch into deposit tx where possible |
| Bridge Celo→Polygon | ~22 min (Allbridge, 0.35–0.6%) | **est. 2–5 min** (USDT0 mesh 2-hop, ~0.03% + ~$0.15/msg; Phase 0 measures) | No CCTP for Celo; USDT0 Legacy Mesh via Arbitrum hub. Netting + batching cut cost and frequency further (see Deposit-leg design) |
| Bridge Polygon→Celo (withdraw) | — | **~80 s, ~0.28%** | Squid via LI.FI — verified live quotes, all sizes $5–$100 |
| Swap USDT→USDC.e (Polygon) | ~5 s | ~2–5 s | Polygon ~2 s blocks |
| **Place bet** | seconds | **< 1 s** | **Funded-balance model** removes the bridge from the bet path; gasless via Builder relayer |
| Price/odds display | — | real-time | Polymarket public CLOB **websocket** + Gamma API; cached, streamed to client; no wallet needed to read |

**Off the critical path entirely** (pre-provisioned in the background at first app open):
per-user Safe deployment and token approvals. So a user's *first* bet isn't delayed by
one-time setup.

Additional wins:
- **Optimistic UI**: bet shows "placing…" then confirms on fill (sub-second on Polygon).
- **Market orders with a slippage cap**; partial fills surfaced, never hidden.
- **v2 operating float** (see Future) makes even top-up feel instant by fronting the bridge
  from a working pool and replenishing from the user's inbound funds — deferred until there
  is capital; the architecture is built so it slots in without user-facing change.

### Deposit-leg design (three layers, in priority order)

Layer 1 — **Netting (most volume never bridges).** Binary has flow in BOTH directions:
user A's deposit on Celo can pay user B's withdrawal on Celo, while B's surrendered
Polygon balance credits A's Safe. An internal netting engine matches opposing flows
first; only the **net imbalance** actually bridges. Zero bridge fee, near-instant, zero
capital — it's the users' own simultaneous flows. Early on the book will be one-sided
(mostly deposits), so layers 2–3 carry the residual.

Layer 2 — **Batched USDT0 mesh transfers (the rail).** Residual imbalance bridges in
batches (time window or $-threshold). LZ message fees are per-message, so a $200 batch
costs ~0.03% + $0.15 ≈ **0.1% total**; latency est. 2–5 min (Phase 0 measures). User's
deposit shows an honest short "funding" state at worst.

Layer 3 — **Optional working buffer (Jadon's call, still open).** A small Polygon-side
USDC.e buffer (~$200–500) credits Safes instantly on Celo deposit confirmation and is
replenished by layer 2. Softens the no-float rule (working capital in transit, no market
exposure). With layers 1–2 the batch cadence may already be short enough that this is
unnecessary at launch — decide after Phase 0's measured latency.

Withdrawals: netting first; residual via Squid (~80 s, ~0.28%, verified all sizes) or the
mesh's return path — whichever prices better at execution time.

---

## Components

| Component | Responsibility | Stack |
|---|---|---|
| MiniPay Mini App (PWA) | Market feed, live odds, tap-to-bet, balance, top-up/withdraw. Detect `window.ethereum.isMiniPay`; implicit connect; no "Connect Wallet" button | Next.js, TS, Tailwind, viem/wagmi (fee-currency aware) |
| Celo Deposit Contract | Canonical on-chain record of deposits/withdrawals per user (audit + Proof of Ship activity); receives USDm; emits events the backend acts on | Solidity (Celo) |
| Key-management / signer service | One Binary-managed Polygon EOA **per user** (they can't sign for Polygon); signs orders on behalf of each user's Safe | Privy server wallets or Turnkey (MPC/KMS) |
| Per-user proxy wallet | Gnosis Safe (type 2) owned by the user's managed EOA; holds pUSD + outcome shares | Safe proxy factory + Polymarket builder-relayer-client |
| Bridge pipeline | swap → bridge (LI.FI-routed: Allbridge in, Squid out) → swap, retries, idempotency, status | Node service + LI.FI API |
| Polymarket integration | Order routing with Builder attribution; balances, positions, redemption | `@polymarket/clob-client` v4, `builder-relayer-client`, `builder-signing-sdk` |
| Price/odds stream | Live prices via Polymarket CLOB websocket + Gamma market/event data; cached fan-out to clients | Node service + WS |
| Resolver / settlement | Detects Polymarket/UMA resolution; redeems shares; triggers withdrawal path | Node service |
| Ledger | Off-chain source of truth mapping user ↔ Safe ↔ balance/positions, reconciled to on-chain | Postgres |

---

## Accounting & ledger rules

1. **On-chain truth for user funds is two-sided**: the Celo Deposit Contract records what
   each user put in / took out (auditable, Proof-of-Ship activity); the user's Polygon Safe
   holds the real pUSD + Polymarket shares. The off-chain ledger maps and reconciles both.
2. **Accounting unit is USDC/pUSD** (1:1). USDm is a **display skin** + the deposit/withdraw
   token; the USDm↔USDC rate is quoted live (Mento), surfaced as one "conversion fee" line.
   Never store balances in USDm.
3. **Payouts only ever go to the user's Celo address recorded at first deposit.** Even a
   compromised session cannot redirect funds — a key security invariant.
4. One-tap bets are market orders with a slippage cap; partial fills are shown in the position.

---

## Auth (no SIWE — MiniPay can't sign messages)

- The user's identity is their **MiniPay Celo address**, read from the injected provider
  inside MiniPay's trusted webview. There is **no signature-based login** (SIWE impossible).
- State-changing actions are **self-authenticating on-chain Celo transactions** (deposits,
  withdrawal requests) signed by the user's own MiniPay wallet — no message signing needed.
- Each Celo address maps deterministically to one Binary-managed Polygon signer + Safe.

---

## Custody & Security (the honest core)

Binary holds the keys to per-user Polygon wallets. This is unavoidable (MiniPay users
cannot sign for Polygon). It is made safe, not eliminated:

- **MPC/KMS-backed keys** (Turnkey / Privy server wallets) — never plaintext, never a hot
  `.env` key. Per-user isolation; no single key controls everyone.
- **Trade-or-return only**: automated flows can buy on Polymarket or return funds to the
  user's recorded Celo address — nothing else. No arbitrary transfers.
- **Payout address is pinned** at first deposit (see ledger rule 3).
- **Deposit/exposure caps** in v1; monitoring, alerting, rate-limits.
- **Positions are the user's real Polymarket shares** — Binary never rehypothecates or
  takes the other side.

Residual honestly stated: Binary is a custodian of funds-in-transit and open positions, and
a money-router into Polymarket — this carries operational-security and regulatory weight
(see Risks). It is the minimal custody that "MiniPay + real Polymarket + no float" allows.

---

## Risks

| Risk | Position |
|---|---|
| Key compromise (we hold Polygon keys) | MPC/KMS, per-user isolation, trade-or-return-only, pinned payout address, caps, monitoring |
| Polymarket geoblock / Builder ToS | The example ships a geoblock check; verify our relayed flow + region policy against Builder terms before launch; register in the Builder Program |
| Regulatory (real-money betting; Nigerian/African users) | Open business/legal question; tracked, decided before public launch — not a code blocker |
| Bridge downtime / latency spike | Top-up/withdraw queue with visible pending state; funds are the user's own, never at position risk |
| USDm peg drift | Live Mento quote on convert; never hardcode 1:1 |
| Fixed per-transfer cost | Minimum top-up/withdraw (~$2–5) so bridge fees don't dominate |
| Fill slippage on thin markets | Curate liquid Polymarket markets in v1; slippage caps |

---

## Build order

**Phase 0 — broker spike (blocks everything; scripts only, ~$5–10).** Prove the full
courier round-trip for ONE server-managed user, no UI: create a Binary-managed Polygon
signer → deploy its Safe via factory → fund it (USDm on Celo → swap → Allbridge USDT →
swap USDC.e) → place a real ~$1 order on Polymarket via the Builder path → sell/redeem →
withdraw back to USDm on Celo. Record real latency per leg and real per-round-trip cost →
set minimum top-up and confirm the funded-balance model. See `PHASE0.md`.

**Phase 1 — MiniPay MVP.** MiniPay Mini App shell (implicit connect, no connect button);
Celo Deposit Contract; per-user managed signer + Safe auto-provision on first open;
funded-balance top-up with honest pending states (or buffer, per Deposit-leg decision);
live odds via Polymarket WS;
tap-to-bet (instant, gasless); positions; cash-out; withdraw. Curated liquid markets.

**Phase 2+ — see Future versions.**

## Open verifications (Phase 0 exit criteria)

- [ ] **Broker round-trip works** end-to-end for a fresh server-managed user (Safe deploy →
      fund → real order/fill → sell/redeem → withdraw to Celo).
- [x] ~~CCTP v2 Fast Transfer supports Celo↔Polygon~~ **Resolved 2026-07-10: Celo is not a
      CCTP domain at all** (Circle docs + no TokenMessengerV2 code on Celo). Replacement
      rail: **USDT0 Legacy Mesh** Celo→Arbitrum→Polygon (0.03% + ~$0.15/msg, quoted
      on-chain; `phase0/scripts/09-usdt0-transfer.ts`), with netting + batching on top.
      Aggregator fallback quantified in `07-bridge-quote.ts` (Allbridge ~22 min / Squid
      out ~80 s).
- [ ] **Real USDT0 mesh latency** per hop (09) — the number that decides whether the
      optional buffer (layer 3) is needed at all.
- [x] **Contract addresses verified live 2026-07-10** via installed clob-client v4.22.8 +
      on-chain reads (`phase0/scripts/00-verify-config.ts`): collateral is still USDC.e
      `0x2791Bca1…84174`; exchange/adapter set unchanged from the official example.
- [ ] **Builder Program terms + geoblock policy** for relayed order flow.
- [ ] **Real per-round-trip cost measured with funds** (quotes say ~0.7–0.9% round trip at
      $20–50) → minimum top-up/withdraw floor.
- [ ] **Deposit-leg decision:** honest ~22 min pending vs small working buffer (see above).
- [x] Custody model = per-user Binary-managed Polygon wallets, trade-or-return-only,
      pinned payout address. Collateral = USDC.e (verified).

## Future versions

- **Operating float** (needs capital): a working pool fronts the bridge so even top-up is
  instant; replenished by users' inbound funds. Slots in with no user-facing change.
- **In-app top-up UX**: MiniPay pocket-swap deep links; recurring balance.
- **Limit orders, full catalog browse** (v1 is a curated feed + market orders).
- **Streaks, shareable win cards, leaderboards** (retention; the blue/dot-matrix design).
- **Progressive decentralization** of custody if/when Polymarket enables MiniPay-signable flows.
