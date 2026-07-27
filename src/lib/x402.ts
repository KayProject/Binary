// x402 payment gate for the broker API — routed through the CELO facilitator
// (api.x402.celo.org), not thirdweb's. This matters beyond plumbing: the
// hackathon's Track 2 counts only settlements submitted by the Celo
// facilitator's relayer, attributed to the agent/payTo wallet on the
// submission. Settlements through any other facilitator are invisible to it.
//
// Flow per request: no payment header → 402 carrying signed-payment
// requirements (v2 header + v1 body, so both client generations interop);
// header present → facilitator /verify, then /settle (X-API-Key, prepaid
// credits) — the facilitator's relayer submits the on-chain USDC transfer
// buyer → payTo, gasless for the buyer. Server-side only; inert
// (x402Ready() false → routes answer 503) until the env is set.
//
// Asset note: payments are USDC on Celo (0xcebA…118C), NOT USDm — cUSD does
// not implement ERC-3009 transferWithAuthorization (verified on-chain: the
// typehash probe reverts), so gasless x402 pulls are impossible in USDm.
// Payer wallets must hold Celo USDC.

const FACILITATOR = "https://api.x402.celo.org";

// Native USDC on Celo mainnet + its EIP-712 signing domain (name/version as
// deployed — the client signs against these; wrong values = invalid sigs).
const USDC_CELO = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const USDC_DECIMALS = 6;
const USDC_DOMAIN = { name: "USDC", version: "2" };

const REQUIRED_ENV = ["X402_FACILITATOR_KEY", "X402_PAYTO"] as const;

export function x402Ready(): boolean {
  return REQUIRED_ENV.every((k) => !!process.env[k]);
}

interface PaymentRequirements {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { name: string; version: string; primaryType: string };
}

/** "$0.01" → atomic USDC ("10000"). Cent-level prices only, by design. */
function atomicAmount(price: string): string {
  const usd = parseFloat(price.replace(/^\$/, ""));
  if (!(usd > 0)) throw new Error(`bad x402 price: ${price}`);
  return String(Math.round(usd * 10 ** USDC_DECIMALS));
}

function requirementsFor(
  resourceUrl: string,
  price: string,
  description: string,
): PaymentRequirements {
  return {
    scheme: "exact",
    network: "eip155:42220", // Celo mainnet, v2 chain notation
    maxAmountRequired: atomicAmount(price),
    resource: resourceUrl,
    description,
    mimeType: "application/json",
    payTo: process.env.X402_PAYTO!, // buyer → us directly; no intermediary hop
    maxTimeoutSeconds: 300,
    asset: USDC_CELO,
    extra: { ...USDC_DOMAIN, primaryType: "TransferWithAuthorization" },
  };
}

/** The 402 challenge: v2 header (PAYMENT-REQUIRED, base64) + v1-style body. */
function challenge(requirements: PaymentRequirements): Response {
  const payload = {
    x402Version: 2,
    error: "Payment required",
    accepts: [requirements],
    resource: { url: requirements.resource },
  };
  return Response.json(payload, {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(payload)).toString("base64"),
    },
  });
}

export interface PaywallResult {
  paid: boolean;
  response?: Response; // the 402 challenge (or error) to return when unpaid
}

/** Gate a route behind an x402 payment settled by the Celo facilitator. */
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

  const url = new URL(request.url);
  const requirements = requirementsFor(`${url.origin}${url.pathname}`, price, description);

  const header =
    request.headers.get("PAYMENT-SIGNATURE") || request.headers.get("X-PAYMENT");
  if (!header) return { paid: false, response: challenge(requirements) };

  let clientPayload: { scheme?: string; payload?: unknown };
  try {
    clientPayload = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return { paid: false, response: challenge(requirements) };
  }

  // Wire translation: clients speak v2 ("eip155:42220"), but the facilitator's
  // verify/settle accept the v1 dialect ("celo") — v2 bodies bounce with
  // unsupported_scheme (probed live). The exact-scheme authorization payload is
  // identical in both, so only the envelope and network naming change.
  const body = JSON.stringify({
    x402Version: 1,
    paymentPayload: {
      x402Version: 1,
      scheme: "exact",
      network: "celo",
      payload: clientPayload.payload,
    },
    paymentRequirements: { ...requirements, network: "celo" },
  });

  try {
    const verify = await fetch(`${FACILITATOR}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    const verdict = (await verify.json()) as { isValid?: boolean; invalidReason?: string };
    if (!verify.ok || !verdict.isValid) {
      return {
        paid: false,
        response: Response.json(
          { x402Version: 2, error: verdict.invalidReason ?? "invalid payment", accepts: [requirements] },
          { status: 402 },
        ),
      };
    }

    const settle = await fetch(`${FACILITATOR}/settle`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-API-Key": process.env.X402_FACILITATOR_KEY!,
      },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    const settled = (await settle.json()) as {
      success?: boolean;
      settled?: boolean;
      errorReason?: string;
      transaction?: string;
    };
    if (!settle.ok || !(settled.success ?? settled.settled)) {
      // Verified but unsettled = our side's problem (credits/facilitator), not
      // the payer's — surface it as a server error, never charge-and-deny.
      console.error("x402 settle failed:", settle.status, settled);
      return {
        paid: false,
        response: Response.json({ error: settled.errorReason ?? "settlement failed" }, { status: 502 }),
      };
    }
    return { paid: true };
  } catch (e) {
    console.error("x402 facilitator unreachable:", e);
    return {
      paid: false,
      response: Response.json({ error: "payment facilitator unreachable" }, { status: 502 }),
    };
  }
}
