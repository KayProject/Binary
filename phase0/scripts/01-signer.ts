// Step 1 — create (or adopt) the throwaway EOA standing in for the prod
// server-managed signer, and print its deterministic Safe address.
import { ethers } from "ethers";
import { loadState, saveState } from "../lib/env";
import { derivedSafe } from "../lib/clients";

async function main() {
  let state = loadState();
  const envKey = process.env.TEST_EOA_PRIVATE_KEY;

  if (envKey) {
    const wallet = new ethers.Wallet(envKey);
    state = saveState({ privateKey: envKey, eoa: wallet.address });
    console.log("Adopted signer from TEST_EOA_PRIVATE_KEY");
  } else if (!state.privateKey) {
    const wallet = ethers.Wallet.createRandom();
    state = saveState({ privateKey: wallet.privateKey, eoa: wallet.address });
    console.log("Generated new throwaway signer → .state.json (gitignored)");
  } else {
    console.log("Reusing existing signer from .state.json");
  }

  const safe = derivedSafe(state.eoa!);
  saveState({ safe });

  console.log(`EOA:          ${state.eoa}`);
  console.log(`Derived Safe: ${safe}`);
  console.log("\nFund the SAFE address with collateral (see step 00 for the token).");
  console.log("The EOA itself needs no gas — everything routes through the relayer.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
