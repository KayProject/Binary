import type { DepositJob, WithdrawalJob } from "./types";

// Opposing flows cancel: a Celo deposit can pay a Celo withdrawal directly
// while the withdrawer's surrendered Polygon balance credits the depositor's
// Safe. Matched volume never touches a bridge. Only the residual bridges.
//
// v1 policy: exact-amount netting only (USDm deposit ≈ USDC.e withdrawal
// within tolerance). Partial fills split jobs — deferred until volume
// justifies the extra accounting.

const TOLERANCE_BPS: number = 20n; // 0.2% — USDm/USDC oracle drift allowance

// 18-dec USDm vs 6-dec USDC.e: compare in 6-dec units.
function usdmTo6(amount18: bigint): bigint {
  return amount18 / 10n ** 12n;
}

function within(a: bigint, b: bigint, bps: bigint): boolean {
  const diff = a > b ? a - b : b - a;
  return diff * 10_000n <= (a > b ? a : b) * bps;
}

export interface NetMatch {
  depositId: string;
  withdrawalId: string;
}

export interface NetResult {
  matches: NetMatch[];
  residualDeposits: DepositJob[]; // must bridge Celo → Polygon
  residualWithdrawals: WithdrawalJob[]; // must bridge Polygon → Celo
}

export function net(
  deposits: DepositJob[],
  withdrawals: WithdrawalJob[]
): NetResult {
  const matches: NetMatch[] = [];
  const usedWithdrawals = new Set<string>();
  const residualDeposits: DepositJob[] = [];

  // FIFO both sides — oldest jobs get the fast path first.
  const sortedDeposits = [...deposits].sort((a, b) => a.createdAt - b.createdAt);
  const sortedWithdrawals = [...withdrawals].sort((a, b) => a.createdAt - b.createdAt);

  for (const dep of sortedDeposits) {
    if (dep.state !== "RECEIVED") {
      residualDeposits.push(dep);
      continue; // already in flight down the bridge path
    }
    const match = sortedWithdrawals.find(
      (w) =>
        !usedWithdrawals.has(w.id) &&
        w.state === "REQUESTED" &&
        w.user !== dep.user && // self-matching would be a wash trade
        within(usdmTo6(dep.amountUsdm), w.amountUsdc, TOLERANCE_BPS)
    );
    if (match) {
      usedWithdrawals.add(match.id);
      matches.push({ depositId: dep.id, withdrawalId: match.id });
    } else {
      residualDeposits.push(dep);
    }
  }

  return {
    matches,
    residualDeposits,
    residualWithdrawals: sortedWithdrawals.filter((w) => !usedWithdrawals.has(w.id)),
  };
}
