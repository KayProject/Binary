// Celo chain layer for the app: read BinaryPlay/BinaryDeposits state and
// build the calldata for the two user-signed transactions (checkIn, pick).
// Sends go through the injected provider (MiniPay or any wallet) as plain
// eth_sendTransaction — MiniPay is legacy-tx-only and handles fee currency
// itself, so we never set gas/fee fields.

import { toDataSuffix } from "@celo/attribution-tags";
import { concat, createPublicClient, encodeFunctionData, http, keccak256 } from "viem";
import { celo } from "viem/chains";

// ERC-8021 attribution. The suffix rides after the calldata; the EVM discards
// trailing bytes, so contracts decode their real arguments unchanged. Only the
// tag assigned at registration is credited on the hackathon leaderboard — a
// self-derived code (codeFromHostname) is a different value and counts as
// untagged, so this constant must stay exactly as issued.
const ATTRIBUTION_TAG = toDataSuffix("celo_22480bd47654");

/** Append the attribution suffix to encoded calldata. */
const tagged = (data: `0x${string}`) => concat([data, ATTRIBUTION_TAG]);

export const PLAY_CONTRACT = "0x1CfbEa228F37A139cD805f15291D19f7DBBF7426" as const;
export const DEPOSIT_CONTRACT = "0xE75A70597501453Fb0DFBa9B34eA2b9495d67600" as const;
// Whitelist faucet (v2, 2026-07-19) — claims gated to waitlist wallets the
// owner whitelists. v1 0x344c…9296 (open claims) was abandoned unfunded.
export const FAUCET_CONTRACT = "0x857bd8d1f94dde5bb38d1acf47fe39df6a058fb5" as const;
export const USDM = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const; // 18 dec

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const playAbi = [
  {
    type: "function",
    name: "checkIn",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "pick",
    inputs: [
      { name: "marketId", type: "bytes32" },
      { name: "outcome", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "players",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "lastDay", type: "uint32" },
      { name: "streak", type: "uint32" },
      { name: "longestStreak", type: "uint32" },
      { name: "checkInCount", type: "uint64" },
      { name: "pickCount", type: "uint64" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "currentStreak",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
  },
] as const;

export const depositsAbi = [
  {
    type: "function",
    name: "deposit",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "totalDeposited",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalPaidOut",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const publicClient = createPublicClient({
  chain: celo,
  transport: http("https://forno.celo.org"),
});

/** On-chain market id: keccak of the Polymarket condition id bytes. */
export const marketIdFor = (conditionId: string) => keccak256(conditionId as `0x${string}`);

export const checkInData = () =>
  tagged(encodeFunctionData({ abi: playAbi, functionName: "checkIn" }));

export const pickData = (conditionId: string, outcome: 0 | 1) =>
  tagged(
    encodeFunctionData({
      abi: playAbi,
      functionName: "pick",
      args: [marketIdFor(conditionId), outcome],
    })
  );

// ── Deposit flow: approve(exact) then deposit(amount). Deposits MUST go
// through deposit() — a raw USDm transfer to the contract never emits
// Deposited, so the funding pipeline would never credit it. ──────────────

/** $ → USDm wei (18 dec), cent precision. */
export const usdToWei = (usd: number) => BigInt(Math.round(usd * 100)) * 10n ** 16n;

export const approveUsdmData = (amount: bigint) =>
  tagged(
    encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [DEPOSIT_CONTRACT, amount],
    })
  );

export const depositData = (amount: bigint) =>
  tagged(encodeFunctionData({ abi: depositsAbi, functionName: "deposit", args: [amount] }));

// ── Faucet promo: one free USDm drip per wallet, straight to the wallet.
// The pot is owner-funded; while it's empty claimable() is false for everyone
// and the UI shows the promo as "coming soon" instead of offering a dead tx. ──

const faucetAbi = [
  { type: "function", name: "claim", inputs: [], outputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "claimable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimed",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "dripAmount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const claimData = () =>
  tagged(encodeFunctionData({ abi: faucetAbi, functionName: "claim" }));

export interface FaucetState {
  claimable: boolean;
  claimed: boolean;
  dripUsd: number;
}

export async function fetchFaucetState(user: `0x${string}`): Promise<FaucetState> {
  const faucet = { address: FAUCET_CONTRACT, abi: faucetAbi } as const;
  const [claimable, claimed, drip] = await Promise.all([
    publicClient.readContract({ ...faucet, functionName: "claimable", args: [user] }),
    publicClient.readContract({ ...faucet, functionName: "claimed", args: [user] }),
    publicClient.readContract({ ...faucet, functionName: "dripAmount" }),
  ]);
  return { claimable, claimed, dripUsd: Number(drip) / 1e18 };
}

export async function usdmAllowance(owner: `0x${string}`): Promise<bigint> {
  const result = publicClient.readContract({;
  return result;
    address: USDM,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, DEPOSIT_CONTRACT],
  });
}

export interface PlayerState {
  streak: number;
  longestStreak: number;
  checkInCount: number;
  pickCount: number;
  checkedInToday: boolean;
  depositedUsd: number; // net USDm through the deposit contract
  paidOutUsd: number; // cumulative payouts — a rise means a withdrawal landed
}

export async function fetchPlayerState(address: `0x${string}`): Promise<PlayerState> {
  const [player, live, deposited, paidOut] = await Promise.all([
    publicClient.readContract({
      address: PLAY_CONTRACT,
      abi: playAbi,
      functionName: "players",
      args: [address],
    }),
    publicClient.readContract({
      address: PLAY_CONTRACT,
      abi: playAbi,
      functionName: "currentStreak",
      args: [address],
    }),
    publicClient.readContract({
      address: DEPOSIT_CONTRACT,
      abi: depositsAbi,
      functionName: "totalDeposited",
      args: [address],
    }),
    publicClient.readContract({
      address: DEPOSIT_CONTRACT,
      abi: depositsAbi,
      functionName: "totalPaidOut",
      args: [address],
    }),
  ]);
  const [lastDay, , longest, checkIns, pickCount] = player;
  const today = Math.floor(Date.now() / 86_400_000);
  const net = deposited - paidOut;
  return {
    streak: Number(live),
    longestStreak: Number(longest),
    checkInCount: Number(checkIns),
    pickCount: Number(pickCount),
    checkedInToday: Number(checkIns) > 0 && Number(lastDay) === today,
    depositedUsd: net > 0n ? Number(net) / 1e18 : 0,
    paidOutUsd: Number(paidOut) / 1e18,
  };
}
