// Funding pipeline domain types. A job is the unit of money movement: created
// by a Deposited/withdrawal event, advanced step-by-step by executors, safe to
// resume after a crash at any state (every executor is idempotent per job id).

export type DepositState =
  | "RECEIVED" // Deposited event seen on Celo
  | "NETTED" // matched against a withdrawal — skips the bridge entirely
  | "SWAPPED" // USDm → USDT on Celo (Mento)
  | "BRIDGED_HOP1" // USDT landed on Arbitrum (USDT0 mesh)
  | "BRIDGED_HOP2" // USDT landed on Polygon
  | "CONVERTED" // USDT → USDC.e on Polygon
  | "CREDITED" // user's Safe funded — terminal
  | "FAILED"; // terminal after retries exhausted; needs operator attention

export type WithdrawalState =
  | "REQUESTED" // user asked to cash out (balance already sold to USDC.e)
  | "NETTED" // matched against a deposit — paid out on Celo directly
  | "BRIDGED" // USDC.e swapped+bridged Polygon → Celo (Squid)
  | "PAID" // payout() executed on the Deposit Contract — terminal
  | "FAILED";

export interface DepositJob {
  kind: "deposit";
  id: string; // `${chainId}:${txHash}:${logIndex}` — collision-free, replay-safe
  user: string; // Celo address == pinned payout address
  amountUsdm: bigint; // 18 decimals
  state: DepositState;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  // Filled in as legs complete — audit trail + realized-cost accounting.
  legs: Partial<Record<DepositState, { txHash?: string; amountOut?: bigint; ms?: number }>>;
  error?: string;
}

export interface WithdrawalJob {
  kind: "withdrawal";
  id: string;
  user: string;
  amountUsdc: bigint; // 6 decimals, Polygon side
  state: WithdrawalState;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  legs: Partial<Record<WithdrawalState, { txHash?: string; amountOut?: bigint; ms?: number }>>;
  error?: string;
}

export type Job = DepositJob | WithdrawalJob;

// One executor per non-terminal state: performs the leg, returns the next
// state. Executors MUST be idempotent — check on-chain effects before acting.
export type Executor<S extends string, J extends Job> = (
  job: J
) => Promise<{ next: S; leg?: { txHash?: string; amountOut?: bigint } }>;
