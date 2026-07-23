import type { ReactNode } from "react";
import { WalletProvider } from "@/components/WalletProvider";

const withWalletProvider = (WrappedComponent: React.ComponentType<{ children: ReactNode }>) => {
  const Wrapper = ({ children }: { children: ReactNode }) => {
    return <WalletProvider><WrappedComponent>{children}</WrappedComponent></WalletProvider>;
  };
  return Wrapper;
};

const AppLayout = withWalletProvider(({ children }: { children: ReactNode }) => <>{children}</>);

export default AppLayout;
