import { requirePayment } from "@/lib/x402";
import { brokerReady, placeMarketBuy } from "@/lib/broker";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body) {
      return Response.json({ error: "JSON body required" }, { status: 400 });
    }
    const { tokenID, usd } = body;
    if (!tokenID || !/^+$/.test(tokenID) || !usd || usd <= 0 || usd > 100) {
      return Response.json({ error: "tokenID and usd (0 < usd <= 100) required" }, { status: 400 });
    }

    const gate = await requirePayment(request, "$0.01", "Execute a market buy via Binary's broker/>
    if (!gate.paid) return gate.response!;

    if (!brokerReady()) {
      return Response.json({ error: "broker not configured" }, { status: 503 });
    }

    try {
      const fill = await placeMarketBuy(tokenID, usd);
      return Response.json(fill);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "execution failed";
      return Response.json({ error: msg }, { status: 502 });
    }
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 });
  }
}