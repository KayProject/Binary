// POST /api/bets — place a real Polymarket market buy for a funded user.
// Body: { user: 0x… (Celo address), tokenID: CLOB token id, usd: number }
//
// Funding gate, two layers: the user must have net deposits on the Celo
// deposits contract (their money entered the pipeline), and the deposit
// wallet must actually hold enough credited pUSD to cover the order.
import { NextResponse } from "next/server";
import { fetchPlayerState } from "@/lib/chain";
import { brokerReady, collateralBalance, placeMarketBuy } from "@/lib/broker";
import { ledgerReady, writeBet } from "@/lib/bets/ledger";

export const runtime = "nodejs";

const MIN_BET = 0.5;
const MAX_BET = 100;

export async function POST(request: Request) {
  if (!brokerReady()) {
    return NextResponse.json({ error: "broker not configured" }, { status: 503 });
  }

  let body: { user?: string; tokenID?: string; usd?: number; conditionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { user, tokenID, usd, conditionId } = body;
  if (!/^0x[0-9a-fA-F]{40}$/.test(user ?? "")) {
    return NextResponse.json({ error: "invalid user address" }, { status: 400 });
  }
  if (!/^\d+$/.test(tokenID ?? "")) {
    return NextResponse.json({ error: "invalid tokenID" }, { status: 400 });
  }
  if (typeof usd !== "number" || !(usd >= MIN_BET && usd <= MAX_BET)) {
    return NextResponse.json(
      { error: `bet must be between $${MIN_BET} and $${MAX_BET}` },
      { status: 400 }
    );
  }

  try {
    const player = await fetchPlayerState(user as `0x${string}`);
    if (player.depositedUsd < usd) {
      return NextResponse.json(
        { error: "insufficient deposited balance", depositedUsd: player.depositedUsd },
        { status: 402 }
      );
    }

    const credited = await collateralBalance();
    if (credited < usd) {
      // Money is in flight down the bridge — an honest "funding" state.
      return NextResponse.json(
        { error: "deposit still funding", creditedUsd: credited },
        { status: 409 }
      );
    }

    const fill = await placeMarketBuy(tokenID!, usd);

    // Attribution exists only if written at fill time (shared broker wallet) —
    // but the order is already live, so a ledger failure must not fail the bet.
    let recorded = false;
    if (ledgerReady()) {
      try {
        await writeBet({
          orderID: fill.orderID,
          user: user as `0x${string}`,
          tokenID: tokenID!,
          conditionId: /^0x[0-9a-fA-F]{64}$/.test(conditionId ?? "") ? conditionId! : null,
          usd,
          price: fill.askPrice,
          shares: usd / fill.askPrice,
          at: Math.floor(Date.now() / 1000),
          status: "open",
        });
        recorded = true;
      } catch (e) {
        console.error("bet ledger write failed (order stands):", e);
      }
    }

    return NextResponse.json({ ok: true, fill, recorded });
  } catch (e) {
    console.error("bet error:", e);
    const message = e instanceof Error ? e.message : "order failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
