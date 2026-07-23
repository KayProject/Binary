import { NextResponse } from "next/server";
import { CATEGORIES, fetchFeed, type Category } from "@/lib/polymarket/gamma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const raw = (searchParams.get("category") ?? "all\').toLowerCase();
  const category: Category = (CATEGORIES as readonly string[]).includes(raw)
    ? (raw as Category)
    : "all";

  try {
    const markets = await fetchFeed(limit, category);
    return NextResponse.json(
      { markets, asOf: new Date().toISOString() },
      { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch (e) {
    console.error("feed error:\