import type { ReactNode } from "react";
import { WalletProvider } from "@/components/WalletProvider";

const withWalletProvider = (WrappedComponent: React.ComponentType<{ children: ReactNode }>) => {
  const WrappedWithWallet = ({ children }: { children: ReactNode }) => {
    return <WalletProvider><WrappedComponent children={children} /></WalletProvider>;
  };
  return WrappedWithWallet;
};

export default withWalletProvider;
