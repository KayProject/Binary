# Binary

**Machine-payable prediction-market rails on Celo — and Δ (Delta), the autonomous agent that trades on them.**

Binary is a MiniPay-native prediction market that routes real money into Polymarket's order book. It is also an API that a robot can pay for, per request, without an account, an API key, or an invoice. Those two sentences describe one system: **human liquidity and machine liquidity moving through identical rails, both settling on-chain, both auditable by a stranger with a block explorer.**

That second customer — the machine — is what makes this DeFAI rather than a DeFi app with a chatbot bolted on.

```
Δ = q − p        no gap, no bet
```

---

## Table of contents

- [The thesis](#the-thesis)
- [Why DeFAI, specifically](#why-defai-specifically)
- [Delta — the agent](#delta--the-agent)
  - [The estimator is a pure function](#the-estimator-is-a-pure-function)
  - [Strategies and their tombstones](#strategies-and-their-tombstones)
  - [Promotion is arithmetic, not vibes](#promotion-is-arithmetic-not-vibes)
  - [Where an LLM is allowed to stand](#where-an-llm-is-allowed-to-stand)
  - [Live results](#live-results)
- [The machine-payable layer (x402)](#the-machine-payable-layer-x402)
  - [The SLA — the 1¢ that refunds itself](#the-sla--the-1-that-refunds-itself)
- [The human side](#the-human-side)
- [On-chain surface](#on-chain-surface)
- [Architecture](#architecture)
- [The deposit pipeline](#the-deposit-pipeline)
- [Betting and the payout loop](#betting-and-the-payout-loop)
- [The worker](#the-worker)
- [API reference](#api-reference)
- [Repository layout](#repository-layout)
- [Running it](#running-it)
- [Configuration](#configuration)
- [Failure modes and what protects each](#failure-modes-and-what-protects-each)
- [Verifying any of this yourself](#verifying-any-of-this-yourself)
- [Status, honestly](#status-honestly)
- [How we count volume](#how-we-count-volume)
- [Glossary](#glossary)

---

## The thesis

Three decisions shaped everything else.

**1 · Be a broker, not a bookmaker.** The naive build sets its own odds, takes bets, and pays winners from a house pot — which makes you the counterparty, and demands a licence, a risk desk, and users who trust you. Binary instead routes every real bet into **Polymarket's order book**. The odds a user sees are real market prices. A $1 bet is a real position in a real book. The hard problem stops being betting logic and becomes **money transport between two chains** — Celo, where the users live, and Polygon, where the liquidity lives. Most of this codebase exists to make that transport safe.

**2 · MiniPay-native.** MiniPay is a wallet inside Opera Mini used by millions across Africa. Its users are not DeFi people: no seed-phrase gymnastics, no network switching, no gas token (Celo lets you pay gas in the stablecoin itself). So a user signs **at most two kinds of transaction, ever**: a free-play pick, or a deposit. Bridging, order placement, settlement, and payouts are the server's problem. And money that leaves a user's wallet can only ever return **to that same wallet** — enforced on-chain, not by policy.

**3 · Auditability over promises.** Every value-moving transaction Binary or Delta signs carries an ERC-8021-style attribution tag (`celo_22480bd47654`) appended to the calldata. The EVM ignores trailing bytes, so contracts behave normally, but any indexer can attribute the transaction. A stranger can reconstruct the entire economic history — deposits, payouts, agent micropayments, refunds — without trusting a word of this README.

---

## Why DeFAI, specifically

"AI agent" usually means an LLM with a wallet, improvising trades from a prompt. That design has three failure modes baked in: it cannot be replayed, it cannot be falsified, and it will happily narrate a losing strategy as a winning one.

Binary and Delta take the opposite position on all three:

| Common DeFAI pattern | What Binary/Delta do |
|---|---|
| LLM decides the trade | **Arithmetic decides the trade.** An LLM is 500 ms–5 s; a 5-minute market does not wait. `q` is a pure function. |
| LLM reads its own logs and tunes itself | **An LLM may propose. It may never promote.** Promotion is counts and calibration on time-split held-out data. |
| Agent pays for data with an API key on a corporate card | **The agent's wallet is the account.** Per-request payment over x402, settled on-chain, gasless for the buyer. |
| Agent identity is a name in a config file | **ERC-8004 on-chain identity #9689**, wallet `0xC2A4…74E9`. |
| "Volume" is whatever the dashboard says | Every dollar of agent volume has a real Polymarket position or a real settled micropayment behind it. |

The interesting claim isn't that an agent can trade. It's that **an agent can be a paying customer of a financial API on open rails** — discovering the price, paying it, and being served, with no relationship established in advance. That is what x402 makes possible and what Delta exercises for real.

---

## Delta — the agent

Delta lives in its own repo (`KAYPROJECT/Delta`), holds its own capital, has no users and takes no deposits. It hunts mispriced Polymarket 5-minute crypto up/down contracts and executes through Binary's rails, adding **no new execution path of its own**.

Its founding premise is a warning about itself:

> The price already contains every chart Delta can see. Same information as the market = same estimate = `Δ = 0` = no bet. **Edge requires knowing something the price doesn't, not knowing a lot.**

`Delta/docs/SPEC.md` records **four dead ends** permanently, because each is seductive enough to come back:

| Dead end | Why it stays dead |
|---|---|
| Predict direction from indicators | The price read the same chart. The most fun to build; the most certain to produce nothing. |
| Optimise for win rate | Win rate is a **dial, not a score**. Buy 95¢ favourites → win 95% → make $0. An agent told to maximise win rate *will* discover this and bleed rails costs behind a beautiful dashboard. |
| Be the house | Cold-start liquidity is the exact problem Polymarket's book solves for free. |
| "The ~1.75% taker fee kills everything" | False, and measured: buys are free, redemption is free, only early exit is charged. |

That last row is load-bearing. Measured against real fills: **`$1 at ask 0.389 delivered exactly 1/0.389 shares`**, and redemption pays $1/share with no fee. Fees bite only on sells — `fee = (feeRateBps/10⁴) · (p(1−p))^exp · shares`, using Gamma's `takerBaseFee`, *not* `feeSchedule.rate`. The consequence is a strategy constraint, not a preference: **Delta buys and holds to resolution.** Selling early is an exception requiring a logged reason.

And the trap the whole spec exists to avoid, in four lines:

```
Favourite at 82¢:   ~4.08 wins  × +45¢  = +$1.84
                    ~0.92 losses × −$2.00 = −$1.84
                    ────────────────────────────────
                    Net $0.  Four wins out of five, zero profit.
```

### The estimator is a pure function

```
(market state, spot, clock) → q        no I/O · no randomness · no network
```

This is not a style preference. It is the single property that lets **identical code** run over history and run live — which is the only thing that makes a paper result mean anything. Sizing is half-Kelly, always:

```
f = ½ · (q − p) / (1 − p)          capped at 2% of bankroll
```

Half, not full, because full Kelly assumes `q` is exactly right; it won't be, and full Kelly on a wrong `q` sizes into ruin with total confidence. And critically: **`Δ ≈ 0` → stake $0.** Boredom trades are arithmetically impossible. There is no floor-raising hack that lets it trade anyway, and adding one is the defect this codebase is most alert to.

### Strategies and their tombstones

**`both-sides-under-one`** — if `Up.ask + Down.ask < $1.00`, resolution pays $1 whichever way it goes. `q` isn't estimated here; it's subtraction. It works *only* because buys and redemption are both fee-free — there is no fee leg anywhere. It prices from the **CLOB order book**, never Gamma: Gamma's `outcomePrices` are a normalised mid that sums to 1 by construction and therefore can never reveal an arb. Sizing is deliberately not Kelly — the edge is near-riskless, so the binding constraint is leg-miss risk, not variance. On a missed leg: hold, log, **do not chase**.

**`favourite-bias`** — the hypothesis, committed to git *before it saw a single row of data*: phone bettors overpay the favourite, so the underdog is underpriced by ~3¢. Fade the favourite. It also refuses its own signal when the leg's spread exceeds the edge — that edge was an artefact of the mid, not something a real fill captures.

Strategy 2 (late-window repricing) needs a spot feed and low latency; deferred. Strategy 4 (indicator-based direction prediction) is listed in the spec **solely to keep it explicitly out of scope**.

### Promotion is arithmetic, not vibes

"It learns" means exactly one thing here: **stake is a function of evidence and nothing else.**

```
REGISTERED ──► PAPER ──► PROBATION ──► LIVE
                 ▲                       │
                 └─────── demoted ───────┘
```

| Transition | Gate |
|---|---|
| REGISTERED → PAPER | Estimator committed to git **before** it sees data. A rule invented after looking at data always fits that data. |
| PAPER → PROBATION | ≥ **1,000 resolved decisions** · `pnl_per_bet` > 0 over the full sample · calibration holds per bucket · positive on data **split by time** (random splits leak the future into the past) |
| PROBATION → LIVE | Quarter stake · ≥ 200 resolved live bets · `pnl_usd` not far below `pnl_if_paper` |
| LIVE → demoted | Drawdown limit **or** broken calibration **or** negative `pnl_per_bet` over trailing 200. **Automatic, immediate, no manual override.** |

Every decision is recorded — **including skips**, because a skip is a prediction, and the filter is the part most likely to be wrong. `pnl_usd − pnl_if_paper` is the true cost of execution and the only number that ever reveals whether paper was honest. Aggregates are rebuilt from raw rows nightly, never patched in place: an aggregate that can't be recomputed from scratch is where bugs hide and history gets quietly rewritten.

Failed strategies are **tombstones, never deleted**. Deleting failures is how a hit rate becomes a lie.

The risk framework names its largest uncontrolled risk explicitly, and it isn't the market:

> **The operator is the largest uncontrolled risk.** The bot cannot revenge-trade — half-Kelly on `Δ = 0` stakes $0. But a human restarting it with new parameters after a red day is the same impulse wearing an engineer's hat.

Hence: config changes require a git commit **plus a 24-hour delay**; live PnL is readable once a day, not on an always-open dashboard; demotion fires automatically and there is no override, because the moment you want one is the moment you shouldn't have one.

### Where an LLM is allowed to stand

This is a DeFAI system with a deliberately small blast radius for the AI part. The placement is enumerated rather than left to judgement:

| Task | Allowed? | Why |
|---|---|---|
| Deciding a trade | **No** | `q` is arithmetic. An LLM is 500 ms–5 s, and a 5-minute market does not wait. |
| Promoting a strategy from logs | **No** | It will find beautiful stories in 50/50 noise and write them into config. **If an LLM can promote, it will eventually promote luck.** |
| Proposing hypotheses a human then registers and tests | Yes | Cheap, and the evidence gate catches bad ones. |
| Parsing market rules text, narrating a dashboard | Yes | No money moves on the output. |
| Writing this codebase | Yes | Reviewed like any other code. |

**An LLM may propose. It may never promote.** Promotion is counts and calibration on time-split held-out data, and nothing else. The agent's autonomy is real — it decides, sizes, pays, and trades without a human in the loop — but that autonomy runs on arithmetic whose every input and output is recorded and replayable. Autonomy and auditability are not in tension here; the second is what makes the first defensible.

### Live results

From the Phase 0 harness, recomputed from raw rows:

```
━━ both-sides-under-one v1 ━━
decisions 191   bets 45   resolved 45   avg-Δ 0.0442
pnl $43.87      pnl/bet $0.9749         pnl/$staked 0.0487
reasons: NO_ARB:87  NO_BOOK:59  BET:45
gate: PENDING (45/1000)

━━ favourite-bias v1 ━━
decisions 299   bets 294  resolved 294  avg-Δ 0.0249
pnl −$851.42    pnl/bet −$2.8960        pnl/$staked −0.1557
gate: PENDING (294/1000)
```

The calibration table is the real product of this system:

| q-bucket | n | predicted | actual |
|---|---:|---:|---:|
| 0.05–0.10 | 12 | 0.074 | **0.000** |
| 0.25–0.30 | 23 | 0.275 | 0.217 |
| 0.35–0.40 | 58 | 0.376 | **0.241** |
| 0.40–0.45 | 81 | 0.428 | 0.370 |
| 0.45–0.50 | 63 | 0.466 | 0.397 |

Actual lands below predicted in **every populated bucket** — systematic overconfidence, not noise. The favourite-bias hypothesis is falsified. It stays in paper, it stays in the registry as a tombstone, and −$851 of paper money is the entire price of finding out. That is the harness working exactly as designed: most strategies take months to discover they're worthless, and 5-minute windows bank a thousand decisions in under a week.

---

## The machine-payable layer (x402)

HTTP has always had `402 Payment Required` with nothing behind it. The x402 protocol fills it in: the server answers 402 with machine-readable payment requirements, the client's wallet signs a stablecoin micropayment, a facilitator settles it on-chain, and the retried request passes. **No accounts, no API keys, no invoices — the wallet is the account.**

Binary meters two endpoints:

| Endpoint | Price | What it sells |
|---|---|---|
| `GET /api/broker/quote` | **$0.001** | Live CLOB top-of-book for one outcome token |
| `POST /api/delta/insight` | **$0.01** | Spread, depth at the touch, the book's vig, implied probability, decidedness — plus an SLA quote |

Settlement runs through the **Celo facilitator** (`api.x402.celo.org`), which verifies and then relays the transfer — gasless for the buyer, paid straight to the ops address with no intermediary hop.

**One asset note that matters, because it is the only place in the system that isn't USDm:** the metered fees settle in **USDC on Celo** (`0xcebA…118C`, 6 decimals). The `exact` scheme pulls funds via ERC-3009 `transferWithAuthorization`, which is what makes the payment gasless. cUSD/USDm does not implement ERC-3009 — verified on-chain, the typehash probe reverts — so a gasless x402 pull in USDm is impossible. Any wallet paying for Binary's API, Delta's included, must hold Celo USDC. Deposits, payouts, and SLA refunds all remain USDm.

The loop is real and verifiable, not a diagram. One settled call:

```
0.001 USDC   0xC2A4…74E9 (Delta)  →  0x3a3a…Cfe0 (Binary ops)
tx 0x03f9b06f1189fb17…   Celo mainnet
```

A deliberate honesty rule governs what the paid endpoint returns: **we sell Delta's measurements, never its trading signal.** Selling the signal would degrade the very edge that makes the volume real.

### The SLA — the 1¢ that refunds itself

Every paid insight response carries a short-lived quote: `{quoteId, quoted asks, expiresAt}`. Bet through `/api/bets` with that `quoteId` inside the window, and if the fill lands **more than 1¢ worse than the quoted ask**, the 1¢ fee is automatically refunded — a tagged USDm transfer from the same address the fee settled to.

It is ungameable by construction: both facts — the quoted ask and the actual fill — are **server-side observations**. There is no user claim, no dispute flow, nothing to lie about. Guards: a quote refunds at most once (`active → refunding → refunded`, and `refunding` is never auto-retried), plus a per-wallet daily cap. Verified live — a deliberately tripped quote refunded a real tagged 1¢ on-chain; expired and fair-fill quotes refuse; a re-run refuses.

The 1¢ is not a fee. It's a price guarantee: *if what we told you turns out stale, it was free.*

---

## The human side

The same rails, wearing a phone UI.

**Three tabs.** *Markets* — a curated Polymarket feed with floors on liquidity, volume, and spread, so a $2 bet doesn't get eaten by a thin book. *Portfolio* — balance, top-up, withdraw, and chain-sourced play history. *You* — streaks, XP, weekly recap, leaderboard.

**One bet sheet, two doors,** chosen by a single boolean (`funded = net deposits > 0`). The unfunded door plays for XP — a real on-chain `pick()` transaction, no money. The funded door offers stake chips, an honest payout preview, the **Ask Delta · 1¢** button, and Place Bet.

The design rule visible everywhere: **the server holds the keys, the routes hold the checks.** The user signs nothing except their own deposits and picks, and every server-side money action re-verifies state on-chain before moving anything.

---

## On-chain surface

Three small Celo contracts, deliberately boring. Complex logic lives off-chain where it can be fixed; contracts hold only the invariants that must be unbreakable.

| Contract | Address | Role |
|---|---|---|
| `BinaryDeposits` | `0xE75A70597501453Fb0DFBa9B34eA2b9495d67600` | The money door — deposits in, payouts out |
| `BinaryPlay` | `0x1CfbEa228F37A139cD805f15291D19f7DBBF7426` | Free play: check-ins and picks |
| `BinaryFaucet` | `0x857bd8d1f94dde5bb38d1acf47fe39df6a058fb5` | Whitelist-gated $5 welcome drip |

```solidity
deposit(amount)        // anyone: pulls USDm in, emits Deposited, records totalDeposited[user]
payout(user, amount)   // owner only: sends USDm out — REVERTS if totalDeposited[user] == 0
sweep(amount)          // owner only: moves deposits onward into the bridging pipeline
```

`payout` refusing any address that has never deposited is the **trade-or-return invariant**. The server can pay any *amount* — winnings legitimately exceed deposits — but only ever to a prior depositor. A stolen server key cannot redirect a user's withdrawal somewhere else.

The invariant has one sharp edge, and it is handled rather than ignored: USDm sent *directly* to the contract, bypassing `deposit()`, emits no `Deposited` event, credits nothing, and can never be refunded by `payout` — the protection locks that sender out permanently. So Delta runs a **treasury watcher** that detects those orphans by a pure public-log diff (a Transfer into the contract with no `Deposited` in the same transaction), records them, and refunds from the treasury with the same attribution tag. Guards: a dust floor, a manual-review cap, and per-tx idempotency.

---

## Architecture

```
   CELO — the lobby                      POLYGON — the trading floor
   ┌──────────────────┐                  ┌──────────────────────┐
   │ MiniPay user     │                  │  Polymarket CLOB     │
   │ Delta 0xC2A4     │                  │  deposit wallet      │
   │ BinaryDeposits   │                  │  (EIP-1271)          │
   └────────┬─────────┘                  └──────────┬───────────┘
            │                                       │
            │        ┌──────────────────┐           │
            └───────►│   THE WORKER     │◄──────────┘
                     │  bridge legs,    │
                     │  settlement      │   runs on GitHub Actions
                     └────────┬─────────┘   (15-min cycles) or any laptop
                              │
                     ┌────────▼─────────┐
                     │  Vercel Blob     │  ledger · registry · jobs · SLA quotes
                     └──────────────────┘

   THE APP — Next.js on Vercel · x402-metered API · the only public surface
```

Celo is the lobby, Polygon is the trading floor, the worker is the courier running between them, and Blob is the courier's clipboard.

Delta's own loop sits alongside:

```
 FEED (always on)            ESTIMATOR              SIZING
 CLOB /book        ──►  (market, spot, clock)  ──►  Δ = q − p
 Gamma (windows)         → q   [PURE FUNCTION]      f = ½(q−p)/(1−p)
 x402 paid quote                                    Δ ≈ 0 → stake $0
                      ┌──────────────────────────────────┤
                      ▼                                  ▼
          PAPER → Postgres                   RISK GATE → EXECUTOR
          (every window, bet or skip)         (Binary rails, hold to resolution)
```

**Stack.** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · viem · thirdweb (x402) · Privy · Polymarket CLOB v2 · `@celo/attribution-tags`. Delta: TypeScript/Node · Postgres · Polymarket CLOB + Gamma.

---

## The deposit pipeline

The single hardest UX problem in the product: the user's money is on Celo, and the order book is on Polygon. The naive answer — *make the user bridge* — is a funnel-killer. Binary's answer is a **funding state machine** driven by the worker.

```
User taps "Top up $5"
  → approve(USDm, exact) + deposit(5)        [user signs; ~seconds; tagged]
  → Deposited event on Celo
  → worker sees event → creates a DepositJob (id = chainId:txHash:logIndex)
  →  RECEIVED  sweep the needed USDm from the contract to the operator
  →  BRIDGED   one Squid/LI.FI call, Celo USDm → Polygon USDC.e   (~60–120s, ~0.2%)
  →  CREDITED  wrap USDC.e → pUSD directly into the deposit wallet
User sees "MONEY'S IN"; funded flag flips; the bet sheet shows the funded door
```

Each property here exists because of a specific way this goes wrong:

- **Job ids are `chainId:txHash:logIndex`** — replay-safe by construction. Re-scanning a block range can never double-create a job, so the watcher may crash and resume freely.
- **A state machine with a legal-transition table**, not one long function. Every leg is independently resumable, retried up to five times, then **parks in `FAILED` for a human**. Money never silently evaporates inside a half-run script.
- **The journal.** Before *every* money-moving call, one line is written: time, job, action. If the process dies between sending a transaction and saving state, the journal is the reconciliation trail. It is append-only, one blob per entry, so appends can never race.
- **Netting.** If a deposit and a withdrawal are both pending, they are matched and *neither crosses the bridge* — the depositor's USDm funds the withdrawal directly on Celo, and the withdrawer's surrendered pUSD credits the depositor on Polygon. Two bridge fees saved, minutes collapsed to seconds.
- **Two rails.** A fast rail (single Squid call) for interactive deposits; a cheap multi-hop rail (Mento → USDT0 mesh, ~20 min) reserved for bulk treasury rebalancing.

What the user actually experiences: they tap top-up, sign once, and watch a three-step tracker — *confirm → crossing → money's in* — which they are free to close, because the app lights up on its own when credit lands about two minutes later. That tracker exists because of user feedback: a silent two-minute wait feels exactly like lost money.

> **Ada, Lagos.** She has $7 USDm in MiniPay. She taps a market, sees the XP door, taps *Top up*, enters $5. MiniPay pops twice — approve, deposit — and she confirms both. The header pill pulses `+$5.00…`. She keeps browsing. Ninety-five seconds later the screen takes over: **MONEY'S IN — $5.00. Every bet is a real order in Polymarket's book.** Behind it: a `Deposited` event, a job, a sweep, a Squid bridge, a pUSD wrap, five journal lines, every transaction tagged.

---

## Betting and the payout loop

This is the part most builds in this category never finish.

**Placing the bet** — `POST /api/bets {user, tokenID, usd, conditionId, quoteId?}`:

1. **Gate 1 (Celo).** Does the user's net deposit cover the stake? No → `402`.
2. **Gate 2 (Polygon).** Does the deposit wallet actually hold enough credited pUSD? No → `409 deposit still funding` — an honest in-flight state, deliberately not an error.
3. Place a **fill-or-kill market buy** on the CLOB. FOK because a phone user must get *"you're in at 34¢"* or *"didn't go through"* — never a lingering half-filled order they can't reason about.
4. **Write the bet to the ledger** — one JSON blob per bet, keyed by `orderID`: `{user, tokenID, conditionId, usd, price, shares, status: "open"}`.

The ledger is sacred, and the reason is structural: **Binary trades from one shared wallet**, so Polymarket has no idea which Binary user owns which position. If attribution isn't recorded at fill time, it does not exist anywhere in the universe. The write happens *after* the fill and is fire-safe — a storage hiccup logs loudly but never fails a filled order. The money already moved; the record must chase it, not block it.

**Settlement** — every worker cycle runs a settle pass:

1. Load all `open` bets from the ledger.
2. Ask Gamma which of those markets have closed. `closed=true` **is** the resolution check — what comes back has settled.
3. Read the outcome with degenerate-case guards first. A market can resolve `["0","0"]` — *no winner at all*. This happened live on the Biden-coronavirus market. A naive `price > 0.5 → won` scores a void as a loss for every participant, so voids are detected before win/lose logic ever runs.
4. **Losers and voids** are marked in the ledger. Done.
5. **Winners**: `winnings = shares × $1`. The bet flips `open → paying` and a withdrawal job is queued with id `settle:<orderID>` — idempotent by construction.

**The bridge-back** reuses the same rails, reversed:

```
REQUESTED   unwrap pUSD → USDC.e (gasless relayer batch, deposit wallet → operator)
UNWRAPPED   bridge Polygon → Celo (one LI.FI call, USDC.e → USDm, ~66s measured)
BRIDGED     top up the BinaryDeposits contract, then payout(user, amount)   [tagged]
PAID        terminal; ledger flips paying → settled with the payout tx hash
```

The user's phone shows **PAID OUT — $X. Back in your wallet — the same one it came from. Always.** That moment is fired by a detector watching their on-chain cumulative-payout counter rise, so it is triggered by chain truth rather than by our own optimism.

**Why `paying` is a one-way street:** if a payout transaction's fate is unknown — a crash mid-send — the bet stays in `paying` and is **reported for a human, never auto-retried**. Retrying an unconfirmed money-send is precisely how double-payouts happen. This single rule is the difference between a toy and something you can put strangers' money into.

> **Ada wins.** She put $2 on NO at 40¢ — five shares. Two days later the market resolves NO. Within fifteen minutes a worker cycle sees the market closed, sees her bet won, queues `settle:0xORDER…`, unwraps $5 pUSD, bridges to Celo, calls `payout(ada, $5)`, and flips the ledger to `settled` with the transaction hash recorded. Her phone: **PAID OUT — $5.00.** She never knew Polygon existed.

---

## The worker

A ~900-line TypeScript daemon: scan deposits → net → drive job legs → settle. It originally ran on a laptop with file-based state, which meant **payouts only happened while that laptop was on**. That was fixed by moving *all* state to Vercel Blob:

| Blob path | Contents |
|---|---|
| `worker/jobs/*.job.json` | Every job, one blob each |
| `worker/cursor.json` | Last Celo block scanned |
| `worker/journal/*` | Append-only money log, one blob per entry |
| `worker/lock.json` | The run lease |

Because state is shared, **any machine can run a cycle.** A GitHub Actions workflow (`.github/workflows/worker.yml`) runs one every 15 minutes for free, and a laptop can simultaneously run `npm start` on 15-second polls for fast interactive sessions. A 30-minute **run lease** plus the workflow's concurrency group keeps exactly one runner active: two cycles driving the same money leg is how money moves twice, so single-runner is a hard rule, enforced in two independent places.

**Three Blob behaviours that bit us and will bite you:**

1. **Overwrites propagate slowly and the CDN pins reads for ~60 s.** Every read of mutable state must be cache-busted with `?v=<now>`. Forgetting this makes a settle sweep re-read a bet it just paid as still open.
2. **Blob has no compare-and-swap**, so the lock is a *lease*, not a mutex. It shrinks the overlap window; idempotent job ids and idempotent legs close the rest.
3. **One blob per record, never a shared JSON map.** Concurrent writers to a single map silently drop each other's entries.

---

## API reference

| Route | Purpose | Guard |
|---|---|---|
| `GET /api/markets` | Curated Gamma feed | public |
| `GET /api/markets/[slug]` | Single market detail | public |
| `POST /api/registry` | Record `conditionId → marketId` at pick time | shape validation; server derives the key |
| `POST /api/bets` | Place a real CLOB order for a funded user | net-deposit check (402) + credited-balance check (409) |
| `POST /api/withdraw` | Pay withdrawable balance back to the user's own wallet | server balance check; contract pins destination |
| `GET /api/account` | `{configured, creditedUsd}` | public read |
| `GET /api/plays` · `GET /api/leaderboard` | Chain-sourced history and rankings | public |
| `GET /api/settle` | Manual settlement fallback (the worker owns the automated path) | `CRON_SECRET` bearer |
| **`GET /api/broker/quote`** | **Live top-of-book — $0.001** | **x402 or 402** |
| **`POST /api/delta/insight`** | **Full market read + SLA quote — $0.01** | **x402 or 402** |

Try the paywall yourself — no key, no account:

```bash
curl -i "https://binary-io.vercel.app/api/broker/quote?token_id=1"
# HTTP/2 402
# {"x402Version":2,"accepts":[{"scheme":"exact","network":"eip155:42220",
#   "maxAmountRequired":"1000","asset":"0xcebA9300f2b948710d2653dD7B07f33A8B32118C", …}]}
```

---

## Repository layout

```
Binary/
├── src/
│   ├── app/                    Next.js App Router
│   │   ├── page.tsx            landing
│   │   ├── app/page.tsx        the product (Markets · Portfolio · You)
│   │   └── api/                see API reference above
│   ├── lib/
│   │   ├── broker.ts           order placement against the CLOB
│   │   ├── chain.ts            Celo addresses, clients, attribution tagging
│   │   ├── payout.ts           the payout path
│   │   ├── insight.ts          the measurements sold by /api/delta/insight
│   │   ├── x402.ts             the payment gate (402 challenge, verify, settle)
│   │   ├── bets/ledger.ts      one blob per bet — the attribution record
│   │   ├── delta/quotes.ts     SLA quote store (active → refunding → refunded)
│   │   ├── delta/refund.ts     the SLA auto-refund decision and execution
│   │   ├── funding/machine.ts  deposit state machine + legal transitions
│   │   ├── funding/netting.ts  deposit/withdrawal matching
│   │   ├── play/               free play: board, events, grading, registry, XP
│   │   └── polymarket/         gamma, fees, types
│   └── components/             Globe, Leaderboard, Logo, moments, WalletProvider
├── contracts/src/              BinaryDeposits · BinaryPlay · BinaryFaucet(V2)
├── worker/                     the daemon: watch · executors · rails · settle · store
├── phase0/                     the original walking skeleton, kept for reference
├── docs/                       ARCHITECTURE · PHASE0 · RUNBOOK
└── .github/workflows/worker.yml   a worker cycle every 15 minutes
```

---

## Running it

```bash
npm install
npm run dev       # dev server
npm run build     # production build
npm run lint
```

Contracts are Foundry, under `contracts/`. The worker is its own package:

```bash
cd worker && npm install && npm start      # 15-second polls; safe alongside the Actions cycle
```

Delta is a separate repository — `KAYPROJECT/Delta`:

```bash
npm run db:init   # create the decisions + registry tables
npm run feed      # always-on recorder: discover windows, price both legs, decide, write
npm run grade     # grade resolved windows from Polymarket's own settlement
npm run report    # per-strategy pnl/bet, reason breakdown, calibration, gate status
```

Delta's x402 leg is optional — the recorder runs fine without it, and decisions never depend on the bought quote. When enabled, every outcome is counted and the tally prints on a heartbeat, because **an unpaid quote that fails quietly looks exactly like a paid one from the outside.** That is not hypothetical: an entire recorded run once bought zero quotes against an unfunded wallet and said nothing about it.

---

## Configuration

Server-side only; the app is inert and answers `503` rather than misbehaving when a subsystem is unconfigured.

| Variable | Used for |
|---|---|
| `BINARY_KEY` | The ops EOA — owner of the contracts, signer for payouts and SLA refunds |
| `DEPOSITS_CONTRACT_ADDRESS` · `PLAY_CONTRACT_ADDRESS` | Celo contract addresses |
| `DEPOSIT_WALLET_ADDRESS` | The EIP-1271 trading wallet on Polygon |
| `CLOB_API_KEY` · `CLOB_API_SECRET` · `CLOB_API_PASSPHRASE` | Polymarket CLOB credentials |
| `POLYGON_RPC_URL` | Polygon reads/writes (config-only swap when a provider dies) |
| `X402_PAYTO` · `X402_FACILITATOR_KEY` | The x402 gate — payee address and facilitator credits |
| `BLOB_READ_WRITE_TOKEN` | Ledger, registry, jobs, journal, SLA quotes |
| `CRON_SECRET` | Bearer guard on the manual `/api/settle` fallback |
| `BUILDER_CODE` · `BUILDER_ADDRESS` | Attribution tagging |

Delta reads `DATABASE_URL`, `DELTA_ASSETS`, `DELTA_BANKROLL_USD`, `DELTA_POLL_SECONDS`, `DELTA_MIN_DELTA`, and — for the paid leg — `THIRDWEB_CLIENT_ID`, `AGENT_KEY`, `X402_QUOTE_URL`. `TREASURY_KEY` arms the orphan-refund watcher; without it the watcher is detection-only.

Full internals: `docs/ARCHITECTURE.md`, `docs/PHASE0.md`, `docs/RUNBOOK.md`, and `Delta/docs/SPEC.md`.

---

## Failure modes and what protects each

| Failure | Protection |
|---|---|
| Server key stolen | `payout()` only pays prior depositors — worst case is griefing, never theft of user funds to an arbitrary address |
| Worker crashes mid-bridge | Journal written before every money move, resumable state machine, idempotent job ids |
| Same bet paid twice | Ledger status machine (`open → paying → settled`), settle-job id derived from `orderID`, single-runner lease, and the manual `/api/settle` demoted to a fallback and never cron'd, precisely so two payers can't race |
| Refund fired twice | Quote status machine plus a per-wallet daily cap; `refunding` is never auto-retried |
| User raw-transfers USDm to the contract | UI warning, plus the treasury watcher detects the orphan and refunds it — dust-floored, capped, idempotent |
| Blob serves stale state | Every mutable read is cache-busted; immutable records are cached forever on purpose |
| Polymarket resolves with no winner | Void detection runs *before* win/lose logic; voids never score as losses |
| A pick's `conditionId` never recorded | Counted as `ungraded`, never as a loss; the registry write at pick time is the invariant |
| An RPC endpoint dies (this happened) | Config-only swap; money-critical Celo calls use their own retrying transport |
| A strategy looks good but isn't | The evidence gate: 1,000 resolved bets, positive `pnl/bet`, per-bucket calibration — `favourite-bias` is the live proof it works |
| An agent's payments silently stop settling | Every x402 outcome is classified and counted; the first of each failure kind logs loudly, and the tally prints on a heartbeat |

---

## Verifying any of this yourself

Nothing here asks for trust.

**The paywall** — no key, no account, no relationship:

```bash
curl -i "https://binary-io.vercel.app/api/broker/quote?token_id=1"
```

**A real settled agent payment** — Delta's wallet paying Binary's ops address, on Celo mainnet:

```
0.001 USDC   0xC2A4…74E9  →  0x3a3a…Cfe0     tx 0x03f9b06f1189fb17…
```

**The contracts** — read `totalDeposited[user]` and the `Deposited` / payout event logs on any Celo explorer, at the addresses in [On-chain surface](#on-chain-surface). Deposits in and payouts out should reconcile.

**The attribution tag** — every value-moving transaction this system signs ends in the ERC-8021-style suffix for `celo_22480bd47654`. Decode the trailing bytes of the calldata to attribute any of them.

**Delta's record** — every decision, *including every skip*, is one row. `npm run report` recomputes all aggregates from those raw rows, never from a stored summary, so any number in this README can be rebuilt from scratch — including the ones that make a strategy look bad.

---

## Status, honestly

| Piece | State |
|---|---|
| Celo contracts | **Live on mainnet** since 2026-07-13 |
| Deposit → bridge → CLOB → payout loop | **Closed**, proven with real money |
| x402 metered API | **Live**, settling through the Celo facilitator |
| SLA auto-refund | **Live**, verified with a real on-chain refund |
| Treasury orphan watcher | Built; detection-only until a treasury key is armed |
| Delta Phase 0 harness | Built and proven — **currently stopped**, 45/1000 and 294/1000 against its own gate |
| Delta Phase 1 (live execution) | Not started. Gate: is `pnl_usd ≈ pnl_if_paper`? |

No Phase 0 result substitutes for Phase 1. Paper being honest is a claim that only live fills can settle, and this README does not claim it.

---

## How we count volume

Binary runs two loops, and they are **labelled as two loops**: a human loop and an agent loop. Agent activity is never presented as organic user traffic, in this README or on any dashboard, and a labelled test harness is always identified as one.

The standard that makes this checkable rather than promised: every deposit Delta makes has a real Polymarket position behind it, every data purchase is a real micropayment settled on-chain, and its identity is registered on-chain under ERC-8004 #9689. Anyone can separate agent flow from user flow themselves — the attribution tags and the agent's address are public, and the two never share a wallet.

**A bot that looks like a bot and still generates real economic activity is the whole thesis.** Volume that needs a costume to be impressive isn't worth reporting.

---

## Glossary

| Term | Meaning |
|---|---|
| **USDm** | Mento dollar — the stablecoin MiniPay users hold on Celo. 18 decimals. |
| **USDC (Celo)** | `0xcebA…118C`, 6 decimals. The x402 payment asset, and the only non-USDm asset in the system. |
| **pUSD** | Polymarket's wrapped collateral dollar on Polygon. **6 decimals** — decimal-conversion bugs are the classic failure here; grep for `10n ** 12n`. |
| **CLOB** | Central Limit Order Book — Polymarket's exchange. Prices are cents per share; a winning share redeems for $1. |
| **conditionId / tokenID** | Polymarket's identifiers for a market, and for one side of it. |
| **FOK** | Fill-or-kill: the order fills entirely right now, or cancels entirely. |
| **Gamma** | Polymarket's read API for market metadata and resolution. |
| **Bridging** | Moving value between chains — here via the Squid and LI.FI routers. |
| **EIP-1271 deposit wallet** | A smart-contract wallet on Polygon that Polymarket's relayer operates gaslessly; Binary's trading identity on the CLOB. |
| **x402** | HTTP-native machine payments — `402 Payment Required`, finally implemented. |
| **ERC-3009** | `transferWithAuthorization` — the signed-transfer standard that makes an x402 pull gasless for the buyer. USDC implements it; cUSD does not. |
| **ERC-8004** | On-chain agent identity registry. Delta is **#9689**. |
| **Attribution tag** | Bytes appended to calldata attributing a transaction to this app. Ignored by the EVM, readable by any indexer. |
| **Netting** | Matching an incoming deposit against an outgoing withdrawal so that neither crosses the bridge. |
| **Half-Kelly** | Betting half the Kelly-criterion stake — near-optimal growth with far less variance, and survivable when `q` is wrong. |
| **`q` / `p` / `Δ`** | Delta's estimate, the market's price, and the gap between them. `Δ ≈ 0` → stake $0. |
| **Calibration** | Bucketing bets by predicted `q` and checking each bucket resolved at rate `q`. The only honest test of whether `q` means anything. |
| **Tombstone** | A failed strategy kept permanently in the registry. Deleting failures is how a hit rate becomes a lie. |

---

<sub>Part of KAYPROJECT · contracts on Celo mainnet · liquidity from Polymarket on Polygon</sub>
