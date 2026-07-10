import { ethers } from "ethers";
import { ClobClient, ApiKeyCreds } from "@polymarket/clob-client";
import { RelayClient } from "@polymarket/builder-relayer-client";
import { deriveSafe } from "@polymarket/builder-relayer-client/dist/builder/derive";
import { getContractConfig as relayerContractConfig } from "@polymarket/builder-relayer-client/dist/config";
import { getContractConfig as clobContractConfig } from "@polymarket/clob-client";
import {
  CLOB_API_URL,
  RELAYER_URL,
  POLYGON_CHAIN_ID,
  builderConfig,
  spikeSigner,
  loadState,
} from "./env";

// Deterministic Safe address for an owner EOA (same derivation the relayer uses).
export function derivedSafe(eoa: string): string {
  const cfg = relayerContractConfig(POLYGON_CHAIN_ID);
  return deriveSafe(eoa, cfg.SafeContracts.SafeFactory);
}

// Live Polymarket contract set as the installed clob-client knows it —
// treat this as authoritative over anything hardcoded in docs.
export function liveContractConfig() {
  return clobContractConfig(POLYGON_CHAIN_ID);
}

// Relay client: Safe deploys, approval batches, redeems — all gasless.
export function makeRelayClient(signer?: ethers.Wallet): RelayClient {
  return new RelayClient(
    RELAYER_URL,
    POLYGON_CHAIN_ID,
    signer ?? spikeSigner(),
    builderConfig()
  );
}

// Unauthenticated CLOB client — enough for deriving/creating user API creds.
export function makeTempClobClient(signer?: ethers.Wallet): ClobClient {
  return new ClobClient(CLOB_API_URL, POLYGON_CHAIN_ID, signer ?? spikeSigner());
}

// Fully authenticated CLOB client: signature type 2 (EOA signs for its Safe),
// funder = the Safe, orders attributed to our Builder account.
export function makeClobClient(): ClobClient {
  const signer = spikeSigner();
  const state = loadState();
  if (!state.apiCreds) throw new Error("No user API creds — run `npm run 04` first");
  const safe = state.safe ?? derivedSafe(signer.address);
  return new ClobClient(
    CLOB_API_URL,
    POLYGON_CHAIN_ID,
    signer,
    state.apiCreds as ApiKeyCreds,
    2, // SignatureType.POLY_GNOSIS_SAFE
    safe,
    undefined,
    false,
    builderConfig()
  );
}
