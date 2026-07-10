# Phase 0 — Broker Round-Trip Spike

**Goal:** prove Binary can, as a broker, carry ONE user's money into Polymarket and back —
end to end, with real money — before building any UI. Scripts only, ~$5–10 at risk.
This validates the whole product; everything else is UX on top of it.

Grounded in Polymarket's official `privy-safe-builder-example` (Next.js + Safe + Builder
relayer, type-2, gasless). We reuse its exact Polygon-side flow, but replace the *browser
Privy embedded wallet* with a **server-managed signer** — because our real users are on
MiniPay and cannot sign for Polygon (see `ARCHITECTURE.md`). For the spike a raw throwaway
key stands in for that managed signer.

## Two halves — tested separately, then joined

1. **Polymarket half (first, cheapest to test):** managed signer → deploy Safe → fund with
   pUSD directly on Polygon → place & fill a real ~$1 order → sell/redeem. Proves the
   trading path works for a *freshly created* wallet (the open question after Polymarket's
   April V2 upgrade).
2. **Bridge half:** USDm (Celo) → swap USDC → **CCTP v2 Fast Transfer** → wrap pUSD. Proves
   the funding leg and, critically, **measures real bridge latency** — the number the
   funded-balance UX depends on.

Join them last for the full courier round-trip.

## Steps (from the official example, server-side)

1. **Managed signer** — a throwaway private key (ethers v5 signer) stands in for the
   Turnkey/Privy-server key we'll use in prod. No browser, no MiniPay needed for the spike.
2. **Derive + deploy Safe** — `deriveSafe(eoa, SafeFactory)` (deterministic), then
   `relayClient.deploy()`. Gasless via `relayer-v2.polymarket.com`.
3. **Fund** — for the first pass, acquire a few pUSD directly on Polygon (the Celo bridge is
   half 2). Confirm the **current pUSD address** first.
4. **Approvals** — `createAllApprovalTxs()` → `relayClient.execute(...)`, one gasless batch
   (CTF + CTF Exchange + Neg-Risk Exchange + Neg-Risk Adapter).
5. **API credentials** — temp `ClobClient.createOrDeriveApiKey()`.
6. **Place order** — authenticated `ClobClient` + Builder config → market order ~$1 on a
   liquid market; confirm fill and that shares land in the Safe.
7. **Sell / redeem** — sell back or redeem post-resolution; confirm pUSD returns to Safe.
8. **Bridge legs** — swap USDm→USDC on Celo, CCTP Fast Transfer both directions, wrap/unwrap
   pUSD; **record latency per leg**.

If step 6 fails for a fresh wallet (the type-3 client-bug class): the JS `clob-client` v4 +
type-2 Safe used here is the path that reportedly works; fall back to patching the client's
L1 auth or engage Polymarket's Builder Program.

## What to measure (feeds the architecture)

- **Latency per leg**, especially CCTP Celo↔Polygon — target < ~30 s with Fast Transfer.
  If Fast Transfer isn't available for Celo, note the standard-finality time and flag the
  UX impact (may pull the operating float forward from v2).
- **Total per-round-trip cost** (swap + bridge + wrap + any gas) → minimum top-up floor.
- Whether Safe deploy + order placement are truly gasless for the managed signer (they
  should be via the relayer) — confirms the signer needs ~no POL.

## Known adaptations from the example

- Example uses **USDC.e** (`0x2791Bca1…84174`); we use **pUSD**. Confirm current pUSD address
  and whether the Apr-28 **CTF Exchange V2** changed the exchange/adapter addresses below.
- Contract addresses in the example (pre-migration — verify before use):
  - CTF: `0x4d97dcd97ec945f40cf65f87097ace5ea0476045`
  - CTF Exchange: `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`
  - Neg-Risk Exchange: `0xC5d563A36AE78145C45a50134d48A1215220f80a`
  - Neg-Risk Adapter: `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296`

## Packages

`@polymarket/clob-client` (JS v4 — the one the working example uses), `builder-relayer-client`,
`builder-signing-sdk`, `ethers@5`, `viem`. CCTP via Circle's contracts/SDK.

## What's needed to run it (from Jadon)

1. **Polymarket Builder API credentials** — `polymarket.com/settings?tab=builder`
   (`API_KEY`, `SECRET`, `PASSPHRASE`).
2. **Polygon RPC URL** and a **Celo RPC URL**.
3. **~$5–10** as USDm on Celo (to test the real bridge) and/or pUSD on Polygon (to test the
   trading half first).

## Exit criteria

- [ ] Fresh Safe deployed for a server-managed signer via factory.
- [ ] Real ~$1 order placed and filled from that Safe; shares in the Safe.
- [ ] Position sold/redeemed; pUSD back in Safe.
- [ ] Full round-trip: USDm (Celo) → bet on Polymarket → USDm back to Celo.
- [ ] CCTP Fast Transfer latency measured both directions.
- [ ] Real per-round-trip cost recorded → minimum top-up floor.
