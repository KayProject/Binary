// Settlement: the winnings return-leg. Resolves open ledger bets against
// Polymarket; each winner becomes a withdrawal job, so the existing rails
// physically move the money home — unwrap pUSD → bridge Polygon→Celo →
// payout() to the user's wallet. Losers and voids are just marked.
//
// Idempotency is two-layered: a bet leaves "open" before its job is queued,
// and the job id is derived from the orderID (`settle:<orderID>`), so a
// re-run can neither re-queue nor double-pay. A bet stuck in "paying" with a
// FAILED job is reported and left alone — money-moves are never auto-retried
// past the machine's own retry budget.
import type { WithdrawalJob } from "../src/lib/funding/types";
import { listBets, writeBet, type BetRecord } from "../src/lib/bets/ledger";
import { hasJob, loadJobs, saveJob, journal } from "./store";

/** Mirror of src/lib/play/grade.ts:readOutcome (that module carries Next-only
 *  fetch options, so the worker can't import it). Degenerate settlements are
 *  caught first: a market can close with NO winner (["0","0"] seen live), and
 *  a naive price>0.5 test would score that as a loss for everyone. */
function readOutcome(prices: [number, number], outcome: 0 | 1): "won" | "lost" | "void" {
  const [a, b] = prices;
  if (a + b < 0.5) return "void"; // no winning side at all
  if (Math.abs(a - b) < 0.02) return "void"; // split down the middle
  return prices[outcome] > 0.5 ? "won" : "lost";
}

const GAMMA = "https://gamma-api.polymarket.com";
const BATCH = 20; // token ids are ~77 digits; keep the query string sane

const jobIdFor = (orderID: string) => `settle:${orderID}`;

interface SettledMarket {
  prices: [number, number];
  clobTokenIds: [string, string];
}

/** closed=true is the resolution check (see src/lib/play/grade.ts): what comes
 *  back has settled, what doesn't is still running. Keyed by CLOB token id. */
async function fetchSettledByToken(tokenIDs: string[]): Promise<Map<string, SettledMarket>> {
  const out = new Map<string, SettledMarket>();
  const unique = [...new Set(tokenIDs)];
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const qs = chunk.map((t) => `clob_token_ids=${t}`).join("&");
    const res = await fetch(`${GAMMA}/markets?${qs}&closed=true`);
    if (!res.ok) throw new Error(`gamma ${res.status}`);
    for (const m of (await res.json()) as Array<Record<string, string>>) {
      try {
        const prices = (JSON.parse(m.outcomePrices) as string[]).map(Number);
        const tokens = JSON.parse(m.clobTokenIds) as string[];
        if (prices.length !== 2 || tokens.length !== 2) continue;
        const market: SettledMarket = {
          prices: [prices[0], prices[1]],
          clobTokenIds: [tokens[0], tokens[1]],
        };
        out.set(tokens[0], market);
        out.set(tokens[1], market);
      } catch {}
    }
  }
  return out;
}

/** Close the loop for bets whose withdrawal job has finished. */
async function reconcile(bets: BetRecord[]): Promise<void> {
  const jobs = new Map((await loadJobs()).map((j) => [j.id, j]));
  for (const bet of bets.filter((b) => b.status === "paying")) {
    const job = jobs.get(jobIdFor(bet.orderID));
    if (!job) {
      // "paying" with no job = a payout whose fate is unknown (e.g. a crashed
      // direct payout from the API). Operator decides, never a retry.
      console.error(`⚠ ${bet.orderID} is paying with no settle job — needs manual review`);
      continue;
    }
    if (job.state === "PAID") {
      const txHash = job.legs.PAID?.txHash as `0x${string}` | undefined;
      await writeBet({
        ...bet,
        status: "settled",
        payoutTx: txHash,
        settledAt: Math.floor(Date.now() / 1000),
      });
      console.log(`settled ${bet.orderID}: $${bet.payoutUsd} paid to ${bet.user} (${txHash})`);
    } else if (job.state === "FAILED") {
      console.error(`⚠ ${bet.orderID} payout job PARKED: ${job.error} — needs operator attention`);
    }
  }
}

/** One settlement pass: reconcile finished jobs, resolve fresh outcomes. */
export async function settlePass(): Promise<void> {
  const bets = await listBets();
  await reconcile(bets);

  const open = bets.filter((b) => b.status === "open");
  if (open.length === 0) return;

  const markets = await fetchSettledByToken(open.map((b) => b.tokenID));

  for (const bet of open) {
    const market = markets.get(bet.tokenID);
    if (!market) continue; // still running

    const outcome = market.clobTokenIds.indexOf(bet.tokenID) as 0 | 1;
    const resolution = readOutcome(market.prices, outcome);
    const now = Math.floor(Date.now() / 1000);

    if (resolution !== "won") {
      await writeBet({
        ...bet,
        status: resolution === "void" ? "void" : "settled",
        resolution,
        payoutUsd: 0,
        settledAt: now,
      });
      console.log(`resolved ${bet.orderID}: ${resolution}`);
      continue;
    }

    const winnings = Math.floor(bet.shares * 100) / 100; // $1/share, cent precision
    const jobId = jobIdFor(bet.orderID);
    if (await hasJob(jobId)) continue; // queued in a prior pass that died before writeBet

    await writeBet({ ...bet, status: "paying", resolution, payoutUsd: winnings });
    await journal(jobId, "settle_won", `${bet.user} $${winnings}`);
    const job: WithdrawalJob = {
      kind: "withdrawal",
      id: jobId,
      user: bet.user,
      amountUsdc: BigInt(Math.round(winnings * 1e6)),
      state: "REQUESTED",
      attempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      legs: {},
    };
    await saveJob(job);
    console.log(`won ${bet.orderID}: queued ${jobId} — $${winnings} to ${bet.user}`);
  }
}
