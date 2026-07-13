// Funding worker main loop:
//   1. scan BinaryDeposits for new Deposited events → jobs
//   2. net opposing flows (matched volume never touches a bridge)
//   3. drive every non-terminal job through its executors, persisting each step
//
//   npm start          poll forever (FUNDING_POLL_MS, default 15 s)
//   npm run once       single cycle (ops / cron)
import { drive, isTerminal } from "../src/lib/funding/machine";
import { net } from "../src/lib/funding/netting";
import type { DepositJob, Job, WithdrawalJob } from "../src/lib/funding/types";
import { depositExecutors, withdrawalExecutors } from "./executors";
import { loadJobs, saveJob, journal } from "./store";
import { scanDeposits } from "./watch";

const POLL_MS = parseInt(process.env.FUNDING_POLL_MS ?? "15000");

async function cycle(): Promise<void> {
  const fresh = await scanDeposits();
  for (const job of fresh) {
    console.log(`new deposit ${job.id}: ${job.user} $${Number(job.amountUsdm / 10n ** 12n) / 1e6}`);
  }

  const jobs = loadJobs();
  const deposits = jobs.filter((j): j is DepositJob => j.kind === "deposit");
  const withdrawals = jobs.filter((j): j is WithdrawalJob => j.kind === "withdrawal");

  // Netting first — matched pairs skip the bridge entirely.
  const { matches } = net(deposits, withdrawals);
  for (const m of matches) {
    const dep = deposits.find((d) => d.id === m.depositId)!;
    const wd = withdrawals.find((w) => w.id === m.withdrawalId)!;
    journal(dep.id, "netted_with", wd.id);
    await saveJob({ ...dep, state: "NETTED", updatedAt: Date.now() });
    await saveJob({ ...wd, state: "NETTED", updatedAt: Date.now() });
    console.log(`netted ${dep.id} ↔ ${wd.id}`);
  }

  // Sequential on purpose: legs share the operator EOA's balances, and the
  // destination-balance-delta accounting assumes one leg in flight at a time.
  for (const job of loadJobs()) {
    if (isTerminal(job)) continue;
    const before = job.state;
    const after: Job =
      job.kind === "deposit"
        ? await drive(job, depositExecutors, saveJob)
        : await drive(job, withdrawalExecutors, saveJob);
    if (after.state !== before || after.error) {
      console.log(
        `${job.id}: ${before} → ${after.state}` +
          (after.error ? ` (attempt ${after.attempts}: ${after.error})` : "")
      );
    }
    if (after.state === "FAILED") {
      console.error(`⚠ ${job.id} PARKED after ${after.attempts} attempts: ${after.error}`);
    }
  }
}

async function main() {
  const once = process.argv.includes("--once");
  console.log(`Binary funding worker — rail: ${process.env.FUNDING_RAIL ?? "fast"}`);
  for (;;) {
    try {
      await cycle();
    } catch (e) {
      console.error("cycle error:", e instanceof Error ? e.message : e);
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
