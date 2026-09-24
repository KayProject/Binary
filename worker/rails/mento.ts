// Celo swap rail: USDm <-> USDT via Uniswap V3 SwapRouter02 on Celo.
// 0.01% fee pool (0x5dC631aD6C26BEA1a59fBF2C2680CF3df43d249f), measured ~1.0001 USDT/USDm.
import { ethers } from "ethers";
import { ADDR, celoProvider, operator } from "../lib/env";

const UNISWAP_V3_ROUTER02 = "0x5615CDAb10dc425a742d643d949a7F474C01abc4";
const POOL_FEE_TIER = 100; // 0.01% fee tier

const ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
];

/** Swap `amountIn` USDm (18 dec) held by operator into USDT (6 dec) on Celo via Uniswap V3. */
export async function swapUsdmToUsdt(
  amountIn: bigint
): Promise<{ txHash: string; amountOut: bigint }> {
  const signer = operator(celoProvider);
  const router = new ethers.Contract(UNISWAP_V3_ROUTER02, ROUTER_ABI, signer);
  const usdm = new ethers.Contract(ADDR.usdmCelo, ERC20_ABI, signer);
  const usdt = new ethers.Contract(ADDR.usdtCelo, ERC20_ABI, celoProvider);

  const amount = ethers.BigNumber.from(amountIn);
  const bal: ethers.BigNumber = await usdm.balanceOf(signer.address);
  if (bal.lt(amount)) throw new Error(`operator USDm ${bal.toString()} < needed ${amount.toString()}`);

  const allowance: ethers.BigNumber = await usdm.allowance(signer.address, UNISWAP_V3_ROUTER02);
  if (allowance.lt(amount)) {
    await (await usdm.approve(UNISWAP_V3_ROUTER02, ethers.constants.MaxUint256)).wait();
  }

  // 1% slippage floor: 18 dec in -> 6 dec out
  const minOut = amount.div(ethers.BigNumber.from(10).pow(12)).mul(990).div(1000);

  const before: ethers.BigNumber = await usdt.balanceOf(signer.address);
  const tx = await router.exactInputSingle({
    tokenIn: ADDR.usdmCelo,
    tokenOut: ADDR.usdtCelo,
    fee: POOL_FEE_TIER,
    recipient: signer.address,
    amountIn: amount,
    amountOutMinimum: minOut,
    sqrtPriceLimitX96: 0,
  });
  await tx.wait();
  const after: ethers.BigNumber = await usdt.balanceOf(signer.address);
  return { txHash: tx.hash, amountOut: after.sub(before).toBigInt() };
}

/** Swap `amountIn` USDT (6 dec) held by operator into USDm (18 dec) on Celo via Uniswap V3. */
export async function swapUsdtToUsdm(
  amountIn: bigint
): Promise<{ txHash: string; amountOut: bigint }> {
  const signer = operator(celoProvider);
  const router = new ethers.Contract(UNISWAP_V3_ROUTER02, ROUTER_ABI, signer);
  const usdt = new ethers.Contract(ADDR.usdtCelo, ERC20_ABI, signer);
  const usdm = new ethers.Contract(ADDR.usdmCelo, ERC20_ABI, celoProvider);

  const amount = ethers.BigNumber.from(amountIn);
  const bal: ethers.BigNumber = await usdt.balanceOf(signer.address);
  if (bal.lt(amount)) throw new Error(`operator USDT ${bal.toString()} < needed ${amount.toString()}`);

  const allowance: ethers.BigNumber = await usdt.allowance(signer.address, UNISWAP_V3_ROUTER02);
  if (allowance.lt(amount)) {
    await (await usdt.approve(UNISWAP_V3_ROUTER02, ethers.constants.MaxUint256)).wait();
  }

  // 1% slippage floor: 6 dec in -> 18 dec out
  const minOut = amount.mul(ethers.BigNumber.from(10).pow(12)).mul(990).div(1000);

  const before: ethers.BigNumber = await usdm.balanceOf(signer.address);
  const tx = await router.exactInputSingle({
    tokenIn: ADDR.usdtCelo,
    tokenOut: ADDR.usdmCelo,
    fee: POOL_FEE_TIER,
    recipient: signer.address,
    amountIn: amount,
    amountOutMinimum: minOut,
    sqrtPriceLimitX96: 0,
  });
  await tx.wait();
  const after: ethers.BigNumber = await usdm.balanceOf(signer.address);
  return { txHash: tx.hash, amountOut: after.sub(before).toBigInt() };
}
