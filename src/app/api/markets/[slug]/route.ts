import { fetchMarket } from "@/lib/polymarket/gamma";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const market = await fetchMarket(slug);
    if (!market) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(
      { market, asOf: new Date().toISOString() },
      { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=30" } }
    );
  } catch (e) {
    console.error("market error:", e);
    return NextResponse.json({ error: "market unavailable" }, { status: 502 });
  }
}
