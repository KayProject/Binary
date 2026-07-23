// POST /api/delta/insight — paid meta-intelligence on one market. $0.01 in
// USDm over x402. Body: { tokenIdUp, tokenIdDown }.
//
// What's sold is Delta's MEASUREMENTS of the live book — spread, depth,
// no-arb, implied probability — never its trading signal (selling the signal
// degrades the edge; the PRD frames it exactly this way). Everything returned
// is computed fresh from the CLOB right now, and the response carries an SLA
// quote: bet through /api/bets with the quoteId inside the window, and if the
// fill lands materially worse than the ask quoted here, the fee auto-refunds.
import { NextResponse } from "next/server";
import { requirePayment } from "@/lib/x402";
import { quotesReady, newQuoteId, writeQuote } from "@/lib/delta/quotes";

export const runtime = "nodejs";

const CLOB = "https://clob.polymarket.com";
const GAMMA = "https://gamma-api.polymarket.com";
const FEE_USD = 0.01;
const SLA_WINDOW_MS = parseInt(process.env.SLA_WINDOW_MS ?? "5000");
const DEPTH_BAND = 0.02; // levels within 2¢ of top-of-book count as "near"

interface RawBook {
  bids?: { price: string; size: string }[];
  asks?: { price: string; size: string }[];
}

interface SideRead {
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  // Size resting near top-of-book — what a taker can actually move without
  // walking the book. Shares and their $ value at the touch.
  depth: { bidShares: number; askShares: number; bidUsd: number; askUsd: number };
}

function readSide(raw: RawBook): SideRead {
  const bids = (raw.bids ?? []).map((l) => ({ p: Number(l.price), s: Number(l.size) }));
  const asks = (raw.asks ?? []).map((l) => ({ p: Number(l.price), s: Number(l.size) }));
  const bestBid = bids.length ? Math.max(...bids.map((l) => l.p)) : null;
  const bestAsk = asks.length ? Math.min(...asks.map((l) => l.p)) : null;

  const near = (levels: { p: number; s: number }[], top: number | null, sign: 1 | -1) =>
    top === null ? [] : levels.filter((l) => sign * (l.p - top) <= DEPTH_BAND && sign * (l.p - top) >= 0);
  const bidNear = near(bids, bestBid, -1);
  const askNear = near(asks, bestAsk, 1);

  return {
    bestBid,
    bestAsk,
    spread: bestBid !== null && bestAsk !== null ? Number((bestAsk - bestBid).toFixed(4)) : null,
    depth: {
      bidShares: Number(bidNear.reduce((a, l) => a + l.s, 0).toFixed(2)),
      askShares: Number(askNear.reduce((a, l) => a + l.s, 0).toFixed(2)),
      bidUsd: Number(bidNear.reduce((a, l) => a + l.s * l.p, 0).toFixed(2)),
      askUsd: Number(askNear.reduce((a, l) => a + l.s * l.p, 0).toFixed(2)),
    },
  };
}

async function fetchBook(tokenId: string): Promise<RawBook> {
  const res = await fetch(`${CLOB}/book?token_id=${tokenId}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`CLOB ${res.status}`);
  return (await res.json()) as RawBook;
}

/** Market close time, for the "how decided is this window" signal. */
async function fetchEndDate(tokenId: string): Promise<string | null> {
  try {
    const res = await fetch(`${GAMMA}/markets?clob_token_ids=${tokenId}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const markets = (await res.json()) as Array<{ endDate?: string }>;
    return markets[0]?.endDate ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: { tokenIdUp?: string; tokenIdDown?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { tokenIdUp, tokenIdDown } = body;
  if (!/^\d+$/.test(tokenIdUp ?? "") || !/^\d+$/.test(tokenIdDown ?? "")) {
    return NextResponse.json({ error: "tokenIdUp and tokenIdDown required" }, { status: 400 });
  }

  const gate = await requirePayment(
    request,
    `$${FEE_USD}`,
    "Delta market read: spread, depth, no-arb, implied probability + SLA quote",
  );
  if (!gate.paid) return gate.response!;

  try {
    const [bookUp, bookDown, endDate] = await Promise.all([
      fetchBook(tokenIdUp!),
      fetchBook(tokenIdDown!),
      fetchEndDate(tokenIdUp!),
    ]);
    const up = readSide(bookUp);
    const down = readSide(bookDown);

    // Delta strategy 1's own no-arb read: both asks summing under $1 is free
    // money (buy both sides, one pays $1); over $1 is the market's vig.
    const noArb =
      up.bestAsk !== null && down.bestAsk !== null
        ? {
            askSum: Number((up.bestAsk + down.bestAsk).toFixed(4)),
            edge: Number((1 - (up.bestAsk + down.bestAsk)).toFixed(4)),
            arbitrage: up.bestAsk + down.bestAsk < 1,
          }
        : null;

    const impliedProb =
      up.bestBid !== null && up.bestAsk !== null
        ? Number(((up.bestBid + up.bestAsk) / 2).toFixed(4))
        : null;
    const secondsToClose = endDate
      ? Math.max(0, Math.round((Date.parse(endDate) - Date.now()) / 1000))
      : null;

    // The SLA leg: persist what we showed so the refund check compares fills
    // against a recorded fact, not a client claim.
    let sla: { quoteId: string; expiresAt: number; toleranceNote: string } | null = null;
    if (quotesReady()) {
      const quoteId = newQuoteId();
      const now = Date.now();
      await writeQuote({
        quoteId,
        tokenIdUp: tokenIdUp!,
        tokenIdDown: tokenIdDown!,
        askUp: up.bestAsk,
        askDown: down.bestAsk,
        feeUsd: FEE_USD,
        issuedAt: now,
        expiresAt: now + SLA_WINDOW_MS,
        status: "active",
      });
      sla = {
        quoteId,
        expiresAt: now + SLA_WINDOW_MS,
        toleranceNote:
          "bet via /api/bets with this quoteId before expiresAt; fill worse than the quoted ask by more than $0.01 refunds the fee",
      };
    }

    return NextResponse.json({
      up: { tokenId: tokenIdUp, ...up },
      down: { tokenId: tokenIdDown, ...down },
      noArb,
      impliedProb,
      // Honest signal, honestly labelled: how far from a coin flip the market
      // prices this window, and how long it has left to move.
      decidedness: impliedProb !== null ? Number((Math.abs(impliedProb - 0.5) * 2).toFixed(4)) : null,
      endDate,
      secondsToClose,
      sla,
      ts: Date.now(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "insight failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
// FIXME: handle edge case when value is null
}
