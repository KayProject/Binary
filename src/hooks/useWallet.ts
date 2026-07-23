import { useWalletCtx } from '@/components/WalletProvider';

const getWalletContext = () => useWalletCtx();

export function useWallet() {
  return getWalletContext();
}