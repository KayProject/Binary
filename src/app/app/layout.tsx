import type { ReactNode } from "react";
import { WalletProvider } from "@/components/WalletProvider";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
