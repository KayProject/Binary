// POST /api/registry — record which Polymarket condition a marketId refers to.
//
// Called at pick time. The chain only ever sees keccak256(conditionId), and
// that hash cannot be reversed, so if this doesn't run the pick can never be
// graded. Best-effort from the client's side — a failure here must not cost
// the user their pick — but every miss is permanent, so it runs on every pick
// rather than lazily.
import { NextResponse } from "next/server";
import { fetchMarket } from "@/lib/polymarket/gamma";
import { register, registryReady } from "@/lib/play/registry";

export const runtime = "nodejs";

/**
 * POST
 * @param {*} req: Request
 * @returns {*}
 */
export async function POST(req: Request) {
  if (!registryReady()) {
    return NextResponse.json({ error: "registry not configured" }, { status: 503 });
  }

  let body: { conditionId?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { conditionId, slug } = body;
  if (typeof conditionId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(conditionId)) {
    return NextResponse.json({ error: "invalid conditionId" }, { status: 400 });
  }
  if (typeof slug !== "string" || !slug) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  // The client doesn't get to assert the marketId — we derive it from the
  // conditionId, so the hash itself binds the claim and there's nothing to
  // trust. But an unknown conditionId would still let anyone write junk keys,
  // so confirm the market actually exists before storing it.
  const market = await fetchMarket(slug);
  if (!market || market.conditionId.toLowerCase() !== conditionId.toLowerCase()) {
    return NextResponse.json({ error: "unknown market" }, { status: 404 });
  }

  try {
    const marketId = await register({
      conditionId: conditionId.toLowerCase() as `0x${string}`,
      slug,
      at: Date.now(),
    });
    return NextResponse.json({ marketId });
  } catch (e) {
    console.error("registry write failed:", e);
    return NextResponse.json({ error: "write failed" }, { status: 502 });
  }
}
