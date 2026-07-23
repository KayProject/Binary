import { NextResponse } from "next/server";
import { listOpenBets, writeBet, type BetRecord } from "@/lib/bets/ledger";
import { readOutcome } from "@/lib/play/grade";
import { payoutReady, executePayout } from "@/lib/payout";

export const runtime = "nodejs";
export const maxDuration = 300;

const GAMMA = "https://gamma-api.polymarket.com";
const BATCH = 20; // token ids are ~77 digits; keep the query string sane

interface SettledMarket {
  prices: [number, number];
  clobTokenIds: [string, string];
}

/** closed=true is the resolution check (see play/grade.ts): what comes back
 *  has settled, what doesn't is still running. Keyed by CLOB token id. */
async function fetchSettledByToken(tokenIDs: string[]): Promise<Map<string, SettledMarket>> {
  const out = new Map<string, SettledMarket>();
  const unique = [...new Set(tokenIDs)];
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const qs = chunk.map((t) => `clob_token_ids=${t}`).join("&
    const res = await fetch(`${GAMMA}/markets?${qs}&closed=true`, { cache: "no-store" });
    if (!res.ok) throw new Error(`gamma ${res.status}`);
    for (const m of (await res.json()) as Array<Record<string, string>>) {
      try {
        const prices = (JSON.parse(m.outcomePrices) as string[]).map(Number);
        const tokens = JSON.parse(m.clobTokenIds) as string[];
        if (prices.length !== 2 || tokens.length !== 2) continue;
        const market: SettledMarket = {
          prices: [prices[0], prices[1]],
          clobTokenIds: [tokens[0], tokens[1]],
        };
        out.set(tokens[0], market);
        out.set(tokens[1], market);
      } catch {}
    }
  }
  return out;
}

async function processBet(bet: BetRecord, market: SettledMarket, liquidityHalt: string | null): Promise<{ orderID: string; resolution: string; payoutUsd: number; payoutTx?: string }> {
  const outcome = market.clobTokenIds.indexOf(bet.tokenID) as 0 | 1;
  const resolution = readOutcome(market.prices, outcome);
  if (resolution === "open" || resolution === "unknown") {
    return { orderID: bet.orderID, resolution, payoutUsd: 0 };
  }

  if (resolution !== "won") {
    await writeBet({ ...bet, status: resolution === "void" ? "void" : "settled", resolution, payoutUsd: 0, settledAt: Math.floor(Date.now() / 1000) });
    return { orderID: bet.orderID, resolution, payoutUsd: 0 };
  }

  if (liquidityHalt) {
    return { orderID: bet.orderID, resolution, payoutUsd: 0 };
  }

  const winnings = Math.floor(bet.shares * 100) / 100; // $1/share, cent precision
  await writeBet({ ...bet, status: "paying", resolution, payoutUsd: winnings });
  try {
    const { txHash } = await executePayout(bet.user, winnings);
    await writeBet({
      ...bet,
      status: "settled",
      resolution,
      payoutUsd: winnings,
      payoutTx: txHash,
      settledAt: Math.floor(Date.now() / 1000),
    });
    return { orderID: bet.orderID, resolution, payoutUsd: winnings, payoutTx: txHash };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("liquidity")) {
      // Nothing was sent — safe to reopen and halt the sweep for a top-up.
      await writeBet({ ...bet, status: "open" });
      return { orderID: bet.orderID, resolution, payoutUsd: 0 };
    } else {
      // Tx fate unknown — leave "paying" for manual review.
      console.error(`payout for ${bet.orderID} in unknown state:`, e);
      return { orderID: bet.orderID, resolution, payoutUsd: 0 };
    }
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!payoutReady()) {
    return NextResponse.json({ error: "payout not configured" }, { status: 503 });
  }

  const open = await listOpenBets();
  if (open.length === 0) return NextResponse.json({ ok: true, open: 0, settled: [] });

  const markets = await fetchSettledByToken(open.map((b) => b.tokenID));

  const settled: Array<Pick<BetRecord, "orderID" | "resolution" | "payoutUsd" | "payoutTx">> = [];
  const stuck: string[] = [];
  let liquidityHalt: string | null = null;

  // Serial on purpose: payouts share one owner nonce, and a liquidity gap
  // should stop the sweep cleanly instead of failing N bets in parallel.
  for (const bet of open) {
    const market = markets.get(bet.tokenID);
    if (!market) continue; // still running

    const result = await processBet(bet, market, liquidityHalt);
    settled.push(result);
    if (result.resolution === "won" && !result.payoutTx) {
      stuck.push(bet.orderID);
    }
    if (result.resolution === "won" && result.payoutTx && liquidityHalt) {
      liquidityHalt = null;
    }
  }

  return NextResponse.json({
    ok: !liquidityHalt && stuck.length === 0,
    open: open.length,
    settled,
    ...(stuck.length ? { needsReview: stuck } : {}),
    ...(liquidityHalt ? { liquidityHalt } : {}),
  });
}