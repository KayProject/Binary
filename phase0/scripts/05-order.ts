// Step 5 — THE test: place a real ~$1 market order from the fresh Safe.
// This is the open question after Polymarket's April V2 upgrade — whether a
// brand-new server-signed Safe can trade at all.
//
//   npm run 05 -- <tokenID> [usd]        (default $1)
//
// Find a tokenID: pick a liquid market on polymarket.com, or
//   curl "https://gamma-api.polymarket.com/markets?closed=false&limit=5"
import { ethers } from "ethers";
import { Side, OrderType } from "@polymarket/clob-client-v2";
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
  const funder = state.depositWallet ?? state.safe!;
  const bal = await erc20.balanceOf(funder);
  console.log(`Funder (${state.depositWallet ? "deposit wallet" : "Safe"}) collateral: $${ethers.utils.formatUnits(bal, 6)}`);
  if (bal.lt(ethers.utils.parseUnits(usd.toString(), 6))) {
    throw new Error(`Funder needs ≥ $${usd} collateral — fund ${funder} first`);
  }

  // Flaky-network guard: these lookups intermittently fail and resolve
  // undefined, which crashes the order builder — retry until sane.
  const retry = async <T>(label: string, fn: () => Promise<T>, ok: (v: T) => boolean): Promise<T> => {
    for (let i = 0; i < 6; i++) {
      try {
        const v = await fn();
        if (ok(v)) return v;
      } catch {}
      console.log(`  retrying ${label}...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error(`${label} kept failing`);
  };

  const negRisk = await retry("negRisk", () => client.getNegRisk(tokenID), (v) => typeof v === "boolean");
  const ask = parseFloat(
    (await retry("price", () => client.getPrice(tokenID, Side.SELL), (v) => !!v?.price)).price
  );
  if (!(ask > 0 && ask < 1)) throw new Error(`No valid ask for ${tokenID}`);
  console.log(`Market ask: ${ask} | negRisk: ${negRisk} | spending $${usd} (FOK)`);

  // V2 orders: fees are server-set, builder attribution rides as BUILDER_CODE
  // on the client; tick sizes now include 0.005/0.0025.
  const tickSize = await retry(
    "tickSize",
    () => client.getTickSize(tokenID),
    (v) => ["0.1", "0.01", "0.005", "0.0025", "0.001", "0.0001"].includes(String(v))
  );
  const t0 = Date.now();
  const response = await client.createAndPostMarketOrder(
    { tokenID, amount: usd, side: Side.BUY },
    { tickSize, negRisk },
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
  const shares = await ctf.balanceOf(state.depositWallet ?? state.safe!, tokenID);
  console.log(`✓ Outcome shares in funder wallet: ${ethers.utils.formatUnits(shares, 6)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
