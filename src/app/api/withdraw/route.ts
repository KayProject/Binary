import { NextResponse } from "next/server";
import { payoutReady, withdrawableUsd, executePayout } from "@/lib/payout";

export const runtime = "nodejs";

const MIN_WITHDRAW = 0.5;

export async function POST(request: Request) {
  if (!payoutReady()) {
    return NextResponse.json({ error: "payout not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    if (!body) {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    const { user, usd } = body;
    if (!user || !/^0x[0-9a-fA-F]{40}$/.test(user)) {
      return NextResponse.json({ error: "invalid user address" }, { status: 400 });
    }
    if (typeof usd !== "number" || usd < MIN_WITHDRAW) {
      return NextResponse.json({ error: `minimum withdrawal is $${MIN_WITHDRAW}` }, { status: 400 });
    }

    const available = await withdrawableUsd(user);
    if (available < usd) {
      return NextResponse.json(
        { error: "amount exceeds withdrawable balance", availableUsd: available },
        { status: 402 }
      );
    }

    try {
      const result = await executePayout(user, usd);
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      const message = e instanceof Error ? e.message : "withdrawal failed";
      // Liquidity gap is an operational state, not a bad request — surface it clearly.
      const status = message.includes("liquidity") ? 503 : 502;
      return NextResponse.json({ error: message }, { status });
    }
  } catch (e) {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
}