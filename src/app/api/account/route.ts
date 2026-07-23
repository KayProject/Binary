import { NextResponse } from "next/server";
import { brokerReady, collateralBalance } from "@/lib/broker";

export const runtime = "nodejs";

export async function GET() {
  if (!brokerReady()) return NextResponse.json({ configured: false, creditedUsd: null });
  try {
    const creditedUsd = await collateralBalance();
    return NextResponse.json({ configured: true, creditedUsd });
  } catch (e) {
    console.error("account error:\