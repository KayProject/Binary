import { WalletProvider } from "@/components/WalletProvider";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
