import { ethers } from "ethers";
import { ClobClient, ApiKeyCreds, SignatureTypeV2 } from "@polymarket/clob-client-v2";
import { RelayClient } from "@polymarket/builder-relayer-client";
import { deriveSafe } from "@polymarket/builder-relayer-client/dist/builder/derive";
import { getContractConfig as relayerContractConfig } from "@polymarket/builder-relayer-client/dist/config";
import { getContractConfig as clobContractConfig } from "@polymarket/clob-client-v2";
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
  return new ClobClient({
    host: CLOB_API_URL,
    chain: POLYGON_CHAIN_ID,
    signer: signer ?? spikeSigner(),
  });
}

// Fully authenticated CLOB client. Post-V2 the CLOB rejects new type-2 Safe
// makers — new wallets must trade from an EIP-1271 deposit wallet (type 3,
// run `npm run 12` first). Builder attribution is the bytes32 BUILDER_CODE
// carried on each order — not HMAC builder headers.
export function makeClobClient(): ClobClient {
  const signer = spikeSigner();
  const state = loadState();
  if (!state.apiCreds) throw new Error("No user API creds — run `npm run 04` first");
  const funder = state.depositWallet ?? state.safe ?? derivedSafe(signer.address);
  return new ClobClient({
    host: CLOB_API_URL,
    chain: POLYGON_CHAIN_ID,
    signer,
    creds: state.apiCreds as ApiKeyCreds,
    signatureType: state.depositWallet
      ? SignatureTypeV2.POLY_1271
      : SignatureTypeV2.POLY_GNOSIS_SAFE,
    funderAddress: funder,
    ...(process.env.BUILDER_CODE ? { builderConfig: { builderCode: process.env.BUILDER_CODE } } : {}),
  });
}
