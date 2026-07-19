// One executor per non-terminal state, wiring the measured phase-0 rails into
// the funding state machine. Each leg journals BEFORE moving money so a crash
// mid-leg leaves a reconciliation trail (see store.journal).
//
// Rail selection: deposits ride the FAST rail (Squid one-call, ~66–90 s) by
// default; FUNDING_RAIL=mesh switches to the cheap Mento+USDT0 path (~20 min,
// bulk rebalancing only).
import type { DepositJob, WithdrawalJob, Executor } from "../src/lib/funding/types";
import { ADDR, CELO_CHAIN_ID, POLYGON_CHAIN_ID } from "./lib/env";
import { swapUsdmToUsdt } from "./rails/mento";
import { usdt0Hop } from "./rails/usdt0";
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
    if (process.env.FUNDING_RAIL === "mesh") {
      await journal(job.id, "mento_swap");
      const leg = await swapUsdmToUsdt(job.amountUsdm);
      return { next: "SWAPPED", leg };
    }
    await journal(job.id, "fast_bridge");
    const leg = await executeLifiLeg({
      fromChainId: CELO_CHAIN_ID,
      toChainId: POLYGON_CHAIN_ID,
      fromToken: ADDR.usdmCelo,
      toToken: ADDR.usdcePolygon,
      amount: job.amountUsdm,
    });
    return { next: "BRIDGED_FAST", leg };
  },

  BRIDGED_FAST: async (job) => {
    const amount = carried(job, usdmTo6(job.amountUsdm));
    await journal(job.id, "wrap_pusd", amount.toString());
    const leg = await wrapToDepositWallet(amount);
    return { next: "CREDITED", leg: { ...leg, amountOut: amount } };
  },

  // Cheap rail: SWAPPED → hop1 → hop2 → convert → wrap.
  SWAPPED: async (job) => {
    await journal(job.id, "usdt0_hop1");
    const leg = await usdt0Hop("hop1", carried(job, usdmTo6(job.amountUsdm)));
    return { next: "BRIDGED_HOP1", leg };
  },
  BRIDGED_HOP1: async (job) => {
    await journal(job.id, "usdt0_hop2");
    const leg = await usdt0Hop("hop2", carried(job, usdmTo6(job.amountUsdm)));
    return { next: "BRIDGED_HOP2", leg };
  },
  BRIDGED_HOP2: async (job) => {
    await journal(job.id, "convert_usdt_usdce");
    const leg = await executeLifiLeg({
      fromChainId: POLYGON_CHAIN_ID,
      toChainId: POLYGON_CHAIN_ID,
      fromToken: ADDR.usdtPolygon,
      toToken: ADDR.usdcePolygon,
      amount: carried(job, usdmTo6(job.amountUsdm)),
    });
    return { next: "CONVERTED", leg };
  },
  CONVERTED: async (job) => {
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
      toToken: ADDR.usdmCelo,
      amount: carried(job, job.amountUsdc),
    });
    return { next: "BRIDGED", leg };
  },

  BRIDGED: async (job) => {
    const amount = carried(job, job.amountUsdc * 10n ** 12n); // USDm, 18 dec
    await journal(job.id, "payout", amount.toString());
    const txHash = await payoutUsdm(job.user, amount);
    return { next: "PAID", leg: { txHash, amountOut: amount } };
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
