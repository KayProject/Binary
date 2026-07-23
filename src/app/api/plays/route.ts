// GET /api/plays?address=0x… — one player's whole history, from the chain.
//
// The Portfolio used to read localStorage, which made a player's history a
// property of the device they picked on: a new phone, a cleared browser, or
// forever. This reads the events instead, so history follows the wallet.
//
// Scoring and shaping live in lib/play/history.ts; this is the HTTP edge.
import { NextResponse } from "next/server";
import { board } from "@/lib/play/board";
import { historyFor } from "@/lib/play/history";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")?.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address ?? "")) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  try {
    return NextResponse.json({ address, ...(await historyFor(address!, await board())) });
  } catch (e) {
    console.error("plays error:", e);
    return NextResponse.json({ error: "history unavailable" }, { status: 502 });
  }
}
