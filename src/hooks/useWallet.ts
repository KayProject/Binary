import { useWalletCtx } from '@/components/WalletProvider';
import { useContext } from 'react';
import { WalletProviderContext } from '@/components/WalletProvider';

export function useWallet() {
  const walletCtx = useWalletCtx();
  const context = useContext(WalletProviderContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return walletCtx;
}