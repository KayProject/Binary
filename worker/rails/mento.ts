// Cheap-rail leg 1: USDm → USDT on Celo via the Mento Broker (oracle-priced,
// measured −0.05% i.e. the user gains; 8.3 s). Ported from phase0/scripts/10.
import { ethers } from "ethers";
import { ADDR, EXCHANGE_ID_USDM_USDT, celoProvider, operator } from "../lib/env";

const BROKER_ABI = [
  "function getAmountOut(address exchangeProvider, bytes32 exchangeId, address assetIn, address assetOut, uint256 amountIn) view returns (uint256)",
  "function swapIn(address exchangeProvider, bytes32 exchangeId, address assetIn, address assetOut, uint256 amountIn, uint256 amountOutMin) returns (uint256)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
];

/** Swap `amountIn` USDm (18 dec) held by the operator EOA into USDT (6 dec). */
export async function swapUsdmToUsdt(
  amountIn: bigint
): Promise<{ txHash: string; amountOut: bigint }> {
  const signer = operator(celoProvider);
  const broker = new ethers.Contract(ADDR.mentoBroker, BROKER_ABI, signer);
  const usdm = new ethers.Contract(ADDR.usdmCelo, ERC20_ABI, signer);
  const usdt = new ethers.Contract(ADDR.usdtCelo, ERC20_ABI, celoProvider);

  const amount = ethers.BigNumber.from(amountIn);
  const bal: ethers.BigNumber = await usdm.balanceOf(signer.address);
  if (bal.lt(amount)) throw new Error(`operator USDm ${bal.toString()} < needed ${amount.toString()}`);

  const quoted: ethers.BigNumber = await broker.getAmountOut(
    ADDR.mentoBiPoolManager, EXCHANGE_ID_USDM_USDT, ADDR.usdmCelo, ADDR.usdtCelo, amount
  );

  const allowance: ethers.BigNumber = await usdm.allowance(signer.address, ADDR.mentoBroker);
  if (allowance.lt(amount)) {
    await (await usdm.approve(ADDR.mentoBroker, ethers.constants.MaxUint256)).wait();
  }

  // 0.5% slippage floor — Mento is oracle-priced so realized ≈ quoted.
  const before: ethers.BigNumber = await usdt.balanceOf(signer.address);
  const tx = await broker.swapIn(
    ADDR.mentoBiPoolManager, EXCHANGE_ID_USDM_USDT, ADDR.usdmCelo, ADDR.usdtCelo,
    amount, quoted.mul(995).div(1000)
  );
  await tx.wait();
  const after: ethers.BigNumber = await usdt.balanceOf(signer.address);
  return { txHash: tx.hash, amountOut: after.sub(before).toBigInt() };
}
