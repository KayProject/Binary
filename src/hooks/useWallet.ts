/* eslint-disable @typescript-eslint/no-unused-vars */

"use client";

// Thin alias over the wallet context — components keep the same call site
// whether the user arrived via MiniPay, Privy social login, or any injected
// wallet. See components/WalletProvider.tsx for the routing rules.

import { useWalletCtx } from "@/components/WalletProvider";

/**
 * Provides a thin alias over the wallet context.
 * @returns The wallet context.
 */
export function useWallet(): ReturnType<typeof useWalletCtx> {
  // Extracted utility function to provide a simple alias over the wallet context.
  return useWalletCtx();
}
