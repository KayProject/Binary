// Step 8 — REAL MONEY. Executes one bridge leg with the spike signer and
// measures wall-clock latency + realized cost. Run the Celo→Polygon leg to
// fund the Safe for step 05, and the reverse leg at the end for the full
// courier round-trip.
//
//   npm run 08 -- deposit  <usd>   Celo USDT  → Polygon USDT   (then swap→collateral)
//   npm run 08 -- withdraw <usd>   Polygon USDT → Celo USDT
//
// Uses LI.FI advanced routes: fetch route → execute each step's transaction
// with the chain-appropriate signer → poll status until DONE.
import { ethers } from "ethers";
import { spikeSigner, celoProvider, polygonProvider, recordTiming, loadState } from "../lib/env";

const LIFI = "https://li.quest/v1";
const CELO = 42220;
const POLYGON = 137;
const USDT_CELO = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const USDT_POLYGON = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

const providers: Record<number, ethers.providers.JsonRpcProvider> = {
  [POLYGON]: polygonProvider,
  [CELO]: celoProvider(),
};

async function lifi(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${LIFI}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`LI.FI ${path}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function ensureAllowance(
  signer: ethers.Wallet,
  token: string,
  spender: string,
  amount: ethers.BigNumber
) {
  const erc20 = new ethers.Contract(
    token,
    [
      "function allowance(address, address) view returns (uint256)",
      "function approve(address, uint256) returns (bool)",
    ],
    signer
  );
  const current: ethers.BigNumber = await erc20.allowance(signer.address, spender);
  if (current.gte(amount)) return;
  console.log(`Approving ${spender} to spend ${amount.toString()}...`);
  const tx = await erc20.approve(spender, amount);
  await tx.wait();
}

async function executeStep(step: any): Promise<void> {
  const chainId: number = step.action.fromChainId;
  const signer = spikeSigner(providers[chainId]);

  // LI.FI returns the populated transaction for this step.
  const withTx = await lifi("/advanced/stepTransaction", {
    method: "POST",
    body: JSON.stringify(step),
  });
  const req = withTx.transactionRequest;
  if (!req) throw new Error(`No transactionRequest on step ${step.tool}`);

  if (step.action.fromToken.address !== ethers.constants.AddressZero) {
    await ensureAllowance(
      signer,
      step.action.fromToken.address,
      step.estimate.approvalAddress,
      ethers.BigNumber.from(step.action.fromAmount)
    );
  }

  console.log(`[${step.tool}] sending tx on chain ${chainId}...`);
  const tx = await signer.sendTransaction({
    to: req.to,
    data: req.data,
    value: req.value ? ethers.BigNumber.from(req.value) : undefined,
    gasLimit: req.gasLimit ? ethers.BigNumber.from(req.gasLimit) : undefined,
  });
  console.log(`  tx: ${tx.hash}`);
  await tx.wait();

  // Poll bridge status until the destination side lands.
  if (step.action.fromChainId !== step.action.toChainId) {
    process.stdout.write("  bridging");
    for (;;) {
      await new Promise((r) => setTimeout(r, 10_000));
      const status = await lifi(
        `/status?bridge=${step.tool}&fromChain=${step.action.fromChainId}` +
          `&toChain=${step.action.toChainId}&txHash=${tx.hash}`
      ).catch(() => ({ status: "PENDING" }));
      process.stdout.write(".");
      if (status.status === "DONE") break;
      if (status.status === "FAILED") throw new Error("Bridge reported FAILED");
    }
    console.log(" done");
  }
}

async function main() {
  const [mode, usdArg] = process.argv.slice(2);
  if (mode !== "deposit" && mode !== "withdraw")
    throw new Error("Usage: npm run 08 -- deposit|withdraw <usd>");
  const usd = parseFloat(usdArg || "5");

  const [fromChain, toChain, fromToken, toToken] =
    mode === "deposit"
      ? [CELO, POLYGON, USDT_CELO, USDT_POLYGON]
      : [POLYGON, CELO, USDT_POLYGON, USDT_CELO];

  const eoa = loadState().eoa ?? spikeSigner().address;
  console.log(`${mode}: $${usd} USDT, chain ${fromChain} → ${toChain}, signer ${eoa}`);

  const { routes } = await lifi("/advanced/routes", {
    method: "POST",
    body: JSON.stringify({
      fromChainId: fromChain,
      toChainId: toChain,
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      fromAmount: String(Math.round(usd * 1e6)),
      fromAddress: eoa,
      toAddress: eoa,
      options: { allowSwitchChain: true, slippage: 0.01 },
    }),
  });
  const route = routes?.[0];
  if (!route) throw new Error("No route available");

  const expected = parseInt(route.toAmount) / 1e6;
  console.log(
    `Route: ${route.steps.map((s: any) => s.tool).join(" + ")} | ` +
      `expect $${expected.toFixed(3)} (${(100 * (usd - expected) / usd).toFixed(2)}% cost)`
  );

  const t0 = Date.now();
  for (const step of route.steps) await executeStep(step);
  const ms = Date.now() - t0;
  recordTiming(`bridge_${mode}`, ms);

  const destBal = await new ethers.Contract(
    toToken,
    ["function balanceOf(address) view returns (uint256)"],
    providers[toChain]
  ).balanceOf(eoa);
  console.log(
    `✓ ${mode} complete in ${(ms / 60000).toFixed(1)} min — ` +
      `destination USDT balance: $${ethers.utils.formatUnits(destBal, 6)}`
  );
  console.log("Record: realized cost = sent − received; compare vs quote.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
