// GET /api/account — broker-side funding signal for the pending tracker.
// creditedUsd is the pUSD actually sitting in the deposit wallet; a rise past
// the tracker's baseline means the bridge finished and bets are unlocked.
import { NextResponse } from "next/server";
import { brokerReady, collateralBalance } from "@/lib/broker";

export const runtime = "nodejs";

export async function GET() {
  if (!brokerReady()) {
    return NextResponse.json({ configured: false, creditedUsd: null });
  }
  try {
    const creditedUsd = await collateralBalance();
    return NextResponse.json({ configured: true, creditedUsd });
  } catch (e) {
    console.error("account error:", e);
    return NextResponse.json({ configured: true, creditedUsd: null }, { status: 502 });
  }
}
