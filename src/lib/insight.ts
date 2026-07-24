"use client";

// Client half of "Ask Delta (1¢)": pays the x402 fee for /api/delta/insight
// from the user's own wallet and returns the readout. The wallet signs a USDm
// micropayment (wrapFetchWithPayment intercepts the 402 challenge), so this
// only works with an injected EIP-1193 wallet — MiniPay, the app's native
// home, qualifies; the Privy-embedded path can come later.
//
// wrapFetchWithPayment's real signature is positional (fetch, client, wallet,
// options) — verified against thirdweb 5.120 d.ts; older examples are stale.
import { createThirdwebClient } from "thirdweb";
import { celo } from "thirdweb/chains";
import { EIP1193 } from "thirdweb/wallets";
import { wrapFetchWithPayment } from "thirdweb/x402";

// Public identifier (like the Privy app id) — the hackathon infra account's
// client id; override via env if it ever rotates.
const TW_CLIENT_ID =
  process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "eb696d03c9e8d34d437b464b0a9c6082";

export interface SideRead {
  tokenId: string;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  depth: { bidShares: number; askShares: number; bidUsd: number; askUsd: number };
}

export interface DeltaInsight {
  up: SideRead;
  down: SideRead;
  noArb: { askSum: number; edge: number; arbitrage: boolean } | null;
  impliedProb: number | null;
  decidedness: number | null;
  endDate: string | null;
  secondsToClose: number | null;
  sla: { quoteId: string; expiresAt: number; toleranceNote: string } | null;
  ts: number;
}

/** Pay 1¢ from the user's wallet and fetch Delta's read on a market. */
export async function askDelta(tokenIdUp: string, tokenIdDown: string): Promise<DeltaInsight> {
  const ethereum = (window as { ethereum?: EIP1193.EIP1193Provider }).ethereum;
  if (!ethereum) throw new Error("no wallet");

  const client = createThirdwebClient({ clientId: TW_CLIENT_ID });
  const wallet = EIP1193.fromProvider({ provider: ethereum });
  await wallet.connect({ client, chain: celo });

  const paidFetch = wrapFetchWithPayment(window.fetch.bind(window), client, wallet, {
    // 0.05 USDm ceiling — a mispriced server can never drain the wallet.
    maxValue: 50_000_000_000_000_000n,
  });

  const res = await paidFetch("/api/delta/insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenIdUp, tokenIdDown }),
  });
  if (!res.ok) throw new Error(`insight ${res.status}`);
  return (await res.json()) as DeltaInsight;
}
