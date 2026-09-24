import { NextResponse } from "next/server";
import { USDM, USDT_CELO } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fromToken = searchParams.get("fromToken") || USDT_CELO;
  const toToken = searchParams.get("toToken") || USDM;
  const fromAmount = searchParams.get("fromAmount");
  const fromAddress = searchParams.get("fromAddress");
  const slippage = searchParams.get("slippage") || "0.005";

  if (!fromAmount || !/^\d+$/.test(fromAmount) || BigInt(fromAmount) <= 0n) {
    return NextResponse.json({ error: "Invalid fromAmount" }, { status: 400 });
  }

  if (!fromAddress || !/^0x[a-fA-F0-9]{40}$/.test(fromAddress)) {
    return NextResponse.json({ error: "Invalid fromAddress" }, { status: 400 });
  }

  try {
    const url = new URL("https://li.quest/v1/quote");
    url.searchParams.set("fromChain", "42220");
    url.searchParams.set("toChain", "42220");
    url.searchParams.set("fromToken", fromToken);
    url.searchParams.set("toToken", toToken);
    url.searchParams.set("fromAmount", fromAmount);
    url.searchParams.set("fromAddress", fromAddress);
    url.searchParams.set("slippage", slippage);

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    const data = await res.json();

    if (!res.ok || !data.transactionRequest) {
      return NextResponse.json(
        { error: data.message || "Failed to fetch swap route from Li.Fi" },
        { status: res.ok ? 400 : res.status }
      );
    }

    return NextResponse.json({
      id: data.id,
      estimate: {
        fromAmount: data.estimate?.fromAmount,
        toAmount: data.estimate?.toAmount,
        approvalAddress: data.estimate?.approvalAddress || data.transactionRequest.to,
        feeCosts: data.estimate?.feeCosts,
        gasCosts: data.estimate?.gasCosts,
        fromAmountUSD: data.estimate?.fromAmountUSD,
        toAmountUSD: data.estimate?.toAmountUSD,
      },
      transactionRequest: {
        to: data.transactionRequest.to,
        data: data.transactionRequest.data,
        value: data.transactionRequest.value || "0",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Swap quote error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
