// Step 7 — no funds moved. Celo is NOT a CCTP domain (verified 2026-07-10
// against Circle's docs + on-chain: no TokenMessengerV2 code on Celo), so the
// funding leg rides bridge aggregation (LI.FI) instead. This prints the live
// route table both directions at several sizes — cost + ETA feed the
// architecture (minimum top-up floor, buffer-vs-wait decision).
//
//   npm run 07              (default sizes: $5 $20 $50 $100)
//   npm run 07 -- 10 250    (custom sizes)

const LIFI = "https://li.quest/v1/advanced/routes";

const CHAINS = { celo: 42220, polygon: 137 } as const;
const TOKENS = {
  celo: {
    USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    USDT: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  },
  polygon: {
    "USDC.e": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  },
} as const;

// Placeholder for quoting only; execution (08) uses the real spike signer.
const QUOTE_ADDR = "0x1111111111111111111111111111111111111111";

interface RouteRow {
  direction: string;
  rail: string;
  usd: number;
  received: number;
  costPct: number;
  etaSec: number;
  tools: string;
}

async function quote(
  fromChain: number,
  toChain: number,
  fromToken: string,
  toToken: string,
  usd: number
): Promise<{ received: number; etaSec: number; tools: string } | null> {
  const res = await fetch(LIFI, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromChainId: fromChain,
      toChainId: toChain,
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      fromAmount: String(Math.round(usd * 1e6)),
      fromAddress: QUOTE_ADDR,
      // Broker context: our server signs on BOTH chains, so routes needing a
      // destination-side signature are usable (they're cheaper than atomic ones).
      options: { allowSwitchChain: true, slippage: 0.01 },
    }),
  });
  const data = (await res.json()) as { routes?: any[] };
  const best = data.routes?.[0];
  if (!best) return null;
  return {
    received: parseInt(best.toAmount) / 1e6,
    etaSec: best.steps.reduce((s: number, x: any) => s + x.estimate.executionDuration, 0),
    tools: best.steps.map((s: any) => s.tool).join("+"),
  };
}

async function main() {
  const sizes = process.argv.slice(2).map(Number).filter(Boolean);
  const usdSizes = sizes.length ? sizes : [5, 20, 50, 100];
  const rows: RouteRow[] = [];

  const legs = [
    { direction: "Celo→Polygon", rail: "USDC→USDC.e", from: [CHAINS.celo, TOKENS.celo.USDC], to: [CHAINS.polygon, TOKENS.polygon["USDC.e"]] },
    { direction: "Celo→Polygon", rail: "USDT→USDT", from: [CHAINS.celo, TOKENS.celo.USDT], to: [CHAINS.polygon, TOKENS.polygon.USDT] },
    { direction: "Polygon→Celo", rail: "USDC.e→USDC", from: [CHAINS.polygon, TOKENS.polygon["USDC.e"]], to: [CHAINS.celo, TOKENS.celo.USDC] },
    { direction: "Polygon→Celo", rail: "USDT→USDT", from: [CHAINS.polygon, TOKENS.polygon.USDT], to: [CHAINS.celo, TOKENS.celo.USDT] },
  ] as const;

  for (const leg of legs) {
    for (const usd of usdSizes) {
      const q = await quote(
        leg.from[0] as number, leg.to[0] as number,
        leg.from[1] as string, leg.to[1] as string,
        usd
      ).catch(() => null);
      rows.push({
        direction: leg.direction,
        rail: leg.rail,
        usd,
        received: q ? +q.received.toFixed(3) : NaN,
        costPct: q ? +(100 * (usd - q.received) / usd).toFixed(2) : NaN,
        etaSec: q ? q.etaSec : NaN,
        tools: q ? q.tools : "no route",
      });
      await new Promise((r) => setTimeout(r, 1500)); // be polite to the API
    }
  }

  console.table(rows);
  console.log("Feed the winner into 08-bridge-execute.ts for the real measured run.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
