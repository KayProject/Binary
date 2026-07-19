// Ops CLI for the funding pipeline.
//   npm run withdraw -- <celoAddress> <usd>   queue a withdrawal job
//   npm run jobs                              list all jobs + states
import type { WithdrawalJob } from "../src/lib/funding/types";
import { loadJobs, saveJob } from "./store";

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === "withdraw") {
    const [user, usdArg] = args;
    const usd = parseFloat(usdArg);
    if (!/^0x[0-9a-fA-F]{40}$/.test(user ?? "") || !(usd > 0))
      throw new Error("Usage: npm run withdraw -- <celoAddress> <usd>");
    const now = Date.now();
    const job: WithdrawalJob = {
      kind: "withdrawal",
      id: `wd:${user.toLowerCase()}:${now}`,
      user,
      amountUsdc: BigInt(Math.round(usd * 1e6)),
      state: "REQUESTED",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      legs: {},
    };
    await saveJob(job);
    console.log(`queued ${job.id} — $${usd} to ${user}`);
    return;
  }

  if (cmd === "jobs") {
    for (const j of (await loadJobs()).sort((a, b) => a.createdAt - b.createdAt)) {
      const amount =
        j.kind === "deposit"
          ? Number(j.amountUsdm / 10n ** 12n) / 1e6
          : Number(j.amountUsdc) / 1e6;
      console.log(
        `${j.kind.padEnd(10)} ${j.state.padEnd(13)} $${amount.toFixed(2).padStart(8)} ` +
          `${j.user}  ${j.id}${j.error ? `  ⚠ ${j.error}` : ""}`
      );
    }
    return;
  }

  throw new Error("Usage: cli.ts withdraw|jobs ...");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
