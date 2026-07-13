"use client";

// One wallet layer, three environments, strict priority:
//   1. MiniPay (injected, isMiniPay) — silent connect, plain eth_sendTransaction
//      with no gas fields; MiniPay applies its own stablecoin fee currency.
//   2. Privy (social logins) — embedded EOA + ERC-4337 smart wallet; gas is
//      sponsored via the Pimlico paymaster configured in the Privy dashboard,
//      so social users play with zero balance.
//   3. Any other injected wallet — classic connect-on-demand.
//
// Components consume only the WalletCtx shape; they never know which door
// the user came through.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { SmartWalletsProvider, useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { celo } from "viem/chains";

// Privy App IDs are public client-side identifiers (they ship in the bundle
// by definition); env var overrides for staging, default is production.
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "cmrjhr14600fo0cjseyf0oso6";

export interface WalletState {
  ready: boolean;
  address: `0x${string}` | null;
  isMiniPay: boolean;
  hasWallet: boolean; // some path to a wallet exists (injected or Privy)
  userLabel: string | null; // social identity when Privy ("ada@gmail.com")
  connect: () => Promise<`0x${string}` | null>;
  logout: (() => Promise<void>) | null;
  sendTx: (to: `0x${string}`, data: `0x${string}`) => Promise<string>;
}

const WalletCtx = createContext<WalletState>({
  ready: false,
  address: null,
  isMiniPay: false,
  hasWallet: false,
  userLabel: null,
  connect: async () => null,
  logout: null,
  sendTx: async () => {
    throw new Error("No wallet");
  },
});

export const useWalletCtx = () => useContext(WalletCtx);

type Eip1193 = {
  isMiniPay?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (accounts: string[]) => void) => void;
};

// Privy's SDK already declares window.ethereum globally (as any) — don't
// redeclare; read through a typed accessor instead.
const getEth = (): Eip1193 | undefined =>
  (window as unknown as { ethereum?: Eip1193 }).ethereum;

/* ── Injected bridge (MiniPay + generic wallets) ─────────────────────── */

function InjectedBridge({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const eth = getEth();
    if (!eth) {
      setReady(true);
      return;
    }
    setHasWallet(true);
    setIsMiniPay(!!eth.isMiniPay);
    eth.on?.("accountsChanged", (accounts) =>
      setAddress((accounts[0] as `0x${string}`) ?? null)
    );
    const method = eth.isMiniPay ? "eth_requestAccounts" : "eth_accounts";
    eth
      .request({ method })
      .then((accounts) => {
        const a = (accounts as string[])[0];
        if (a) setAddress(a as `0x${string}`);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const connect = useCallback(async () => {
    const eth = getEth();
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

  const sendTx = useCallback(
    async (to: `0x${string}`, data: `0x${string}`) => {
      const eth = getEth();
      if (!eth || !address) throw new Error("No wallet");
      return (await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to, data }],
      })) as string;
    },
    [address]
  );

  return (
    <WalletCtx.Provider
      value={{ ready, address, isMiniPay, hasWallet, userLabel: null, connect, logout: null, sendTx }}
    >
      {children}
    </WalletCtx.Provider>
  );
}

/* ── Privy bridge (social login + sponsored smart wallet) ────────────── */

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { client } = useSmartWallets();

  const address = (client?.account.address as `0x${string}`) ?? null;
  const userLabel =
    user?.google?.email ??
    user?.twitter?.username ??
    user?.email?.address ??
    user?.phone?.number ??
    null;

  const connect = useCallback(async () => {
    if (!authenticated) login();
    return address; // Privy modal resolves out-of-band; state updates re-render
  }, [authenticated, login, address]);

  const sendTx = useCallback(
    async (to: `0x${string}`, data: `0x${string}`) => {
      if (!client) throw new Error("No wallet");
      // Chain comes from the provider config (defaultChain: celo); passing it
      // here trips a type skew between Privy's pinned viem and ours.
      return await client.sendTransaction({ to, data });
    },
    [client]
  );

  return (
    <WalletCtx.Provider
      value={{
        ready,
        address,
        isMiniPay: false,
        hasWallet: true,
        userLabel,
        connect,
        logout: authenticated ? logout : null,
        sendTx,
      }}
    >
      {children}
    </WalletCtx.Provider>
  );
}

/* ── Environment router ──────────────────────────────────────────────── */

export function WalletProvider({ children }: { children: ReactNode }) {
  // null = still sniffing the environment (one tick, client only)
  const [env, setEnv] = useState<"injected" | "privy" | null>(null);

  useEffect(() => {
    const eth = getEth();
    if (eth?.isMiniPay || !PRIVY_APP_ID) setEnv("injected");
    else setEnv("privy");
  }, []);

  if (env === null) {
    return (
      <WalletCtx.Provider
        value={{
          ready: false,
          address: null,
          isMiniPay: false,
          hasWallet: false,
          userLabel: null,
          connect: async () => null,
          logout: null,
          sendTx: async () => {
            throw new Error("No wallet");
          },
        }}
      >
        {children}
      </WalletCtx.Provider>
    );
  }

  if (env === "privy") {
    return (
      <PrivyProvider
        appId={PRIVY_APP_ID!}
        config={{
          loginMethods: ["google", "twitter", "email"],
          appearance: { theme: "dark", accentColor: "#3d74ff" },
          embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
          defaultChain: celo,
          supportedChains: [celo],
        }}
      >
        <SmartWalletsProvider>
          <PrivyBridge>{children}</PrivyBridge>
        </SmartWalletsProvider>
      </PrivyProvider>
    );
  }

  return <InjectedBridge>{children}</InjectedBridge>;
}
