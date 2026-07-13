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
   per-user wallet; collateral is **pUSD** `0xC011a7E1…2DFB` (verified live 2026-07-13 —
   the V2 migration completed April 28, 2026; USDC.e wraps 1:1 into pUSD via the
   CollateralOnramp, and new wallets must be EIP-1271 deposit wallets, not Safes).
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
TOP UP (once; pays bridge latency — DUAL RAIL, chosen per batch):
  USDm (user's MiniPay wallet, Celo)               [1 MiniPay tx, self-authenticating]
    → Binary Deposit Contract on Celo (logs deposit for audit + Proof of Ship)

  FAST RAIL (interactive path — batches ≥ ~$50):
    → Squid via LI.FI, Celo → Polygon USDC.e in ONE call  [measured direction-twin: 66 s]
      Small amounts are butchered by dust liquidity (9.5% at $20) but ≥$50 costs
      ~0.4–0.47% — so the netting engine batches deposits to the $50+ floor and the
      user's balance is live in ~1–2 min.

  CHEAP RAIL (bulk rebalancing, off the interactive path):
    → USDm→USDT via Mento Broker (measured −0.05%, i.e. user gains, 8.3 s)
    → USDT0 Legacy Mesh: Celo →(0.03%, 23 s measured)→ Arbitrum hub
      →(0%, **1,146 s / ~19 min measured** — this is why it's not the interactive rail)→ Polygon
    → swap USDT→USDC.e (LI.FI/Sushi, 0.14% measured)
      Contracts: Celo OFT 0xf10E161027410128E63E75D0200Fb6d34b2db243 (eid 30125) ·
      Arbitrum hub 0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92 (eid 30110) ·
      Polygon 0x6BA10300f0DC58B7a1e4c0e41f5daBb7D7829e13 (eid 30109).
      Gotcha (measured): the Arb hub returns approvalRequired()=false but still
      requires an allowance before send().

  BOTH rails end with (gasless via relayer, 4.6 s measured):
    → wrap USDC.e → pUSD via CollateralOnramp 0x93070a847efEf7F70739046A929D47a521F5B8ee
    → user's per-user DEPOSIT WALLET balance + updateBalanceAllowance  [ready to trade]

  (CCTP remains out — Celo is not a CCTP domain, verified 2026-07-10.)

BET (instant, gasless, many times — VERIFIED LIVE 2026-07-13, $1 real order):
  tap YES/NO → backend builds order → Binary-managed signer signs POLY_1271 (type 3,
  EOA signs for its EIP-1271 deposit wallet) → Polymarket CLOB API, attribution via
  bytes32 BUILDER_CODE → **filled in 1.6 s** in Polymarket's real book. Position = real
  outcome shares held by the user's deposit wallet.
  NOTE: the CLOB charges per-market trading fees post-V2 (1000 bps schedule measured —
  ~6% of proceeds on a 0.39 market exit). The payout preview MUST price this in.

CASH OUT / RESOLUTION:
  sell via CLOB (measured 1.4 s), or redeem winning shares after Polymarket/UMA
  resolution → pUSD in the deposit wallet.

WITHDRAW (measured end-to-end 2026-07-13; funds only ever go to the user's recorded Celo address):
  pUSD → unwrap to USDC.e via CollateralOfframp 0x2957922Eb93258b93368531d39fAcCA3B4dC5854
         (gasless relayer batch, 4.8 s, lands directly at the operator EOA)
    → Squid via LI.FI, Polygon → **USDm on Celo directly, one call: 66 s, 0.23%**
    → user's MiniPay wallet. No Mento leg needed on the way out.
```

---

## Latency budget & optimizations

| Leg | Naive | Measured (2026-07-13) | How |
|---|---|---|---|
| Deposit tx (Celo) | ~5 s | ~1–5 s | Celo ~1 s blocks; single tx into Deposit Contract |
| Swap USDm→USDT (Celo) | ~5 s | **8.3 s, −0.05% (user gains)** | Mento Broker (cheap rail only) |
| Bridge Celo→Polygon (fast rail) | ~22 min (Allbridge) | **~66–90 s, ~0.4–0.47% at $50+ batches** | Squid via LI.FI, one call; batch to the $50 floor |
| Bridge Celo→Polygon (cheap rail) | — | **23 s + 19 min, 0.03% + 0.14% swap** | USDT0 mesh via Arb hub — bulk rebalancing only; hop2 is the wall |
| pUSD wrap / unwrap | — | **4.6 s / 4.8 s, gasless** | Collateral On/Offramp via relayer batch |
| Bridge Polygon→Celo (withdraw) | — | **66 s, 0.23%, lands as USDm directly** | Squid via LI.FI, one call |
| **Place bet** | seconds | **1.6 s fill (sell 1.4 s)** | Funded-balance model; gasless; POLY_1271 deposit wallet |
| Price/odds display | — | real-time | Polymarket public CLOB **websocket** + Gamma API; cached, streamed to client; no wallet needed to read |

**Off the critical path entirely** (pre-provisioned in the background at first app open):
per-user deposit-wallet deployment (~5 s gasless) and pUSD/CTF approvals (~5 s gasless),
plus the CLOB `updateBalanceAllowance` sync. So a user's *first* bet isn't delayed by
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
Polygon balance credits A's deposit wallet. An internal netting engine matches opposing flows
first; only the **net imbalance** actually bridges. Zero bridge fee, near-instant, zero
capital — it's the users' own simultaneous flows. Early on the book will be one-sided
(mostly deposits), so layers 2–3 carry the residual.

Layer 2 — **Batched FAST-rail transfers (interactive).** Residual imbalance bridges in
$50+ batches via Squid (~66–90 s, ~0.4–0.47%). Phase 0 measured the mesh's hop2 at
**19 minutes**, which disqualifies it from the interactive path; the mesh survives as
the CHEAP rail for large scheduled rebalances (overnight, $200+, ~0.2% all-in) where
latency doesn't matter.

Layer 3 — **Working buffer: RESOLVED — not needed at launch.** The original buffer
question assumed the only rail was the slow mesh. With layer-2 batching on the fast
rail, a deposit is live in ~1–2 min worst case, which the UX absorbs as a short honest
"funding" state. A small pUSD float on Polygon remains a v2 option to make top-ups
*feel* instant, but it is no longer a launch prerequisite.

Withdrawals: netting first; residual via Squid Polygon→USDm-on-Celo in one call
(**measured 66 s, 0.23%**). The mesh return path is never needed.

---

## Components

| Component | Responsibility | Stack |
|---|---|---|
| MiniPay Mini App (PWA) | Market feed, live odds, tap-to-bet, balance, top-up/withdraw. Detect `window.ethereum.isMiniPay`; implicit connect; no "Connect Wallet" button | Next.js, TS, Tailwind, viem/wagmi (fee-currency aware) |
| Celo Deposit Contract | **LIVE on Celo mainnet: `0xE75A70597501453Fb0DFBa9B34eA2b9495d67600`** (deployed + Sourcify-verified 2026-07-13; smoke-tested with a real $0.10 deposit). Canonical on-chain record of deposits/payouts per user (audit + Proof of Ship activity); receives USDm; emits events the backend acts on | Solidity (Celo), `contracts/` |
| Key-management / signer service | One Binary-managed Polygon EOA **per user** (they can't sign for Polygon); signs POLY_1271 orders for the user's deposit wallet | Privy server wallets or Turnkey (MPC/KMS) |
| Per-user deposit wallet | **EIP-1271 deposit wallet** (Polymarket's official server-signable primitive post-V2; type-2 Safes are rejected for new makers). Deployed gasless in ~5 s; holds pUSD + outcome shares | Relayer `deployDepositWallet` (factory 0x00000000000Fb5C9ADea0298D729A0CB3823Cc07) |
| Bridge pipeline | Dual rail: Squid in/out (interactive) + USDT0 mesh (bulk); wrap/unwrap pUSD; sign-locally→multi-RPC-broadcast tx sender; per-chain gas policy; retries, idempotency, status | Node service + LI.FI API + funding state machine (`src/lib/funding/`) |
| Polymarket integration | Order routing with bytes32 BUILDER_CODE attribution; balances (updateBalanceAllowance), positions, redemption | **`@polymarket/clob-client-v2`**, `builder-relayer-client` ≥0.0.10 |
| Fee engine | Per-market CLOB fee rates (1000 bps schedule measured) surfaced in the feed API and priced into every payout preview | Node service (feed enrichment) |
| Price/odds stream | Live prices via Polymarket CLOB websocket + Gamma market/event data; cached fan-out to clients | Node service + WS |
| Resolver / settlement | Detects Polymarket/UMA resolution; redeems shares; triggers withdrawal path | Node service |
| Ledger | Off-chain source of truth mapping user ↔ deposit wallet ↔ balance/positions, reconciled to on-chain | Postgres |

---

## Accounting & ledger rules

1. **On-chain truth for user funds is two-sided**: the Celo Deposit Contract records what
   each user put in / took out (auditable, Proof-of-Ship activity); the user's Polygon deposit wallet
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
- Each Celo address maps deterministically to one Binary-managed Polygon signer + deposit wallet.

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

**Phase 0 — broker spike. ✅ DONE 2026-07-13 (real money, all legs measured).** Proved the
full courier round-trip for one server-managed user, no UI: managed signer → deposit
wallet deploy (gasless 5 s) → fund (USDm → rails → USDC.e → pUSD wrap) → **real $1 order
filled in 1.6 s** → sell (1.4 s) → withdraw landed as USDm on Celo in 66 s. Results in
`docs/RUNBOOK.md`; scripts `phase0/` 00–13.

**Phase 1 — MiniPay MVP.** MiniPay Mini App shell (implicit connect, no connect button);
Celo Deposit Contract (built, 10 tests green — deploy it); per-user managed signer +
deposit-wallet auto-provision on first open; funded-balance top-up with honest pending
states (fast-rail batching, no buffer needed); live odds via Polymarket WS; tap-to-bet
(instant, gasless, **fee-aware payout previews**); positions; cash-out; withdraw.
Curated liquid markets (feed exists — add per-market fee rate + tick size).
Port phase0 legs 10–13 into the funding state machine (`src/lib/funding/`) as
idempotent executors with the multi-RPC tx sender.

**Phase 2+ — see Future versions.**

## Phase 0 exit criteria — ALL CLOSED 2026-07-13 (real-money run, see docs/RUNBOOK.md)

- [x] **Broker round-trip works** end-to-end for a fresh server-managed user: deposit
      wallet deploy → fund → **real $1 order filled in 1.6 s** → sell (1.4 s) → withdraw
      landed as USDm on Celo in 66 s. Full cycle USDm→bet→USDm with real funds.
- [x] ~~CCTP~~ Celo is not a CCTP domain (2026-07-10). Rails measured 2026-07-13.
- [x] **Mesh latency measured:** hop1 23 s, hop2 **1,146 s (~19 min)** → mesh demoted to
      bulk/cheap rail; Squid batches ($50+ floor) are the interactive rail; **buffer
      (layer 3) resolved: not needed at launch.**
- [x] **Contract set is CLOB V2** (discovered live): collateral **pUSD**
      `0xC011a7E1…2DFB` + on/offramps; exchanges V2/V3; `clob-client-v2`;
      EIP-1271 deposit wallets replace type-2 Safes for new makers; orders carry
      bytes32 BUILDER_CODE; per-market trading fees (1000 bps schedule) are live.
- [x] **Builder terms + geoblock:** creds issued and working; no blocking issue found
      (Jadon's research, 2026-07-13).
- [x] **Real round-trip cost measured** at $1.50 scale: rails ≈ 0.5–0.9% + fixed fees;
      dominant real cost is the **CLOB trading fee** (~$0.061 on a $1 exit). Floors:
      deposits batch to ≥$50; fixed fees (~$0.55 POL/Squid call + LZ msgs) set the
      batch economics, not the user minimum.
- [x] Custody model = per-user Binary-managed deposit wallets, trade-or-return-only,
      pinned payout address. Collateral = pUSD (verified on-chain).

## Future versions

- **Operating float** (needs capital): a working pool fronts the bridge so even top-up is
  instant; replenished by users' inbound funds. Slots in with no user-facing change.
- **In-app top-up UX**: MiniPay pocket-swap deep links; recurring balance.
- **Limit orders, full catalog browse** (v1 is a curated feed + market orders).
- **Streaks, shareable win cards, leaderboards** (retention; the blue/dot-matrix design).
- **Progressive decentralization** of custody if/when Polymarket enables MiniPay-signable flows.
