import { NextResponse } from "next/server";
import { board } from "@/lib/play/board";
import { historyFor } from "@/lib/play/history";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  try {
    const history = await historyFor(address, await board());
    return NextResponse.json({ address, ...history });
  } catch (e) {
    console.error("plays error:\