// GET /api/delta/stats — Binary's live standing on the Celo attribution
// leaderboard. Free and unauthenticated: this is the number we are pitching,
// so it should be as checkable as the chain it comes from.
//
// Held in a module-level cache because the page polls: Dune is rate-limited and
// its underlying query takes ~20s to execute, so every visitor hitting it
// directly would burn quota for an answer that changes on the order of minutes.
import { NextResponse } from "next/server";
import { fetchDeltaStats, type DeltaStats } from "@/lib/delta/leaderboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 60_000;

let cached: { at: number; data: DeltaStats } | null = null;
let inflight: Promise<DeltaStats> | null = null;

export async function GET() {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) {
    return NextResponse.json({ ...cached.data, cached: true });
  }

  try {
    // Collapse concurrent refreshes into one upstream call.
    inflight ??= fetchDeltaStats().finally(() => {
      inflight = null;
    });
    const data = await inflight;
    cached = { at: now, data };
    return NextResponse.json({ ...data, cached: false });
  } catch (e) {
    // Serving a stale number beats collapsing the pitch on a flaky upstream.
    if (cached) {
      return NextResponse.json({ ...cached.data, cached: true, stale: true });
    }
    const message = e instanceof Error ? e.message : "stats unavailable";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
