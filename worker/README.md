# Binary funding worker

Long-running Node service that moves user money between Celo and Polymarket.
It watches `BinaryDeposits` on Celo, turns every `Deposited` event into a job,
and drives each job through the funding state machine (`src/lib/funding`)
using the rails measured in the phase-0 money run.

Not part of the Next.js app — runs wherever the operator runs it:

```bash
npm install
npm start          # poll loop (FUNDING_POLL_MS, default 15 s)
npm run once       # single cycle, for cron or manual ops
npm run jobs       # list all jobs and their states
npm run withdraw -- <celoAddress> <usd>   # queue a withdrawal
```

## Rails

| Flow | Path |
|---|---|
| Deposit (fast, default) | sweep → Squid/LI.FI Celo USDm → Polygon USDC.e (~66–90 s) → wrap pUSD into the deposit wallet |
| Deposit (`FUNDING_RAIL=mesh`) | sweep → Mento USDm→USDT → USDT0 hop1 (Arb) → hop2 (Polygon, ~19 min) → USDT→USDC.e → wrap |
| Withdrawal | unwrap pUSD → USDC.e (gasless) → Squid Polygon → USDm on Celo (~66 s) → `payout()` |
| Netted pairs | never bridge — deposit's USDm pays the withdrawal on Celo, withdrawer's pUSD credits the deposit |

## Environment

Reads `Binary/.env` first, then `phase0/.env.local` for anything not set:
`BINARY_KEY`, `DEPOSITS_CONTRACT_ADDRESS`, `POLYGON_RPC_URL`, `CELO_RPC_URL`,
`ARBITRUM_RPC_URL`, `POLYMARKET_BUILDER_API_KEY/SECRET/PASSPHRASE`,
`BUILDER_CODE`, and either `CLOB_API_KEY/SECRET/PASSPHRASE` +
`DEPOSIT_WALLET_ADDRESS` or a phase0 `.state.json` holding them.

The operator EOA needs gas on all three chains: CELO, a little Arbitrum ETH
(mesh only), and POL (Squid legs carry ~0.54 POL native fee each).

## State

`worker/.jobs/` (gitignored): one `*.job.json` per job (atomic writes — a
crash resumes exactly where the machine stopped), `cursor.json` for the last
scanned Celo block, and `journal.log`, an append-only trail written before
every money-moving call for operator reconciliation. Failed jobs park as
`FAILED` after 5 attempts and are never retried silently.
