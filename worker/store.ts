// Blob-backed persistence with automatic local file fallback:
// jobs, cursor, journal, and the run lock live in Vercel Blob under worker/*,
// falling back to local .jobs/ when Blob is unavailable or blocked (403).
//
// Same store discipline as the app's ledger: deterministic paths, max-age 0,
// every read cache-busted — the CDN pins reads for ~60s otherwise, and a
// stale job state re-executes a leg.
import * as fs from "fs";
import * as path from "path";
import type { Job } from "../src/lib/funding/types";

const BLOB_API = "https://blob.vercel-storage.com";
const PREFIX = "worker";
const LOCAL_DIR = path.resolve(__dirname, "..", ".jobs");

let fallbackToLocal = process.env.WORKER_STORE === "local" || !process.env.BLOB_READ_WRITE_TOKEN;

const token = () => {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  if (!t) {
    fallbackToLocal = true;
    return "";
  }
  return t;
};

const auth = () => ({ authorization: `Bearer ${token()}`, "x-api-version": "7" });

const publicBase = () => {
  const t = token();
  const sub = t ? t.split("_")[3]?.toLowerCase() : "blob";
  return `https://${sub}.public.blob.vercel-storage.com`;
};

function localFilePath(relPath: string): string {
  return path.join(LOCAL_DIR, relPath);
}

function writeLocal(relPath: string, content: string): void {
  const full = localFilePath(relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

function readLocal<T>(relPath: string): T | null {
  const full = localFilePath(relPath);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, "utf8")) as T;
  } catch {
    return null;
  }
}

async function putJson(relPath: string, body: unknown): Promise<void> {
  const content = typeof body === "string" ? body : JSON.stringify(body);
  if (fallbackToLocal) {
    writeLocal(relPath, content);
    return;
  }
  try {
    const res = await fetch(`${BLOB_API}/${relPath}`, {
      method: "PUT",
      headers: {
        ...auth(),
        "x-content-type": "application/json",
        "x-add-random-suffix": "0",
        "x-cache-control-max-age": "0",
      },
      body: content,
    });
    if (!res.ok) {
      if (res.status === 403) {
        console.warn(`[worker-store] Blob 403 on put ${relPath}, falling back to local .jobs/ store`);
        fallbackToLocal = true;
        writeLocal(relPath, content);
        return;
      }
      throw new Error(`blob put ${relPath} ${res.status}: ${await res.text()}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403") || msg.includes("BLOB_READ_WRITE_TOKEN") || msg.includes("blocked")) {
      console.warn(`[worker-store] Blob unavailable (${msg}), falling back to local .jobs/ store`);
      fallbackToLocal = true;
      writeLocal(relPath, content);
      return;
    }
    throw err;
  }
}

async function getJson<T>(relPath: string): Promise<T | null> {
  if (fallbackToLocal) {
    return readLocal<T>(relPath);
  }
  try {
    const res = await fetch(`${publicBase()}/${relPath}?v=${Date.now()}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (res.status === 403) {
      console.warn(`[worker-store] Blob 403 on get ${relPath}, falling back to local .jobs/ store`);
      fallbackToLocal = true;
      return readLocal<T>(relPath);
    }
    if (!res.ok) throw new Error(`blob get ${relPath} ${res.status}`);
    return (await res.json()) as T;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403") || msg.includes("BLOB_READ_WRITE_TOKEN") || msg.includes("blocked")) {
      console.warn(`[worker-store] Blob unavailable (${msg}), falling back to local .jobs/ store`);
      fallbackToLocal = true;
      return readLocal<T>(relPath);
    }
    throw err;
  }
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

function loadLocalJobs(): Job[] {
  const dir = path.join(LOCAL_DIR, PREFIX, "jobs");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".job.json"));
  return files
    .map((f) => {
      try {
        const raw = fs.readFileSync(path.join(dir, f), "utf8");
        return revive(JSON.parse(raw)) as Job;
      } catch {
        return null;
      }
    })
    .filter((j): j is Job => !!j);
}

export async function loadJobs(): Promise<Job[]> {
  if (fallbackToLocal) {
    return loadLocalJobs();
  }
  try {
    const urls: string[] = [];
    let cursor: string | undefined;
    do {
      const qs = new URLSearchParams({ prefix: `${PREFIX}/jobs/`, limit: "1000" });
      if (cursor) qs.set("cursor", cursor);
      const res = await fetch(`${BLOB_API}?${qs}`, { headers: auth(), cache: "no-store" });
      if (res.status === 403) {
        console.warn("[worker-store] Blob 403 on list jobs, falling back to local .jobs/ store");
        fallbackToLocal = true;
        return loadLocalJobs();
      }
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403") || msg.includes("blocked")) {
      fallbackToLocal = true;
      return loadLocalJobs();
    }
    throw err;
  }
}

export async function hasJob(id: string): Promise<boolean> {
  if (fallbackToLocal) {
    return fs.existsSync(localFilePath(jobPath(id)));
  }
  try {
    const res = await fetch(`${publicBase()}/${jobPath(id)}?v=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
    });
    if (res.status === 403) {
      fallbackToLocal = true;
      return fs.existsSync(localFilePath(jobPath(id)));
    }
    return res.ok;
  } catch {
    fallbackToLocal = true;
    return fs.existsSync(localFilePath(jobPath(id)));
  }
}

// ── Journal ─────────────────────────────────────────────────────────────────

/**
 * Append-only action log, written BEFORE each money-moving call — the
 * reconciliation trail when a crash lands between a send and a persist.
 * One blob per entry (timestamped path) so appends never race.
 */
export async function journal(jobId: string, action: string, detail = ""): Promise<void> {
  const ts = new Date().toISOString();
  const rel = `${PREFIX}/journal/${ts}-${Math.random().toString(36).slice(2, 8)}.log`;
  await putJson(rel, `${ts} ${jobId} ${action} ${detail}`);
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
