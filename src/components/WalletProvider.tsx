import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
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
    throw new Error("No wallet/>
  
};

export const useWalletCtx = () => useContext(WalletCtx);

// ... (unchanged code)

function getWalletProvider(env: "injected" | "privy" | null, children: ReactNode) {
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
            throw new Error("No wallet/>
          },
        }}>
        {children}
      </WalletCtx.Provider>
    );
  }

  if (env === "privy") {
    return (
      <PrivyProvider
        appId={PRIVY_APP_ID!}
        // ... (unchanged code)
      >
        {children}
      </PrivyProvider>
    );
  }

  // env === "injected"
  return (
    <InjectedBridge>
      {children}
    </InjectedBridge>
  );
}

export function WalletProvider({ children }: { children: ReactNode }) {
  // null = still sniffing the environment (one tick, client only)
  const [env, setEnv] = useState<"injected" | "privy" | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const eth = getEth();
      if (eth?.isMiniPay || !PRIVY_APP_ID) setEnv("injected/>
      else setEnv("privy/>
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return getWalletProvider(env, children);
}
