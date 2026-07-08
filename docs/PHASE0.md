# Phase 0 — Walking Skeleton

**Goal:** prove one fresh test user can get their own non-custodial Polymarket wallet and
place a real order — before building any product. Scripts only, no UI, ~$5–10 at risk.

Grounded in Polymarket's official `privy-safe-builder-example` (Next.js + Privy + Safe,
type-2, gasless via builder relayer). We reuse its exact flow.

## The two risky halves — tested separately

1. **Polymarket half (first):** deploy a per-user Safe, fund it directly with pUSD on
   Polygon, place & fill a real order, redeem. Proves the trading path works for a
   *newly created* wallet (the open question, given the type-3 client bug).
2. **Bridge half (second):** USDm (Celo) → swap USDC → CCTP bridge → wrap pUSD. Proves
   the funding pipeline. Decoupled so a failure in one doesn't mask the other.

## Polymarket-half steps (from the official example)

1. **EOA** — throwaway private key stands in for the Privy embedded wallet (an ethers v5
   signer). Privy's browser flow is a Phase 1 concern; the protocol test doesn't need it.
2. **Derive + deploy Safe** — `deriveSafe(eoa, SafeFactory)` (deterministic), then
   `relayClient.deploy()`. Gasless via `relayer-v2.polymarket.com`.
3. **Fund** — get a few pUSD into the Safe (buy pUSD on Polygon directly for this test;
   the Celo bridge is the second half).
4. **Approvals** — `createAllApprovalTxs()` → `relayClient.execute(...)`, one batch,
   gasless. Approves CTF + CTF Exchange + Neg-Risk Exchange + Neg-Risk Adapter.
5. **API credentials** — temp `ClobClient.createOrDeriveApiKey()` (EIP-712 signature).
6. **Place order** — authenticated `ClobClient` + builder config → `postOrder` a ~$1
   market order on a liquid market; confirm fill.
7. **Redeem/sell** — sell back or redeem after resolution; confirm pUSD returns to Safe.

**If step 6 fails for a fresh wallet** (same class as the type-3 bug): fall back to
patching the client's L1 auth to bind the API key to the funder, or engage Polymarket's
builder program. This is the whole reason Phase 0 exists.

## Known adaptations from the example

- Example uses **USDC.e** (`0x2791Bca1…84174`); we use **pUSD**. Confirm the current pUSD
  address and whether the April-28 **CTF Exchange V2** uses new contract addresses vs the
  ones below (which predate the migration). Verify against `docs.polymarket.com`.
- Contract addresses in the example (pre-pUSD, verify before use):
  - CTF: `0x4d97dcd97ec945f40cf65f87097ace5ea0476045`
  - CTF Exchange: `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`
  - Neg-Risk Exchange: `0xC5d563A36AE78145C45a50134d48A1215220f80a`
  - Neg-Risk Adapter: `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296`

## Packages

`@polymarket/clob-client` (JS v4 — the one the working example uses, NOT the buggy
py/rs v2), `@polymarket/builder-relayer-client`, `@polymarket/builder-signing-sdk`,
`ethers@5`, `viem`.

## What's needed to run it (from Jadon)

1. **Polymarket Builder API credentials** — `polymarket.com/settings?tab=builder`
   (needs a Polymarket account): `API_KEY`, `SECRET`, `PASSPHRASE`.
2. **Polygon RPC URL** — Alchemy/Infura/public.
3. **Test funds** — ~$5–10 as pUSD (or USDC to wrap) on Polygon. Trades and Safe deploy
   are gasless via the relayer, so the throwaway EOA needs little/no POL — confirm during
   the spike.

## Exit criteria

- [ ] Fresh Safe deployed for a new EOA via factory.
- [ ] Real ~$1 order placed and filled from that Safe.
- [ ] Position sold/redeemed; pUSD back in Safe.
- [ ] Celo→Polygon USDm→pUSD funding leg completes end-to-end.
- [ ] Real per-round-trip cost recorded → v1 minimum deposit floor.
