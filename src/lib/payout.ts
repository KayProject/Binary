// Server-side payout: the out-leg both the human and bot loops were missing.
// BinaryDeposits.payout() is onlyOwner, and BINARY_KEY is the owner EOA
// (0x3a3a… == owner()), so the server signs payouts directly on Celo. Every
// payout is tagged calldata — a real USDm value transfer out, legitimately
// counted, and pinned by the contract to an address that has deposited.
//
// Inert (payoutReady() false → routes answer 503) until BINARY_KEY is set.
import {
  concat,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseAbiItem,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { toDataSuffix } from "@celo/attribution-tags";
import { DEPOSIT_CONTRACT, USDM, fetchPlayerState } from "./chain";

const ATTRIBUTION_TAG = toDataSuffix("celo_22480bd47654");
const tagged = (data: `0x${string}`) => concat([data, ATTRIBUTION_TAG]);

const payoutAbi = [parseAbiItem("function payout(address user, uint256 amount)")];
const balanceOfAbi = [parseAbiItem("function balanceOf(address) view returns (uint256)")];

export function payoutReady(): boolean {
  return !!process.env.BINARY_KEY;,
}

function ownerAccount() {
  return privateKeyToAccount(process.env.BINARY_KEY! as `0x${string}`);
}

// forno intermittently times out on this network; payouts are money-critical, so
// every RPC call gets its own retrying transport rather than the shared client.
const rpc = () => http("https://forno.celo.org", { retryCount: 5, retryDelay: 1500 });

const reader = () => createPublicClient({ chain: celo, transport: rpc() });

/** USDm the contract itself holds — payout() pays from this, not the treasury. */
export async function payoutLiquidityUsd(): Promise<number> {
  const bal = await reader().readContract({
    address: USDM,
    abi: balanceOfAbi,
    functionName: "balanceOf",
    args: [DEPOSIT_CONTRACT],
  });
  return Number(bal) / 1e18;
}

/** A user's on-chain withdrawable base = net deposits (totalDeposited − paidOut).
 *  Trading winnings live off-chain in the managed wallet and are added by the
 *  settlement job, not here — this is the deposit-balance floor. */
export async function withdrawableUsd(user: `0x${string}`): Promise<number> {
  const s = await fetchPlayerState(user);
  return s.depositedUsd;
}

export interface PayoutResult {
  txHash: `0x${string}`;
  user: `0x${string}`;
  usd: number;
}

/** Sign and send payout(user, amount) as the contract owner. Reverts UnknownUser
 *  on-chain if the user never deposited (the trade-or-return invariant), and we
 *  pre-check liquidity so a drained contract fails loud, not silent. */
export async function executePayout(user: `0x${string}`, usd: number): Promise<PayoutResult> {
  const amount = BigInt(Math.round(usd * 100)) * 10n ** 16n; // $ → USDm wei, cent precision

  const liquidity = await payoutLiquidityUsd();
  if (liquidity < usd) {
    throw new Error(`insufficient payout liquidity: contract holds $${liquidity.toFixed(2)}`);
  }

  const wallet = createWalletClient({ account: ownerAccount(), chain: celo, transport: rpc() });
  const data = tagged(
    encodeFunctionData({ abi: payoutAbi, functionName: "payout", args: [user, amount] }),
  );
  const txHash = await wallet.sendTransaction({ to: DEPOSIT_CONTRACT, data });
  return { txHash, user, usd };
}

// Re-export a fresh public client hook in case a route wants confirmations.
export { createPublicClient, http, celo };
