// Step 5 — THE test: place a real ~$1 market order from the fresh Safe.
// This is the open question after Polymarket's April V2 upgrade — whether a
// brand-new server-signed Safe can trade at all.
//
//   npm run 05 -- <tokenID> [usd]        (default $1)
//
// Find a tokenID: pick a liquid market on polymarket.com, or
//   curl "https://gamma-api.polymarket.com/markets?closed=false&limit=5"
import { ethers } from "ethers";
import { Side, OrderType } from "@polymarket/clob-client";
import { loadState, recordTiming, polygonProvider } from "../lib/env";
import { makeClobClient, liveContractConfig } from "../lib/clients";

async function main() {
  const [tokenID, usdArg] = process.argv.slice(2);
  if (!tokenID) throw new Error("Usage: npm run 05 -- <tokenID> [usd]");
  const usd = parseFloat(usdArg || "1");

  const state = loadState();
  const cfg = liveContractConfig();
  const client = makeClobClient();

  // Pre-flight: collateral balance in the Safe.
  const erc20 = new ethers.Contract(
    cfg.collateral,
    ["function balanceOf(address) view returns (uint256)"],
    polygonProvider
  );
  const bal = await erc20.balanceOf(state.safe!);
  console.log(`Safe collateral balance: $${ethers.utils.formatUnits(bal, 6)}`);
  if (bal.lt(ethers.utils.parseUnits(usd.toString(), 6))) {
    throw new Error(`Safe needs ≥ $${usd} collateral — fund ${state.safe} first`);
  }

  const negRisk = await client.getNegRisk(tokenID);
  const ask = parseFloat((await client.getPrice(tokenID, Side.SELL)).price);
  if (!(ask > 0 && ask < 1)) throw new Error(`No valid ask for ${tokenID}`);
  console.log(`Market ask: ${ask} | negRisk: ${negRisk} | spending $${usd} (FOK)`);

  const t0 = Date.now();
  const response = await client.createAndPostMarketOrder(
    { tokenID, amount: usd, side: Side.BUY, feeRateBps: 0 },
    { negRisk },
    OrderType.FOK
  );
  recordTiming("order_place", Date.now() - t0);
  console.log("Order response:", JSON.stringify(response, null, 2));
  if (!response.orderID) throw new Error("Order not accepted");

  // Confirm the fill server-side, then the shares on-chain in the Safe.
  await new Promise((r) => setTimeout(r, 3000));
  const trades = await client.getTrades({ asset_id: tokenID });
  console.log(`Trades for token: ${trades.length}`);

  const ctf = new ethers.Contract(
    cfg.conditionalTokens,
    ["function balanceOf(address, uint256) view returns (uint256)"],
    polygonProvider
  );
  const shares = await ctf.balanceOf(state.safe!, tokenID);
  console.log(`✓ Outcome shares in Safe: ${ethers.utils.formatUnits(shares, 6)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
