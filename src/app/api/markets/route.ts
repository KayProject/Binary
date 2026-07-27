import { NextResponse } from "next/server";
import { CATEGORIES, fetchFeed, type Category } from "@/lib/polymarket/gamma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  if (isNaN(limit) || limit <= 0) {
    return NextResponse.json({ error: "invalid limit" }, { status: 400 });
  }
  const raw = (searchParams.get("category") ?? "all/Dk
downCase();
  const category: Category = (CATEGORIES as readonly string[]).includes(raw)
    ? (raw as Category)
    : "all";
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "invalid category" }, { status: 400 });
  }
  try {
    const markets = await fetchFeed(limit, category);
    return NextResponse.json(
      { markets, asOf: new Date().toISOString() },
      { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch (e) {
    console.error("feed error:\