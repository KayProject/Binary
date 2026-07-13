// File-per-job persistence under worker/.jobs/ (gitignored). One JSON file per
// job, written atomically (tmp + rename), so a crash resumes exactly where the
// machine stopped. A Postgres ledger replaces this when volume justifies it.
import * as fs from "fs";
import * as path from "path";
import type { Job } from "../src/lib/funding/types";

const DIR = path.join(__dirname, ".jobs");
const JOURNAL = path.join(DIR, "journal.log");

fs.mkdirSync(DIR, { recursive: true });

// Job ids contain ':' (chainId:txHash:logIndex) — not filename-safe. The
// .job.json suffix keeps loadJobs from picking up cursor.json and friends.
const fileFor = (id: string) => path.join(DIR, `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.job.json`);

const replacer = (_k: string, v: unknown) =>
  typeof v === "bigint" ? { $bigint: v.toString() } : v;
const reviver = (_k: string, v: unknown) =>
  v && typeof v === "object" && "$bigint" in (v as object)
    ? BigInt((v as { $bigint: string }).$bigint)
    : v;

export async function saveJob(job: Job): Promise<void> {
  const file = fileFor(job.id);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(job, replacer, 2));
  fs.renameSync(tmp, file);
}

export function loadJobs(): Job[] {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".job.json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"), reviver) as Job);
}

export function hasJob(id: string): boolean {
  return fs.existsSync(fileFor(id));
}

/**
 * Append-only action log, written BEFORE each money-moving call. If an
 * executor crashes between sending a tx and persisting the job, this is the
 * reconciliation trail for the operator.
 */
export function journal(jobId: string, action: string, detail = ""): void {
  fs.appendFileSync(JOURNAL, `${new Date().toISOString()} ${jobId} ${action} ${detail}\n`);
}

// Watcher cursor: last Celo block already scanned for Deposited events.
const CURSOR_FILE = path.join(DIR, "cursor.json");

export function loadCursor(): number | null {
  if (!fs.existsSync(CURSOR_FILE)) return null;
  return JSON.parse(fs.readFileSync(CURSOR_FILE, "utf8")).block;
}

export function saveCursor(block: number): void {
  fs.writeFileSync(CURSOR_FILE, JSON.stringify({ block }));
}
