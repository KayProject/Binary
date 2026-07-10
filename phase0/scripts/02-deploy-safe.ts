// Step 2 — deploy the Safe gaslessly via the Builder relayer. Timed:
// this is the "first deposit" provisioning cost in prod.
import { RelayerTransactionState } from "@polymarket/builder-relayer-client";
import { loadState, saveState, recordTiming, polygonProvider } from "../lib/env";
import { makeRelayClient } from "../lib/clients";

async function main() {
  const state = loadState();
  if (!state.safe) throw new Error("Run `npm run 01` first");

  const code = await polygonProvider.getCode(state.safe);
  if (code !== "0x") {
    console.log(`Safe ${state.safe} already deployed — nothing to do.`);
    return;
  }

  const relay = makeRelayClient();
  console.log(`Deploying Safe ${state.safe} via relayer (gasless)...`);

  const t0 = Date.now();
  const response = await relay.deploy();
  console.log(`Relayer accepted: txID ${response.transactionID}`);

  const result = await relay.pollUntilState(
    response.transactionID,
    [RelayerTransactionState.STATE_MINED, RelayerTransactionState.STATE_CONFIRMED],
    RelayerTransactionState.STATE_FAILED,
    60,
    3000
  );
  if (!result) throw new Error("Safe deployment failed or timed out");
  recordTiming("safe_deploy", Date.now() - t0);

  saveState({ safe: result.proxyAddress, safeDeployTxId: response.transactionID });
  console.log(`✓ Safe deployed at ${result.proxyAddress}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
