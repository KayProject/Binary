import type { DepositJob, DepositState, Executor, Job, WithdrawalJob, WithdrawalState } from "./types";

// Legal transitions. Anything else is a bug — throw loudly, never guess.
const DEPOSIT_FLOW: Record<DepositState, DepositState[]> = {
  RECEIVED: ["NETTED", "BRIDGED_FAST", "SWAPPED"],
  NETTED: ["CREDITED"],
  BRIDGED_FAST: ["CREDITED"],
  SWAPPED: ["BRIDGED_HOP1"],
  BRIDGED_HOP1: ["BRIDGED_HOP2"],
  BRIDGED_HOP2: ["CONVERTED"],
  CONVERTED: ["CREDITED"],
  CREDITED: [],
  FAILED: [],
};

const WITHDRAWAL_FLOW: Record<WithdrawalState, WithdrawalState[]> = {
  REQUESTED: ["NETTED", "UNWRAPPED"],
  NETTED: ["PAID"],
  UNWRAPPED: ["BRIDGED"],
  BRIDGED: ["PAID"],
  PAID: [],
  FAILED: [],
};

export const TERMINAL = new Set(["CREDITED", "PAID", "FAILED"]);
const MAX_ATTEMPTS = 5;

/**
 * isTerminal
 * @param {*} job: Job
 * @returns {*}
 */
export function isTerminal(job: Job): boolean {
  return TERMINAL.has(job.state);
}

function assertTransition(job: Job, next: string): void {
  const flow: Record<string, string[]> = job.kind === "deposit" ? DEPOSIT_FLOW : WITHDRAWAL_FLOW;
  if (!flow[job.state]?.includes(next)) {
    throw new Error(`illegal transition ${job.kind}:${job.state} → ${next} (job ${job.id})`);
  }
}

/**
 * Advance a job one step using the executor registered for its current state.
 * - Executor success → transition (validated) + leg recorded.
 * - Executor failure → attempts++, job stays in place for retry; after
 *   MAX_ATTEMPTS it parks in FAILED for an operator, never silently drops.
 * Persistence is the caller's job: persist the returned job before advancing
 * again, so a crash resumes exactly where it stopped.
 */
export async function advance<J extends DepositJob | WithdrawalJob>(
  job: J,
  executors: Partial<Record<string, Executor<string, J>>>
): Promise<J> {
  if (isTerminal(job)) return job;
  const exec = executors[job.state];
  if (!exec) throw new Error(`no executor for state ${job.state}`);

  const t0 = Date.now();
  let result: Awaited<ReturnType<typeof exec>>;
  try {
    result = await exec(job);
  } catch (e) {
    const attempts = job.attempts + 1;
    return {
      ...job,
      attempts,
      state: attempts >= MAX_ATTEMPTS ? ("FAILED" as J["state"]) : job.state,
      updatedAt: Date.now(),
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Outside the try: an illegal transition is a programmer error, not a
  // retryable leg failure — let it throw.
  const { next, leg } = result;
  assertTransition(job, next);
  return {
    ...job,
    state: next as J["state"],
    attempts: 0,
    updatedAt: Date.now(),
    legs: { ...job.legs, [next]: { ...leg, ms: Date.now() - t0 } },
  };
}

/** Drive a job to a terminal state (or until an executor starts failing). */
export async function drive<J extends DepositJob | WithdrawalJob>(
  job: J,
  executors: Partial<Record<string, Executor<string, J>>>,
  persist: (j: J) => Promise<void>
): Promise<J> {
  let current = job;
  while (!isTerminal(current)) {
    const before = current.state;
    current = await advance(current, executors);
    await persist(current);
    if (current.state === before) break; // retrying — caller reschedules
  }
  return current;
}
