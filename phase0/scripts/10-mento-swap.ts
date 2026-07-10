// Step 10 — REAL MONEY (Celo side). The entry leg: USDm → USDT via the Mento
// Broker — the same protocol rails MiniPay's "Pockets" uses. Verified on-chain
// 2026-07-10: constant-sum oracle pricing, ~0% cost (quoted +0.059% in the
// user's favor), flat from $20 to $500.
//
//   npm run 10 -- <usd>          swap USDm → USDT
//   npm run 10 -- <usd> quote    quote only, no funds moved
import { ethers } from "ethers";
import { spikeSigner, celoProvider, recordTiming } from "../lib/env";

const BROKER = "0x777A8255cA72412f0d706dc03C9D1987306B4CaD";
const BIPOOL_MANAGER = "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901";
const USDM = "0x765DE816845861e75A25fCA122bb6898B8B1282a"; // 18 decimals
const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"; // 6 decimals
const EXCHANGE_ID_USDM_USDT =
  "0x773bcec109cee923b5e04706044fd9d6a5121b1a6a4c059c36fdbe5b845d4e9b";

const BROKER_ABI = [
  "function getAmountOut(address exchangeProvider, bytes32 exchangeId, address assetIn, address assetOut, uint256 amountIn) view returns (uint256)",
  "function swapIn(address exchangeProvider, bytes32 exchangeId, address assetIn, address assetOut, uint256 amountIn, uint256 amountOutMin) returns (uint256)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
];

async function main() {
  const [usdArg, mode] = process.argv.slice(2);
  const usd = parseFloat(usdArg || "5");
  const amountIn = ethers.utils.parseUnits(usd.toString(), 18);

  const signer = spikeSigner(celoProvider());
  const broker = new ethers.Contract(BROKER, BROKER_ABI, signer);

  const quoted: ethers.BigNumber = await broker.getAmountOut(
    BIPOOL_MANAGER, EXCHANGE_ID_USDM_USDT, USDM, USDT, amountIn
  );
  const out = parseFloat(ethers.utils.formatUnits(quoted, 6));
  console.log(
    `Mento quote: $${usd} USDm → $${out.toFixed(4)} USDT ` +
      `(cost ${(100 * (usd - out) / usd).toFixed(3)}%)`
  );
  if (mode === "quote") return;

  const usdm = new ethers.Contract(USDM, ERC20_ABI, signer);
  const bal: ethers.BigNumber = await usdm.balanceOf(signer.address);
  if (bal.lt(amountIn))
    throw new Error(`Need $${usd} USDm on ${signer.address}, have $${ethers.utils.formatUnits(bal, 18)}`);

  const allowance: ethers.BigNumber = await usdm.allowance(signer.address, BROKER);
  if (allowance.lt(amountIn)) {
    console.log("Approving Broker...");
    await (await usdm.approve(BROKER, ethers.constants.MaxUint256)).wait();
  }

  // 0.5% slippage floor — Mento is oracle-priced so realized ≈ quoted.
  const minOut = quoted.mul(995).div(1000);
  const t0 = Date.now();
  const tx = await broker.swapIn(
    BIPOOL_MANAGER, EXCHANGE_ID_USDM_USDT, USDM, USDT, amountIn, minOut
  );
  console.log(`swapIn: ${tx.hash}`);
  await tx.wait();
  recordTiming("mento_swap", Date.now() - t0);

  const usdt = new ethers.Contract(USDT, ERC20_ABI, signer);
  const after: ethers.BigNumber = await usdt.balanceOf(signer.address);
  console.log(`✓ USDT balance now: $${ethers.utils.formatUnits(after, 6)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
