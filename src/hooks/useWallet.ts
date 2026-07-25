use client;

import { useWalletCtx } from "@/components/WalletProvider";

export function useWallet() {
  const walletCtx = useWalletCtx();
  if (!walletCtx) {
    throw new Error('Wallet context is not available');
  }
  return walletCtx;
}