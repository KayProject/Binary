// Deposit watcher: scans BinaryDeposits for Deposited events past the saved
// cursor and turns each one into a DepositJob. Job ids are
// `${chainId}:${txHash}:${logIndex}` — replay-safe, so re-scanning a block
// range can never double-create a job.
import { ethers } from "ethers";
import type { DepositJob } from "../src/lib/funding/types";
import { CELO_CHAIN_ID, DEPOSITS_CONTRACT, celoProvider } from "./lib/env";
import { depositsInterface } from "./rails/celo";
import { hasJob, saveJob, loadCursor, saveCursor } from "./store";

const CHUNK = 5_000; // forno getLogs range limit headroom

export async function scanDeposits(): Promise<DepositJob[]> {
  const latest = await celoProvider.getBlockNumber();
  const saved = await loadCursor();
  // If no saved cursor, look back up to 25,000 blocks (~7 hours on Celo)
  // or use INITIAL_CURSOR_BLOCK if set, so cold starts never miss deposits.
  let from =
    saved ??
    (process.env.INITIAL_CURSOR_BLOCK
      ? parseInt(process.env.INITIAL_CURSOR_BLOCK)
      : Math.max(0, latest - 25_000));
  const created: DepositJob[] = [];

  while (from <= latest) {
    const to = Math.min(from + CHUNK - 1, latest);
    const logs = await celoProvider.getLogs({
      address: DEPOSITS_CONTRACT,
      topics: [depositsInterface.getEventTopic("Deposited")],
      fromBlock: from,
      toBlock: to,
    });

    for (const log of logs) {
      const id = `${CELO_CHAIN_ID}:${log.transactionHash}:${log.logIndex}`;
      if (await hasJob(id)) continue;
      const { user, amount } = depositsInterface.parseLog(log).args;
      const now = Date.now();
      const job: DepositJob = {
        kind: "deposit",
        id,
        user,
        amountUsdm: (amount as ethers.BigNumber).toBigInt(),
        state: "RECEIVED",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        legs: {},
      };
      await saveJob(job);
      created.push(job);
    }

    await saveCursor(to + 1);
    from = to + 1;
  }

  return created;
}
