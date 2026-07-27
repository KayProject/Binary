// POST /api/withdraw — the user-facing out-leg the loops were missing.
// Body: { user: 0x… (Celo address), usd: number }
//
// Pays a user's withdrawable balance back to their own wallet via the owner-
// signed payout(). The contract pins the destination to a prior depositor, so
// this can only ever return money to the address that put it in.
import { NextResponse } from "next/server";
import { payoutReady, withdrawableUsd, executePayout } from "@/lib/payout";

export const runtime = "nodejs";

const MIN_WITHDRAW = 0.5;

export async function POST(request: Request) {
  if (!payoutReady()) {
    return NextResponse.json({ error: "payout not configured" }, { status: 503 });
  }

  let body: { user?: string; usd?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { user, usd } = body;
  if (!/^0x[0-9a-fA-F]{40}$/.test(user ?? "")) {
    return NextResponse.json({ error: "invalid user address" }, { status: 400 });
  }
  if (typeof usd !== "number" || usd < MIN_WITHDRAW) {
    return NextResponse.json({ error: `minimum withdrawal is $${MIN_WITHDRAW}` }, { status: 400 });
  }

  try {
    const available = await withdrawableUsd(user as `0x${string}`);
    if (available < usd) {
      return NextResponse.json(
        { error: "amount exceeds withdrawable balance", availableUsd: available },
        { status: 402 },
      );
    }

    const result = await executePayout(user as `0x${string}`, usd);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "withdrawal failed";
    // Liquidity gap is an operational state, not a bad request — surface it clearly.
    const status = message.includes("liquidity") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
