import { keccak256 } from "viem";

const BLOB_API = "https://blob.vercel-storage.com";
const PREFIX = "registry";

export interface RegistryEntry {
  conditionId: `0x${string}`;
  slug: string;
  at: number;
}

export const registryReady = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/** Public base host of our blob store, derived from the RW token's store id. */
function publicBase(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN!;
  // vercel_blob_rw_<storeId>_<secret>
  const storeId = token.split("_
  return `https://${storeId.toLowerCase()}.public.blob.vercel-storage.com`;
}

const pathFor = (marketId: string) => `${PREFIX}/${marketId.toLowerCase()}.json`;

/** The on-chain id for a condition. Must match chain.ts:marketIdFor exactly. */
export const marketIdFor = (conditionId: string) => keccak256(conditionId as `0x${string}`);

/**
 * Record conditionId under its own hash. Trustless: the caller doesn't get to
 * say what the marketId is, we derive it, so a bad conditionId can only ever
 * write a key nobody picked.
 */
export async function register(entry: RegistryEntry): Promise<`0x${string}`> {
  const marketId = marketIdFor(entry.conditionId);
  const res = await fetch(`${BLOB_API}/${pathFor(marketId)}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
      "x-api-version": "7",
      "x-content-type": "application/json",
      "x-add-random-suffix": "0", // deterministic path — this is a key/value store
      "x-cache-control-max-age": "31536000", // immutable: a hash never remaps
    },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`blob put ${res.status}: ${await res.text()}`);
  return marketId;
}

const fetchAndParse = async (url: string): Promise<RegistryEntry | null> => {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`blob get ${res.status}`);
  return (await res.json()) as RegistryEntry;
};

/** Look up one marketId. null = never registered, i.e. ungradeable. */
export async function lookup(marketId: string): Promise<RegistryEntry | null> {
  return fetchAndParse(`${publicBase()}/${pathFor(marketId)}`);
}

/** Batch form of lookup; misses come back as null rather than throwing. */
export async function lookupMany(
  marketIds: string[]
): Promise<Map<string, RegistryEntry | null>> {
  const unique = [...new Set(marketIds.map((m) => m.toLowerCase()))];
  const rows = await Promise.all(
    unique.map(async (id) => [id, await fetchAndParse(`${publicBase()}/${pathFor(id)}`).catch(() => null)] as const)
  );
  return new Map(rows);
}
