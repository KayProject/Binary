import { useWalletCtx } from '@/components/WalletProvider';

export function useWallet() {
  const getWalletContext = () => useWalletCtx();
  return getWalletContext();
}