// x402 payment gate for the broker API. Server-side only — needs
// THIRDWEB_SECRET_KEY in the environment and, like broker.ts, is inert
// (x402Ready() false → routes answer 503) until configured.
//
// Flow per request: no X-PAYMENT header → 402 with payment requirements;
// header present → the thirdweb facilitator verifies and settles USDm on Celo
// to X402_PAYTO, then the route does its real work. Every settlement is an
// on-chain agentic payment attributed to the paying wallet.
import { createThirdwebClient } from "thirdweb";
import { celo } from "thirdweb/chains";
import { settlePayment, facilitator } from "thirdweb/x402";

const REQUIRED_ENV = ["THIRDWEB_SECRET_KEY", "X402_SERVER_WALLET", "X402_PAYTO"] as const;

export function x402Ready(): boolean {
  return REQUIRED_ENV.every((k) => !!process.env[k]);
}

function thirdwebFacilitator() {
  const client = createThirdwebClient({ secretKey: process.env.THIRDWEB_SECRET_KEY! });
  return facilitator({
    client,
    serverWalletAddress: process.env.X402_SERVER_WALLET! as `0x${string}`,
  });
}

export interface PaywallResult {
  paid: boolean;
  response?: Response; // the 402 challenge (or error) to return when unpaid
}

/** Gate a route behind an x402 payment. Returns paid=true once settled. */
export async function requirePayment(
  request: Request,
  price: string,
  description: string,
): Promise<PaywallResult> {
  if (!x402Ready()) {
    return {
      paid: false,
      response: Response.json({ error: "x402 not configured" }, { status: 503 }),
    };
  }

  const paymentData =
    request.headers.get("PAYMENT-SIGNATURE") || request.headers.get("X-PAYMENT");

  const url = new URL(request.url);
  const result = await settlePayment({
    resourceUrl: `${url.origin}${url.pathname}`,
    method: request.method,
    paymentData,
    payTo: process.env.X402_PAYTO! as `0x${string}`,
    network: celo,
    price,
    facilitator: thirdwebFacilitator(),
    routeConfig: { description, mimeType: "application/json" },
  });

  if (result.status === 200) return { paid: true };
  return {
    paid: false,
    response: Response.json(result.responseBody, {
      status: result.status,
      headers: result.responseHeaders,
    }),
  };
}
