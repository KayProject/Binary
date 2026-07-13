import { ethers } from "ethers";
import { ClobClient, ApiKeyCreds, SignatureTypeV2 } from "@polymarket/clob-client-v2";
import { RelayClient } from "@polymarket/builder-relayer-client";
import { getContractConfig as clobContractConfig } from "@polymarket/clob-client-v2";
import {
  CLOB_API_URL,
  RELAYER_URL,
  POLYGON_CHAIN_ID,
  builderConfig,
  clobCreds,
  depositWallet,
  operator,
} from "./env";

// Live Polymarket contract set as the installed clob-client knows it —
// authoritative over anything hardcoded in docs.
export function liveContractConfig() {
  return clobContractConfig(POLYGON_CHAIN_ID);
}

// Relay client: deposit-wallet deploys, approval batches, unwraps — all gasless.
export function makeRelayClient(signer?: ethers.Wallet): RelayClient {
  return new RelayClient(RELAYER_URL, POLYGON_CHAIN_ID, signer ?? operator(), builderConfig());
}

// Authenticated CLOB client. Post-V2 orders come from the EIP-1271 deposit
// wallet (signatureType 3), signed by the operator EOA; builder attribution is
// the bytes32 BUILDER_CODE on each order.
export function makeClobClient(): ClobClient {
  return new ClobClient({
    host: CLOB_API_URL,
    chain: POLYGON_CHAIN_ID,
    signer: operator(),
    creds: clobCreds() as ApiKeyCreds,
    signatureType: SignatureTypeV2.POLY_1271,
    funderAddress: depositWallet(),
    ...(process.env.BUILDER_CODE ? { builderConfig: { builderCode: process.env.BUILDER_CODE } } : {}),
  });
}
