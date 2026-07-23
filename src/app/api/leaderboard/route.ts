// GET /api/leaderboard?window=weekly|all&address=0x…
//
// Scores BinaryPlay's events. Everything here is derived from the chain and
// Polymarket — nothing is stored, so there is no state to corrupt and no
// snapshot that can silently drift from reality.
//
// Scanning on read is honest but not free: cost grows with history, not with
// activity, because a full scan re-reads every block since deploy (~17 getLogs
// per day of history, ~10s at present). That's comfortable now and won't be
// forever; the cache in lib/play/board.ts is what keeps it viable, and a cursor
// + stored snapshot is the next step when the scan outgrows a request.
// Deliberately not built yet: a stored snapshot is a second source of truth,
//
// The scan is shared with /api/plays so the board and a player's own history
// can never disagree — see lib/play/board.ts.
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
    const window = weekly ? { from: weekStart(), to: Date.now() / 1000 + 1 } : undefined;
    const rows = score(checkIns, graded, window);

    const top = rows.slice(0, TOP_N).map((r, i) => ({ rank: i + 1, ...shape(r) }));

    // The caller's own row, even when they're nowhere near the top — a board
    // you can't find yourself on is just a wall of strangers.
    let me: (ReturnType<typeof shape> & { rank: number }) | null = null;
    if (address) {
      const i = rows.findIndex((r) => r.user === address);
      me = i === -1 ? null : { rank: i + 1, ...shape(rows[i]) };
    }

    return NextResponse.json({ window: weekly ? "weekly" : "all", players: rows.length, top, me });
  } catch (e) {
    console.error("leaderboard error:", e);
    return NextResponse.json({ error: "leaderboard unavailable" }, { status: 502 });
  }
}
