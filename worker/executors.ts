// One executor per non-terminal state, wiring the measured rails into
// the funding state machine. Each leg journals BEFORE moving money so a crash
// mid-leg leaves a reconciliation trail (see store.journal).
//
// Deposit rail:
//   1. Sweep USDm from BinaryDeposits to operator on Celo
//   2. Swap USDm -> USDT on Celo via Uniswap V3 (0.01% fee pool, ~1s)
//   3. Bridge USDT Celo -> USDC.e Polygon via Li.Fi / LayerSwap (~27s)
//   4. Wrap USDC.e Polygon -> pUSD inside deposit wallet (~2s)
//
// Withdrawal rail:
//   1. Unwrap pUSD deposit wallet -> USDC.e operator on Polygon
//   2. Bridge USDC.e Polygon -> USDT Celo via Li.Fi / LayerSwap (~27s)
//   3. Swap USDT -> USDm on Celo via Uniswap V3 (~1s)
//   4. Payout USDm to user via BinaryDeposits payout()
import type { DepositJob, WithdrawalJob, Executor } from "../src/lib/funding/types";
import { ADDR, CELO_CHAIN_ID, POLYGON_CHAIN_ID } from "./lib/env";
import { swapUsdmToUsdt, swapUsdtToUsdm } from "./rails/mento";
import { executeLifiLeg } from "./rails/lifi";
import { wrapToDepositWallet, unwrapToOperator } from "./rails/pusd";
import { sweepIfNeeded, payoutUsdm } from "./rails/celo";
import { journal } from "./store";

const usdmTo6 = (amount18: bigint) => amount18 / 10n ** 12n;

/** Amount produced by the leg that put the job in its current state. */
function carried(job: DepositJob | WithdrawalJob, fallback: bigint): bigint {
  const leg = job.legs[job.state as keyof typeof job.legs];
  return leg?.amountOut ?? fallback;
}

export const depositExecutors: Partial<Record<string, Executor<string, DepositJob>>> = {
  RECEIVED: async (job) => {
    await journal(job.id, "sweep", job.amountUsdm.toString());
    await sweepIfNeeded(job.amountUsdm);

    await journal(job.id, "celo_swap_usdt", job.amountUsdm.toString());
    const swapLeg = await swapUsdmToUsdt(job.amountUsdm);

    await journal(job.id, "bridge_celo_polygon", swapLeg.amountOut.toString());
    const bridgeLeg = await executeLifiLeg({
      fromChainId: CELO_CHAIN_ID,
      toChainId: POLYGON_CHAIN_ID,
      fromToken: ADDR.usdtCelo,
      toToken: ADDR.usdcePolygon,
      amount: swapLeg.amountOut,
    });
    return { next: "BRIDGED_FAST", leg: bridgeLeg };
  },

  BRIDGED_FAST: async (job) => {
    const amount = carried(job, usdmTo6(job.amountUsdm));
    await journal(job.id, "wrap_pusd", amount.toString());
    const leg = await wrapToDepositWallet(amount);
    return { next: "CREDITED", leg: { ...leg, amountOut: amount } };
  },

  // Netted against a withdrawal: the withdrawer's surrendered pUSD is already
  // in the (v1: shared) deposit wallet, so crediting is ledger-only — the
  // deposit's USDm stays on Celo to pay the matched withdrawal.
  NETTED: async (job) => {
    await journal(job.id, "netted_credit", job.amountUsdm.toString());
    return { next: "CREDITED", leg: { amountOut: usdmTo6(job.amountUsdm) } };
  },
};

export const withdrawalExecutors: Partial<Record<string, Executor<string, WithdrawalJob>>> = {
  REQUESTED: async (job) => {
    await journal(job.id, "unwrap_pusd", job.amountUsdc.toString());
    const leg = await unwrapToOperator(job.amountUsdc);
    return { next: "UNWRAPPED", leg: { ...leg, amountOut: job.amountUsdc } };
  },

  UNWRAPPED: async (job) => {
    await journal(job.id, "withdraw_bridge");
    const leg = await executeLifiLeg({
      fromChainId: POLYGON_CHAIN_ID,
      toChainId: CELO_CHAIN_ID,
      fromToken: ADDR.usdcePolygon,
      toToken: ADDR.usdtCelo,
      amount: carried(job, job.amountUsdc),
    });
    return { next: "BRIDGED", leg };
  },

  BRIDGED: async (job) => {
    const usdtAmount = carried(job, job.amountUsdc);
    await journal(job.id, "celo_swap_usdm", usdtAmount.toString());
    const swapLeg = await swapUsdtToUsdm(usdtAmount);

    await journal(job.id, "payout", swapLeg.amountOut.toString());
    const txHash = await payoutUsdm(job.user, swapLeg.amountOut);
    return { next: "PAID", leg: { txHash, amountOut: swapLeg.amountOut } };
  },

  // Netted against a deposit: paid on Celo directly from the matched deposit's
  // USDm (payoutUsdm tops the contract up from the operator EOA if needed).
  NETTED: async (job) => {
    const amount = job.amountUsdc * 10n ** 12n;
    await journal(job.id, "netted_payout", amount.toString());
    const txHash = await payoutUsdm(job.user, amount);
    return { next: "PAID", leg: { txHash, amountOut: amount } };
  },
};
