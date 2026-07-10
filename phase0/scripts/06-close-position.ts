// Step 6 — get the money back out. Two paths:
//   Sell into the book:   npm run 06 -- <tokenID>
//   Redeem (post-resolve): npm run 06 -- --redeem <conditionId> <outcomeIndex> [size] [--neg-risk]
import { ethers } from "ethers";
import { Side, OrderType } from "@polymarket/clob-client";
import {
  OperationType,
  RelayerTransactionState,
  SafeTransaction,
} from "@polymarket/builder-relayer-client";
import { loadState, recordTiming, polygonProvider } from "../lib/env";
import { makeClobClient, makeRelayClient, liveContractConfig } from "../lib/clients";

async function sell(tokenID: string) {
  const state = loadState();
  const cfg = liveContractConfig();
  const client = makeClobClient();

  const ctf = new ethers.Contract(
    cfg.conditionalTokens,
    ["function balanceOf(address, uint256) view returns (uint256)"],
    polygonProvider
  );
  const raw = await ctf.balanceOf(state.safe!, tokenID);
  const shares = parseFloat(ethers.utils.formatUnits(raw, 6));
  if (shares <= 0) throw new Error("No shares to sell");
  console.log(`Selling ${shares} shares (FOK market)...`);

  const negRisk = await client.getNegRisk(tokenID);
  const t0 = Date.now();
  const response = await client.createAndPostMarketOrder(
    { tokenID, amount: shares, side: Side.SELL, feeRateBps: 0 },
    { negRisk },
    OrderType.FOK
  );
  recordTiming("order_sell", Date.now() - t0);
  console.log("Sell response:", JSON.stringify(response, null, 2));
}

async function redeem(conditionId: string, outcomeIndex: number, size: number, negRisk: boolean) {
  const cfg = liveContractConfig();
  let tx: SafeTransaction;

  if (negRisk) {
    const amounts = [ethers.constants.Zero, ethers.constants.Zero];
    amounts[outcomeIndex] = ethers.utils.parseUnits(size.toString(), 6);
    tx = {
      to: cfg.negRiskAdapter,
      operation: OperationType.Call,
      data: new ethers.utils.Interface([
        "function redeemPositions(bytes32 conditionId, uint256[] amounts)",
      ]).encodeFunctionData("redeemPositions", [conditionId, amounts]),
      value: "0",
    };
  } else {
    tx = {
      to: cfg.conditionalTokens,
      operation: OperationType.Call,
      data: new ethers.utils.Interface([
        "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
      ]).encodeFunctionData("redeemPositions", [
        cfg.collateral,
        ethers.constants.HashZero,
        conditionId,
        [1 << outcomeIndex],
      ]),
      value: "0",
    };
  }

  const relay = makeRelayClient();
  console.log("Redeeming via gasless relayer batch...");
  const t0 = Date.now();
  const response = await relay.execute([tx], "binary-phase0-redeem");
  const result = await relay.pollUntilState(
    response.transactionID,
    [RelayerTransactionState.STATE_MINED, RelayerTransactionState.STATE_CONFIRMED],
    RelayerTransactionState.STATE_FAILED,
    60,
    3000
  );
  if (!result) throw new Error("Redeem failed or timed out");
  recordTiming("redeem", Date.now() - t0);
  console.log("✓ Redeemed.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--redeem") {
    const [, conditionId, outcomeIndex, size] = args;
    if (!conditionId || outcomeIndex === undefined)
      throw new Error("Usage: npm run 06 -- --redeem <conditionId> <outcomeIndex> [size] [--neg-risk]");
    await redeem(
      conditionId,
      parseInt(outcomeIndex),
      parseFloat(size || "0"),
      args.includes("--neg-risk")
    );
  } else if (args[0]) {
    await sell(args[0]);
  } else {
    throw new Error("Usage: npm run 06 -- <tokenID> | --redeem <conditionId> <outcomeIndex>");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
