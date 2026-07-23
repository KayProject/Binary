import { NextResponse } from "next/server";
import { board } from "@/lib/play/board";
import { score, weekStart, type Row } from "@/lib/play/xp";

export const runtime = "nodejs";
export const revalidate = 60;

const TOP_N = 20;

const shape = (r: Row) => ({
  address: r.user,
  xp: r.xp,
  checkInDays: r.checkInDays,
  wins: r.wins,
  losses: r.losses,
  pending: r.pending,
  ungraded: r.ungraded,
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const weekly = url.searchParams.get("window") !== "all";
  const address = url.searchParams.get("address")?.toLowerCase() ?? null;

  try {
    const { checkIns, graded } = await board();
    if (!checkIns || !graded) return NextResponse.json({ error: "leaderboard unavailable" }, { status: 502 });

    const window = weekly ? { from: weekStart(), to: Date.now() / 1000 + 1 } : undefined;
    const rows = score(checkIns, graded, window);

    if (!rows) return NextResponse.json({ error: "leaderboard unavailable" }, { status: 502 });

    const top = rows.slice(0, TOP_N).map((r, i) => ({ rank: i + 1, ...shape(r) }));

    let me: (ReturnType<typeof shape> & { rank: number }) | null = null;
    if (address) {
      const i = rows.findIndex((r) => r.user === address);
      if (i === -1) return NextResponse.json({ error: "address not found" }, { status: 404 });
      me = { rank: i + 1, ...shape(rows[i]) };
    }

    return NextResponse.json({ window: weekly ? "weekly" : "all", players: rows.length, top, me });
  } catch (e) {
    console.error("leaderboard error:\