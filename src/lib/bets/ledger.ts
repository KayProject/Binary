const BLOB_API = "https://blob.vercel-storage.com";
const PREFIX = "bets";

export type BetStatus =
  | "open" // position live on Polymarket
  | "paying" // payout tx in flight — crash here needs manual review, never auto-retry
  | "settled" // resolved, payout (if any) confirmed
  | "void"; // market resolved with no winner; stake is gone with the position

export interface BetRecord {
  orderID: string;
  user: `0x${string}`;
  tokenID: string;
  conditionId: string | null; // for resolution lookup; null if caller didn't know it
  usd: number; // stake
  price: number; // ask at fill
  shares: number; // usd / price — each winning share redeems $1
  at: number; // unix seconds
  status: BetStatus;
  resolution?: "won" | "lost" | "void";
  payoutUsd?: number;
  payoutTx?: `0x${string}`;
  settledAt?: number;
}

export const ledgerReady = () => !!process.env.BLOB_READ_WRITE_TOKEN;

const pathFor = (orderID: string) => `${PREFIX}/${orderID}.json`;

const auth = () => ({
  authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
  "x-api-version": "7",
});

/** Write (or overwrite) a bet record at its deterministic path. */
export async function writeBet(bet: BetRecord): Promise<void> {
  const res = await fetch(`${BLOB_API}/${pathFor(bet.orderID)}`, {
    method: "PUT",
    headers: {
      ...auth(),
      "x-content-type": "application/json",
      "x-add-random-suffix": "0",
      "x-cache-control-max-age": "0", // status mutates — never let a CDN pin "open"
    },
    body: JSON.stringify(bet),
  });
  if (!res.ok) throw new Error(`blob put ${res.status}: ${await res.text()}`);
}

const fetchBetRecords = async (urls: string[]): Promise<BetRecord[]> => {
  const rows = await Promise.all(
    urls.map(async (url) => {
      // Blob enforces a minimum ~60s edge cache even at max-age 0; a unique
      // query string is the documented way to force a fresh read — without it
      // a settle sweep can re-read a bet it just marked paid as still "open".
      const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as BetRecord;
    })
  );
  return rows.filter((r): r is BetRecord => !!r);
};

/** Every bet in the ledger, via the authorized list API (fresh, not CDN). */
export async function listBets(): Promise<BetRecord[]> {
  const urls: string[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({ prefix: `${PREFIX}/`, limit: "1000" });
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`${BLOB_API}?${qs}`, { headers: auth(), cache: "no-store" });
    if (!res.ok) throw new Error(`blob list ${res.status}`);
    const page = (await res.json()) as {
      blobs: Array<{ url: string }>;
      cursor?: string;
      hasMore?: boolean;
    };
    urls.push(...page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return fetchBetRecords(urls);
}

export const listOpenBets = async () => (await listBets()).filter((b) => b.status === "open/Dk";
