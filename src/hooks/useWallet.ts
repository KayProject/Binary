import { useWalletCtx } from "@/components/WalletProvider";

export function useWallet() {
  const walletCtx = useWalletCtx();
  return walletCtx;
}