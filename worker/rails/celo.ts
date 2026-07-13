// Celo-side legs against BinaryDeposits: sweep deposited USDm into the
// operator treasury (= operator EOA), and pay withdrawals back out. payout()
// only ever sends to an address that has deposited before — the on-chain half
// of the trade-or-return invariant.
import { ethers } from "ethers";
import { ADDR, DEPOSITS_CONTRACT, celoProvider, operator } from "../lib/env";

const DEPOSITS_ABI = [
  "function sweep(uint256 amount)",
  "function payout(address user, uint256 amount)",
  "event Deposited(uint256 indexed id, address indexed user, uint256 amount)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address, uint256) returns (bool)",
];

export const depositsInterface = new ethers.utils.Interface(DEPOSITS_ABI);

/**
 * Make sure the operator EOA holds at least `needed` USDm, sweeping the
 * shortfall out of the deposits contract. Naturally idempotent: a retry after
 * a successful sweep finds the balance already sufficient and does nothing.
 */
export async function sweepIfNeeded(needed: bigint): Promise<string | null> {
  const signer = operator(celoProvider);
  const usdm = new ethers.Contract(ADDR.usdmCelo, ERC20_ABI, celoProvider);
  const have: ethers.BigNumber = await usdm.balanceOf(signer.address);
  if (have.gte(needed)) return null;

  const shortfall = ethers.BigNumber.from(needed).sub(have);
  const inContract: ethers.BigNumber = await usdm.balanceOf(DEPOSITS_CONTRACT);
  if (inContract.lt(shortfall))
    throw new Error(`contract USDm ${inContract} < shortfall ${shortfall}`);

  const deposits = new ethers.Contract(DEPOSITS_CONTRACT, DEPOSITS_ABI, signer);
  const tx = await deposits.sweep(shortfall);
  await tx.wait();
  return tx.hash;
}

/**
 * Pay `amount` USDm to `user` through the deposits contract (topping the
 * contract up from the operator EOA first if its balance is short).
 */
export async function payoutUsdm(user: string, amount: bigint): Promise<string> {
  const signer = operator(celoProvider);
  const usdm = new ethers.Contract(ADDR.usdmCelo, ERC20_ABI, signer);
  const amt = ethers.BigNumber.from(amount);

  const inContract: ethers.BigNumber = await usdm.balanceOf(DEPOSITS_CONTRACT);
  if (inContract.lt(amt)) {
    const topUp = amt.sub(inContract);
    const have: ethers.BigNumber = await usdm.balanceOf(signer.address);
    if (have.lt(topUp)) throw new Error(`operator USDm ${have} < payout top-up ${topUp}`);
    await (await usdm.transfer(DEPOSITS_CONTRACT, topUp)).wait();
  }

  const deposits = new ethers.Contract(DEPOSITS_CONTRACT, DEPOSITS_ABI, signer);
  const tx = await deposits.payout(user, amt);
  await tx.wait();
  return tx.hash;
}
