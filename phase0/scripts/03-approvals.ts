// Step 3 — one gasless batch: collateral approvals for the exchanges +
// outcome-token (ERC-1155) operator approvals. Mirrors the official example's
// createAllApprovalTxs, but sourced from the live client config.
import { ethers } from "ethers";
import {
  OperationType,
  RelayerTransactionState,
  SafeTransaction,
} from "@polymarket/builder-relayer-client";
import { loadState, recordTiming, polygonProvider } from "../lib/env";
import { makeRelayClient, liveContractConfig } from "../lib/clients";

const MAX_UINT256 = ethers.constants.MaxUint256;
const erc20 = new ethers.utils.Interface([
  "function approve(address spender, uint256 amount)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);
const erc1155 = new ethers.utils.Interface([
  "function setApprovalForAll(address operator, bool approved)",
  "function isApprovedForAll(address account, address operator) view returns (bool)",
]);

async function main() {
  const state = loadState();
  if (!state.safe) throw new Error("Run `npm run 01` first");
  const cfg = liveContractConfig();

  // Post-V2 the config also carries exchangeV2/negRiskExchangeV2/exchangeV3 —
  // approve every exchange generation present so orders settle regardless of
  // which contract the CLOB routes through.
  const v2 = cfg as typeof cfg & {
    exchangeV2?: string;
    negRiskExchangeV2?: string;
    exchangeV3?: string;
  };
  const extraExchanges = [v2.exchangeV2, v2.negRiskExchangeV2, v2.exchangeV3].filter(
    (a): a is string => !!a
  );
  const collateralSpenders = [
    cfg.conditionalTokens,
    cfg.negRiskAdapter,
    cfg.exchange,
    cfg.negRiskExchange,
    ...extraExchanges,
  ];
  const outcomeOperators = [
    cfg.exchange,
    cfg.negRiskExchange,
    cfg.negRiskAdapter,
    ...extraExchanges,
  ];

  // Skip anything already approved so re-runs are cheap no-ops.
  const collateral = new ethers.Contract(cfg.collateral, erc20, polygonProvider);
  const ctf = new ethers.Contract(cfg.conditionalTokens, erc1155, polygonProvider);
  const txns: SafeTransaction[] = [];

  for (const spender of collateralSpenders) {
    const allowance: ethers.BigNumber = await collateral.allowance(state.safe, spender);
    if (allowance.lt(ethers.utils.parseUnits("1000000", 6))) {
      txns.push({
        to: cfg.collateral,
        operation: OperationType.Call,
        data: erc20.encodeFunctionData("approve", [spender, MAX_UINT256]),
        value: "0",
      });
    }
  }
  for (const operator of outcomeOperators) {
    const ok: boolean = await ctf.isApprovedForAll(state.safe, operator);
    if (!ok) {
      txns.push({
        to: cfg.conditionalTokens,
        operation: OperationType.Call,
        data: erc1155.encodeFunctionData("setApprovalForAll", [operator, true]),
        value: "0",
      });
    }
  }

  if (txns.length === 0) {
    console.log("✓ All approvals already set.");
    return;
  }

  const relay = makeRelayClient();
  console.log(`Executing ${txns.length} approval txs in one gasless batch...`);
  const t0 = Date.now();
  const response = await relay.execute(txns, "binary-phase0-approvals");
  const result = await relay.pollUntilState(
    response.transactionID,
    [RelayerTransactionState.STATE_MINED, RelayerTransactionState.STATE_CONFIRMED],
    RelayerTransactionState.STATE_FAILED,
    60,
    3000
  );
  if (!result) throw new Error("Approval batch failed or timed out");
  recordTiming("approvals_batch", Date.now() - t0);
  console.log("✓ Approvals set.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
