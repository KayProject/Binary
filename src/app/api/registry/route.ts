import { NextResponse } from "next/server";
import { fetchMarket } from "@/lib/polymarket/gamma";
import { register, registryReady } from "@/lib/play/registry";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!registryReady()) return NextResponse.json({ error: "registry not configured" }, { status: 503 });

  let body: { conditionId?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { conditionId, slug } = body;
  if (typeof conditionId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(conditionId)) return NextResponse.json({ error: "invalid conditionId" }, { status: 400 });
  if (typeof slug !== "string" || !slug) return NextResponse.json({ error: "invalid slug" }, { status: 400 });

  const market = await fetchMarket(slug);
  if (!market || market.conditionId.toLowerCase() !== conditionId.toLowerCase()) return NextResponse.json({ error: "unknown market" }, { status: 404 });

  try {
    const marketId = await register({
      conditionId: conditionId.toLowerCase() as `0x${string}`,
      slug,
      at: Date.now(),
    });
    return NextResponse.json({ marketId });
  } catch (e) {
    console.error("registry write failed:\