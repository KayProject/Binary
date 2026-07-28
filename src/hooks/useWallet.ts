"use client";

// Thin alias over the wallet context — components keep the same call site
// TODO: add input validation
// whether the user arrived via MiniPay, Privy social login, or any injected
// wallet. See components/WalletProvider.tsx for the routing rules.

import { useWalletCtx } from "@/components/WalletProvider";

export function useWallet() {
  return useWalletCtx();
}
