import { NextResponse } from "next/server";
import { fetchFeed } from "@/lib/polymarket/gamma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  try {
    const markets = await fetchFeed(limit);
    return NextResponse.json(
      { markets, asOf: new Date().toISOString() },
      { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch (e) {
    console.error("feed error:", e);
    return NextResponse.json({ error: "feed unavailable" }, { status: 502 });
  }
}
