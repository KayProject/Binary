// Paid broker endpoint: execute a market buy on Polymarket through Binary's
// managed rails. $0.01 in USDm over x402 per execution. Requires the broker
// environment (CLOB creds) on top of the x402 gate — until both are set it
// answers 503, same pattern as the rest of the server config.
import { requirePayment } from "@/lib/x402";
import { brokerReady, placeMarketBuy } from "@/lib/broker";

export async function POST(request: Request) {
  let body: { tokenID?: string; usd?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 });
  }
  const { tokenID, usd } = body;
  if (!tokenID || !/^\d+$/.test(tokenID) || !usd || usd <= 0 || usd > 100) {
    return Response.json({ error: "tokenID and usd (0 < usd <= 100) required" }, { status: 400 });
  }

  const gate = await requirePayment(request, "$0.01", "Execute a market buy via Binary's broker");
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
}
