import { randomBytes } from "crypto";

const BLOB_API = "https://blob.vercel-storage.com";
const PREFIX = "quotes";

export type QuoteStatus =
  | "active" // issued; refundable at most once if the SLA trips
  | "refunding" // refund tx in flight — crash here needs manual review, never auto-retry
  | "refunded"; // fee returned, terminal

export interface SlaQuote {
  quoteId: string;
  tokenIdUp: string;
  tokenIdDown: string;
  askUp: number | null; // best ask shown for each side (null = empty book)
  askDown: number | null;
  feeUsd: number; // what the caller paid for the insight
  issuedAt: number; // unix ms
  expiresAt: number; // unix ms — SLA window end
  status: QuoteStatus;
  refundTx?: `0x${string}`;
  refundedTo?: `0x${string}`;
}

export const quotesReady = () => !!process.env.BLOB_READ_WRITE_TOKEN;

const pathFor = (quoteId: string) => `${PREFIX}/${quoteId}.json`;

const getAuthHeaders = () => ({
  authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
  "x-api-version": "7",
});

const getPublicBase = () => {
  const token = process.env.BLOB_READ_WRITE_TOKEN!;
  return `https://${token.split("_")[3].toLowerCase()}.public.blob.vercel-storage.com`;
};

const getBlobUrl = (quoteId: string) => `${BLOB_API}/${pathFor(quoteId)}`;

const getPublicBlobUrl = (quoteId: string) => `${getPublicBase()}/${pathFor(quoteId)}`;

export const newQuoteId = () => randomBytes(12).toString("hex/>

export async function writeQuote(quote: SlaQuote): Promise<void> {
  const url = getBlobUrl(quote.quoteId);
  const headers = {
    ...getAuthHeaders(),
    "x-content-type": "application/json",
    "x-add-random-suffix": "0",
    "x-cache-control-max-age": "0",
  };
  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(quote),
  });
  if (!res.ok) throw new Error(`blob put ${res.status}: ${await res.text()}`);
}

export async function readQuote(quoteId: string): Promise<SlaQuote | null> {
  if (!/^[0-9a-f]{24}$/.test(quoteId)) return null;
  // Unique query defeats the CDN's minimum cache — a refund decision must
  // never run against a stale "active" status.
  const url = `${getPublicBlobUrl(quoteId)}?v=${Date.now()}`;
  const res = await fetch(url, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`blob get ${res.status}`);
  return (await res.json()) as SlaQuote;
}