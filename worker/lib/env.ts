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

// Layered env: repo root .env first (operator key, contract addresses), then
// root .env.local (BLOB_READ_WRITE_TOKEN for the bet ledger), then
// phase0/.env.local for anything not overridden (RPCs, builder creds).
const ROOT = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(ROOT, ".env") });
dotenv.config({ path: path.join(ROOT, ".env.local") });
dotenv.config({ path: path.join(ROOT, "phase0", ".env.local") });

export const POLYGON_CHAIN_ID = 137;
export const CELO_CHAIN_ID = 42220;
export const ARBITRUM_CHAIN_ID = 42161;

export const CLOB_API_URL = process.env.CLOB_API_URL || "https://clob.polymarket.com";
export const RELAYER_URL = process.env.RELAYER_URL || "https://relayer-v2.polymarket.com/";

// Token + contract addresses (all verified live during the phase-0 money run).
export const ADDR = {
  usdmCelo: "0x765DE816845861e75A25fCA122bb6898B8B1282a", // 18 dec
  usdtCelo: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", // 6 dec
  usdtArbitrum: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  usdtPolygon: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  usdcePolygon: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  collateralOnramp: "0x93070a847efEf7F70739046A929D47a521F5B8ee",
  collateralOfframp: "0x2957922Eb93258b93368531d39fAcCA3B4dC5854",
  mentoBroker: "0x777A8255cA72412f0d706dc03C9D1987306B4CaD",
  mentoBiPoolManager: "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901",
} as const;

export const EXCHANGE_ID_USDM_USDT =
  "0x773bcec109cee923b5e04706044fd9d6a5121b1a6a4c059c36fdbe5b845d4e9b";

export function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing — set it in Binary/.env or phase0/.env.local`);
  return v;
}

export const celoProvider = new ethers.providers.JsonRpcProvider(
  process.env.CELO_RPC_URL || "https://forno.celo.org"
);
export const polygonProvider = new ethers.providers.JsonRpcProvider(required("POLYGON_RPC_URL"));
export const arbitrumProvider = new ethers.providers.JsonRpcProvider(
  process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc"
);

export const providers: Record<number, ethers.providers.JsonRpcProvider> = {
  [CELO_CHAIN_ID]: celoProvider,
  [POLYGON_CHAIN_ID]: polygonProvider,
  [ARBITRUM_CHAIN_ID]: arbitrumProvider,
};

/** Operator EOA — owner+treasury of BinaryDeposits and owner of the deposit wallet. */
export function operator(provider: ethers.providers.Provider = polygonProvider): ethers.Wallet {
  return new ethers.Wallet(required("BINARY_KEY"), provider);
}

export const DEPOSITS_CONTRACT = required("DEPOSITS_CONTRACT_ADDRESS");

// Polymarket deposit wallet (EIP-1271, funder for all orders). Falls back to
// the one phase0 derived and persisted.
export function depositWallet(): string {
  if (process.env.DEPOSIT_WALLET_ADDRESS) return process.env.DEPOSIT_WALLET_ADDRESS;
  const stateFile = path.join(ROOT, "phase0", ".state.json");
  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (state.depositWallet) return state.depositWallet;
  }
  throw new Error("DEPOSIT_WALLET_ADDRESS missing and phase0/.state.json has none");
}

/** CLOB user API creds — env wins, phase0 state as fallback. */
export function clobCreds(): { key: string; secret: string; passphrase: string } {
  if (process.env.CLOB_API_KEY) {
    return {
      key: required("CLOB_API_KEY"),
      secret: required("CLOB_API_SECRET"),
      passphrase: required("CLOB_API_PASSPHRASE"),
    };
  }
  const stateFile = path.join(ROOT, "phase0", ".state.json");
  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (state.apiCreds) return state.apiCreds;
  }
  throw new Error("No CLOB API creds — set CLOB_API_KEY/SECRET/PASSPHRASE");
}

export function builderConfig(): BuilderConfig {
  return new BuilderConfig({
    localBuilderCreds: {
      key: required("POLYMARKET_BUILDER_API_KEY"),
      secret: required("POLYMARKET_BUILDER_SECRET"),
      passphrase: required("POLYMARKET_BUILDER_PASSPHRASE"),
    },
  });
}
