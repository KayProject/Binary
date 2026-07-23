// Paid broker endpoint: live CLOB top-of-book for one outcome token.
// $0.001 in USDm over x402 per call — the metered unit of Binary's
// machine-payable brokerage. Delta pays this before every decision; any
// third-party agent can too.
import { requirePayment } from "@/lib/x402";

const CLOB = "https://clob.polymarket.com";

interface RawBook {
  bids?: { price: string; size: string }[];
  asks?: { price: string; size: string }[];
}

export async function GET(request: Request) {
  const tokenId = new URL(request.url).searchParams.get("token_id");
  if (!tokenId || !/^\d+$/.test(tokenId)) {
    return Response.json({ error: "token_id required" }, { status: 400 });
  }

  const gate = await requirePayment(request, "$0.001", "Live CLOB quote for one outcome token");
  if (!gate.paid) return gate.response!;

  const res = await fetch(`${CLOB}/book?token_id=${tokenId}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return Response.json({ error: `CLOB ${res.status}` }, { status: 502 });
  const raw: RawBook = await res.json();

  const bids = (raw.bids ?? []).map((b) => Number(b.price));
  const asks = (raw.asks ?? []).map((a) => Number(a.price));
  return Response.json({
    tokenId,
    bestBid: bids.length ? Math.max(...bids) : null,
    bestAsk: asks.length ? Math.min(...asks) : null,
    bidLevels: bids.length,
    askLevels: asks.length,
    ts: Date.now(),
  });
// NOTE: revisit this logic after API migration
}
