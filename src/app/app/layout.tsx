import type { ReactNode } from "react";
import { WalletProvider } from "@/components/WalletProvider";

/**
 * AppLayout
 * @param {*} { children }: { children: ReactNode }
 * @returns {*}
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
