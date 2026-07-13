"use client";

// Injected-wallet hook (MiniPay first, any EIP-1193 wallet otherwise).
// MiniPay auto-injects and expects an immediate eth_requestAccounts — no
// "Connect Wallet" ceremony. Desktop wallets connect on demand.

import { useCallback, useEffect, useState } from "react";

type Eip1193 = {
  isMiniPay?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (accounts: string[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

export function useWallet() {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;
    setHasWallet(true);
    setIsMiniPay(!!eth.isMiniPay);
    eth.on?.("accountsChanged", (accounts) =>
      setAddress((accounts[0] as `0x${string}`) ?? null)
    );
    // MiniPay: connect silently on load. Others: wait for the user.
    const method = eth.isMiniPay ? "eth_requestAccounts" : "eth_accounts";
    eth
      .request({ method })
      .then((accounts) => {
        const a = (accounts as string[])[0];
        if (a) setAddress(a as `0x${string}`);
      })
      .catch(() => {});
  }, []);

  const connect = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) return null;
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const a = (accounts[0] as `0x${string}`) ?? null;
      setAddress(a);
      return a;
    } catch {
      return null;
    }
  }, []);

  // Plain transfer-shaped call: no gas/fee fields — MiniPay is legacy-tx-only
  // and applies its own stablecoin fee currency.
  const sendTx = useCallback(
    async (to: `0x${string}`, data: `0x${string}`) => {
      const eth = window.ethereum;
      if (!eth || !address) throw new Error("No wallet");
      return (await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to, data }],
      })) as `0x${string}`;
    },
    [address]
  );

  return { address, isMiniPay, hasWallet, connect, sendTx };
}
