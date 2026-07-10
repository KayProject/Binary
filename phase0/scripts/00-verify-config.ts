// Step 0 — no funds moved. Prints the live contract set, verifies the
// collateral token on-chain, and confirms env/creds are in place.
import { ethers } from "ethers";
import { polygonProvider, loadState } from "../lib/env";
import { liveContractConfig, derivedSafe } from "../lib/clients";

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const cfg = liveContractConfig();
  console.log("Live Polymarket contract config (from installed clob-client):");
  console.table(cfg);

  const collateral = new ethers.Contract(cfg.collateral, ERC20_ABI, polygonProvider);
  const [symbol, decimals] = await Promise.all([
    collateral.symbol(),
    collateral.decimals(),
  ]);
  console.log(`Collateral on-chain: ${symbol} (${decimals} decimals) at ${cfg.collateral}`);

  for (const name of [
    "POLYMARKET_BUILDER_API_KEY",
    "POLYMARKET_BUILDER_SECRET",
    "POLYMARKET_BUILDER_PASSPHRASE",
    "CELO_RPC_URL",
  ]) {
    console.log(`${process.env[name] ? "✓" : "✗ MISSING"} ${name}`);
  }

  const state = loadState();
  if (state.eoa) {
    console.log(`Signer EOA: ${state.eoa}`);
    console.log(`Derived Safe: ${derivedSafe(state.eoa)}`);
  } else {
    console.log("No spike signer yet — run `npm run 01`");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
