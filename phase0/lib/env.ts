import * as fs from "fs";
import * as path from "path";
import tls from "tls";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";

// Node 24's TLS 1.3 session resumption trips "decrypt error" alerts on several
// public RPC endpoints when connections are reused (ethers v5 HTTP stack).
// Capping at TLS 1.2 avoids it; native fetch is unaffected either way.
tls.DEFAULT_MAX_VERSION = "TLSv1.2";

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

export const CLOB_API_URL =
  process.env.CLOB_API_URL || "https://clob.polymarket.com";
export const RELAYER_URL =
  process.env.RELAYER_URL || "https://relayer-v2.polymarket.com/";
export const POLYGON_CHAIN_ID = 137;
export const CELO_CHAIN_ID = 42220;

export const polygonProvider = new ethers.providers.JsonRpcProvider(
  required("POLYGON_RPC_URL")
);

export function celoProvider(): ethers.providers.JsonRpcProvider {
  return new ethers.providers.JsonRpcProvider(required("CELO_RPC_URL"));
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing — fill phase0/.env.local (see .env.example)`);
  return v;
}

// ---------------------------------------------------------------------------
// Spike state — throwaway signer + derived artifacts, persisted between steps.
// Never committed (.gitignore). A raw key here stands in for the prod
// Turnkey/Privy server-managed signer.
// ---------------------------------------------------------------------------

const STATE_FILE = path.join(__dirname, "..", ".state.json");

export interface SpikeState {
  privateKey?: string;
  eoa?: string;
  safe?: string;
  safeDeployTxId?: string;
  apiCreds?: { key: string; secret: string; passphrase: string };
  timings?: Record<string, number>;
}

export function loadState(): SpikeState {
  if (!fs.existsSync(STATE_FILE)) return {};
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}

export function saveState(patch: Partial<SpikeState>): SpikeState {
  const next = { ...loadState(), ...patch };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
  return next;
}

export function recordTiming(label: string, ms: number): void {
  const s = loadState();
  saveState({ timings: { ...(s.timings || {}), [label]: ms } });
  console.log(`⏱  ${label}: ${(ms / 1000).toFixed(1)}s`);
}

// Test EOA: env var wins, else the one 01-signer.ts generated.
export function spikeSigner(
  provider: ethers.providers.Provider = polygonProvider
): ethers.Wallet {
  const key = process.env.TEST_EOA_PRIVATE_KEY || loadState().privateKey;
  if (!key) throw new Error("No signer — run `npm run 01` first");
  return new ethers.Wallet(key, provider);
}

// Builder credentials, signed locally (server-side scripts — no remote signing
// endpoint needed, unlike the browser example).
export function builderConfig(): BuilderConfig {
  return new BuilderConfig({
    localBuilderCreds: {
      key: required("POLYMARKET_BUILDER_API_KEY"),
      secret: required("POLYMARKET_BUILDER_SECRET"),
      passphrase: required("POLYMARKET_BUILDER_PASSPHRASE"),
    },
  });
}
