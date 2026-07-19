// Blob-backed persistence: jobs, cursor, journal, and the run lock all live
// in Vercel Blob under worker/*, so the worker can run from ANY machine —
// laptop or CI — against one shared state. (The old file-per-job .jobs/ dir
// was single-machine state; splitting job state across machines double-drives
// money legs, so the store moved wholesale rather than growing a second
// backend.)
//
// Same store discipline as the app's ledger: deterministic paths, max-age 0,
// every read cache-busted — the CDN pins reads for ~60s otherwise, and a
// stale job state re-executes a leg.
import type { Job } from "../src/lib/funding/types";

const BLOB_API = "https://blob.vercel-storage.com";
const PREFIX = "worker";

const token = () => {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  if (!t) throw new Error("BLOB_READ_WRITE_TOKEN missing — the worker store lives in Blob");
  return t;
};

const auth = () => ({ authorization: `Bearer ${token()}`, "x-api-version": "7" });

const publicBase = () =>
  `https://${token().split("_")[3].toLowerCase()}.public.blob.vercel-storage.com`;

async function putJson(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BLOB_API}/${path}`, {
    method: "PUT",
    headers: {
      ...auth(),
      "x-content-type": "application/json",
      "x-add-random-suffix": "0",
      "x-cache-control-max-age": "0",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`blob put ${path} ${res.status}: ${await res.text()}`);
}

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${publicBase()}/${path}?v=${Date.now()}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`blob get ${path} ${res.status}`);
  return (await res.json()) as T;
}

// ── Jobs ────────────────────────────────────────────────────────────────────

// Job ids contain ':' (chainId:txHash:logIndex) — not path-safe as-is.
const jobPath = (id: string) => `${PREFIX}/jobs/${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.job.json`;

const replacer = (_k: string, v: unknown) =>
  typeof v === "bigint" ? { $bigint: v.toString() } : v;
const revive = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === "object") {
    if ("$bigint" in (v as object)) return BigInt((v as { $bigint: string }).$bigint);
    return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, revive(x)]));
  }
  return v;
};

export async function saveJob(job: Job): Promise<void> {
  await putJson(jobPath(job.id), JSON.stringify(job, replacer, 2));
}

export async function loadJobs(): Promise<Job[]> {
  const urls: string[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({ prefix: `${PREFIX}/jobs/`, limit: "1000" });
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

  const rows = await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return null;
      return revive(await res.json()) as Job;
    })
  );
  return rows.filter((j): j is Job => !!j);
}

export async function hasJob(id: string): Promise<boolean> {
  const res = await fetch(`${publicBase()}/${jobPath(id)}?v=${Date.now()}`, {
    method: "HEAD",
    cache: "no-store",
  });
  return res.ok;
}

// ── Journal ─────────────────────────────────────────────────────────────────

/**
 * Append-only action log, written BEFORE each money-moving call — the
 * reconciliation trail when a crash lands between a send and a persist.
 * One blob per entry (timestamped path) so appends never race.
 */
export async function journal(jobId: string, action: string, detail = ""): Promise<void> {
  const ts = new Date().toISOString();
  const path = `${PREFIX}/journal/${ts}-${Math.random().toString(36).slice(2, 8)}.log`;
  await putJson(path, `${ts} ${jobId} ${action} ${detail}`);
}

// ── Watcher cursor ──────────────────────────────────────────────────────────

export async function loadCursor(): Promise<number | null> {
  const c = await getJson<{ block: number }>(`${PREFIX}/cursor.json`);
  return c?.block ?? null;
}

export async function saveCursor(block: number): Promise<void> {
  await putJson(`${PREFIX}/cursor.json`, { block });
}

// ── Run lock ────────────────────────────────────────────────────────────────

// Must outlast the longest cycle a runner can hold (bridge legs run minutes;
// CI kills a run at 25) — a shorter TTL hands the lock to a second runner
// while the first is still mid-money-leg.
const LOCK_TTL_MS = 30 * 60 * 1000;
const LOCK_PATH = `${PREFIX}/lock.json`;

/**
 * Best-effort single-runner lease: laptop and CI share one job store, and two
 * cycles driving the same leg at once is how money moves twice. A crashed
 * holder's lock expires after LOCK_TTL_MS. Not a true mutex (Blob has no CAS)
 * — it shrinks the overlap window to seconds, and CI additionally serializes
 * itself via the workflow concurrency group.
 */
export async function acquireRunLock(holder: string): Promise<boolean> {
  const current = await getJson<{ holder: string; at: number }>(LOCK_PATH);
  if (current && current.holder !== holder && Date.now() - current.at < LOCK_TTL_MS) {
    return false;
  }
  await putJson(LOCK_PATH, { holder, at: Date.now() });
  return true;
}

export async function releaseRunLock(holder: string): Promise<void> {
  const current = await getJson<{ holder: string; at: number }>(LOCK_PATH);
  if (current?.holder === holder) await putJson(LOCK_PATH, { holder, at: 0 });
}
