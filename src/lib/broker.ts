// Server-side broker: places real Polymarket orders from the Binary-managed
// deposit wallet. Import from API routes only — needs BINARY_KEY and CLOB
// creds in the environment, and is inert (brokerReady() false) until they're set.
import {
import { ethers } from "ethers";
  ClobClient,
  Side,
  OrderType,
  SignatureTypeV2,
  getContractConfig,
  type ApiKeyCreds,
} from "@polymarket/clob-client-v2";

const POLYGON_CHAIN_ID = 137;
const CLOB_API_URL = process.env.CLOB_API_URL || "https://clob.polymarket.com";

const REQUIRED_ENV = [
  "BINARY_KEY",
  "POLYGON_RPC_URL",
  "CLOB_API_KEY",
  "CLOB_API_SECRET",
  "CLOB_API_PASSPHRASE",
  "DEPOSIT_WALLET_ADDRESS",
] as const;

export function brokerReady(): boolean {
  return REQUIRED_ENV.every((k) => !!process.env[k]);
}

function polygonProvider(): ethers.providers.JsonRpcProvider {
  return new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
}

function clobClient(): ClobClient {
  const creds: ApiKeyCreds = {
    key: process.env.CLOB_API_KEY!,
    secret: process.env.CLOB_API_SECRET!,
    passphrase: process.env.CLOB_API_PASSPHRASE!,
  };
  return new ClobClient({
    host: CLOB_API_URL,
    chain: POLYGON_CHAIN_ID,
    signer: new ethers.Wallet(process.env.BINARY_KEY!, polygonProvider()),
    creds,
    signatureType: SignatureTypeV2.POLY_1271,
    funderAddress: process.env.DEPOSIT_WALLET_ADDRESS!,
    ...(process.env.BUILDER_CODE
      ? { builderConfig: { builderCode: process.env.BUILDER_CODE } }
      : {}),
  });
}

/** pUSD sitting in the deposit wallet, in $ (6 dec). */
export async function collateralBalance(): Promise<number> {
  const cfg = getContractConfig(POLYGON_CHAIN_ID);
  const erc20 = new ethers.Contract(
    cfg.collateral,
    ["function balanceOf(address) view returns (uint256)"],
    polygonProvider()
  );
  const bal: ethers.BigNumber = await erc20.balanceOf(process.env.DEPOSIT_WALLET_ADDRESS!);
  return parseFloat(ethers.utils.formatUnits(bal, 6));
}

// Flaky-network guard from the phase-0 run: these lookups intermittently
// resolve undefined, which crashes the order builder — retry until sane.
async function retry<T>(label: string, fn: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 5; i++) {
    try {
      const v = await fn();
      if (ok(v)) return v;
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`${label} kept failing`);
}

export interface FillResult {
  orderID: string;
  status: string;
  side: "BUY";
  tokenID: string;
  usd: number;
  askPrice: number;
}

/** Place a $-denominated FOK market buy for `tokenID`. Throws on rejection. */
export async function placeMarketBuy(tokenID: string, usd: number): Promise<FillResult> {
  const client = clobClient();

  const negRisk = await retry("negRisk", () => client.getNegRisk(tokenID), (v) => typeof v === "boolean");
  const ask = parseFloat(
    (await retry("price", () => client.getPrice(tokenID, Side.SELL), (v) => !!v?.price)).price
  );
  if (!(ask > 0 && ask < 1)) throw new Error("no valid ask for this market");
  const tickSize = await retry(
    "tickSize",
    () => client.getTickSize(tokenID),
    (v) => ["0.1", "0.01", "0.005", "0.0025", "0.001", "0.0001"].includes(String(v))
  );

  const response = await client.createAndPostMarketOrder(
    { tokenID, amount: usd, side: Side.BUY },
    { tickSize, negRisk },
    OrderType.FOK
  );
  if (!response.orderID) throw new Error(`order not accepted: ${JSON.stringify(response).slice(0, 200)}`);

  return {
    orderID: response.orderID,
    status: response.status ?? "matched",
    side: "BUY",
    tokenID,
    usd,
    askPrice: ask,
  };
}
