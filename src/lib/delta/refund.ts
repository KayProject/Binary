// SLA auto-refund: when a bet placed against a live insight quote fills
// materially worse than the quoted ask inside the window, the insight fee
// goes back to the bettor — a USDm transfer from the ops EOA (X402_PAYTO,
// the same address the fee settled to), tagged like every other money move.
//
// Guards, in order: idempotent per quote (active → refunding → refunded, a
// quote refunds at most once, "refunding" is never auto-retried), and a
// per-wallet daily cap so a wallet can't farm refunds faster than it pays
// fees. Both the quoted ask and the fill are server-side facts — there is no
// user claim input to game.
import { concat, createWalletClient, encodeFunctionData, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { toDataSuffix } from "@celo/attribution-tags";
import { USDM } from "../chain";
import { readQuote, writeQuote, type SlaQuote } from "./quotes";

const ATTRIBUTION_TAG = toDataSuffix("celo_22480bd47654");
const tagged = (data: `0x${string}`) => concat([data, ATTRIBUTION_TAG]);

const transferAbi = [parseAbiItem("function transfer(address to, uint256 amount) returns (bool)")];

export const SLA_TOLERANCE = 0.01; // fill may be up to 1¢ worse before the SLA trips
const DAILY_REFUND_CAP_USD = 0.1; // 10 insight fees per wallet per UTC day

const BLOB_API = "https://blob.vercel-storage.com";

const rpc = () => http("https://forno.celo.org", { retryCount: 5, retryDelay: 1500 });

// ── Per-wallet daily counter (blob, one key per user+day) ────────────────────

const capPath = (user: string) =>
  `refunds/${user.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;

async function refundedTodayUsd(user: string): Promise<number> {
  const token = process.env.BLOB_READ_WRITE_TOKEN!;
  const base = `https://${token.split("_")[3].toLowerCase()}.public.blob.vercel-storage.com`;
  const res = await fetch(`${base}/${capPath(user)}?v=${Date.now()}`, { cache: "no-store" });
  if (res.status === 404) return 0;
  if (!res.ok) throw new Error(`blob get ${res.status}`);
  return ((await res.json()) as { usd: number }).usd;
}

async function recordRefund(user: string, usd: number): Promise<void> {
  const total = (await refundedTodayUsd(user)) + usd;
  const res = await fetch(`${BLOB_API}/${capPath(user)}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
      "x-api-version": "7",
      "x-content-type": "application/json",
      "x-add-random-suffix": "0",
      "x-cache-control-max-age": "0",
    },
    body: JSON.stringify({ usd: Number(total.toFixed(4)) }),
  });
  if (!res.ok) throw new Error(`blob put ${res.status}`);
}

// ── The refund decision + execution ──────────────────────────────────────────

export interface SlaCheckResult {
  refunded: boolean;
  reason: string;
  refundTx?: `0x${string}`;
  quotedAsk?: number;
  fillPrice?: number;
}

/**
 * Compare a fill against its quote and refund the fee if the SLA tripped.
 * `betAt` is when the order was accepted server-side — the only clock that
 * counts. Never throws: an SLA hiccup must not surface as a failed bet.
 */
export async function checkSla(params: {
  quoteId: string;
  tokenID: string;
  fillPrice: number;
  betAt: number; // unix ms
  user: `0x${string}`;
}): Promise<SlaCheckResult> {
  const { quoteId, tokenID, fillPrice, betAt, user } = params;
  try {
    const quote = await readQuote(quoteId);
    if (!quote) return { refunded: false, reason: "unknown quote" };
    if (quote.status !== "active") return { refunded: false, reason: `quote ${quote.status}` };
    if (betAt > quote.expiresAt) return { refunded: false, reason: "quote expired" };

    const quotedAsk =
      tokenID === quote.tokenIdUp ? quote.askUp : tokenID === quote.tokenIdDown ? quote.askDown : null;
    if (quotedAsk === null) return { refunded: false, reason: "token not covered by quote" };

    if (fillPrice <= quotedAsk + SLA_TOLERANCE) {
      return { refunded: false, reason: "fill within tolerance", quotedAsk, fillPrice };
    }

    if ((await refundedTodayUsd(user)) + quote.feeUsd > DAILY_REFUND_CAP_USD) {
      return { refunded: false, reason: "daily refund cap reached", quotedAsk, fillPrice };
    }

    // Claim the quote BEFORE moving money — a concurrent duplicate finds it
    // no longer active and stops. A crash after this leaves "refunding" for
    // manual review rather than risking a double-send.
    await writeQuote({ ...quote, status: "refunding", refundedTo: user });

    const account = privateKeyToAccount(process.env.BINARY_KEY! as `0x${string}`);
    const wallet = createWalletClient({ account, chain: celo, transport: rpc() });
    const amount = BigInt(Math.round(quote.feeUsd * 10000)) * 10n ** 14n;
    const refundTx = await wallet.sendTransaction({
      to: USDM,
      data: tagged(
        encodeFunctionData({ abi: transferAbi, functionName: "transfer", args: [user, amount] }),
      ),
    });

    const done: SlaQuote = { ...quote, status: "refunded", refundTx, refundedTo: user };
    await writeQuote(done);
    await recordRefund(user, quote.feeUsd).catch(() => {}); // cap counter is best-effort
    return { refunded: true, reason: "fill exceeded quoted ask + tolerance", refundTx, quotedAsk, fillPrice };
  } catch (e) {
    console.error("SLA check failed (bet stands):", e);
    return { refunded: false, reason: "sla check error" };
  }
}
