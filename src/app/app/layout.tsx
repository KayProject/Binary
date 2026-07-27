import type { ReactNode } from "react";
import { WalletProvider } from "@/components/WalletProvider";

const withWalletProvider = (children: ReactNode) => (
  <WalletProvider>{children}</WalletProvider>
);

export default function AppLayout({ children }: { children: ReactNode }) {
  return withWalletProvider(children);
}