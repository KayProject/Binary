"use client";

// Leaderboard. Lives inside the You tab for now and is deliberately
// self-contained — it takes an address and owns its own fetching, so lifting
// it out to its own screen later is a move, not a rewrite.
//
// Ranked by XP: 5 per day checked in, plus odds-weighted XP per correct pick
// (see lib/play/xp.ts). Streak stays the hero of the You tab above and isn't
// ranked here — it measures showing up, not calling markets.
import { useEffect, useState } from "react";

interface Entry {
  rank: number;
  address: string;
  xp: number;
  checkInDays: number;
  wins: number;
  losses: number;
  pending: number;
  ungraded: number;
}

interface Board {
  window: "weekly" | "all";
  players: number;
  top: Entry[];
  me: Entry | null;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Row({ e, isMe }: { e: Entry; isMe: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
        isMe ? "bg-(--s-act-tint) ring-1 ring-(--s-act-soft)" : ""
      }`}
    >
      <span
        className={`w-6 shrink-0 font-mono text-sm font-bold tabular-nums ${
          e.rank === 1 ? "text-(--s-gold)" : "text-(--s-sub)"
        }`}
      >
        {e.rank}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs">
        {isMe ? "You" : short(e.address)}
      </span>
      {e.wins > 0 && (
        <span className="shrink-0 font-mono text-xs text-(--s-win)">{e.wins}W</span>
      )}
      <span className="shrink-0 font-mono text-sm font-bold tabular-nums">{e.xp}</span>
    </div>
  );
}

export function Leaderboard({ address }: { address: string | null }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [window_, setWindow] = useState<"weekly" | "all">("weekly");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    // Deferred a frame: setState straight from an effect body cascades renders
    // (react-hooks/set-state-in-effect) — the house pattern for this.
    const id = requestAnimationFrame(() => {
      setState("loading");
      const qs = new URLSearchParams({ window: window_ });
      if (address) qs.set("address", address);
      fetch(`/api/leaderboard?${qs}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: Board) => {
          if (cancelled) return;
          setBoard(d);
          setState("ready");
        })
        .catch(() => !cancelled && setState("error"));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [window_, address]);

  const meInTop = !!board?.me && board.top.some((e) => e.address === board.me!.address);

  return (
    <div className="mb-4 rounded-2xl bg-(--s-card) p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">Leaderboard</h3>
        <div className="flex gap-1 rounded-lg bg-(--s-bg) p-0.5">
          {(["weekly", "all"] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                window_ === w ? "bg-(--s-card) text-(--s-text)" : "text-(--s-sub)"
              }`}
            >
              {w === "weekly" ? "This week" : "All time"}
            </button>
          ))}
        </div>
      </div>

      {state === "loading" && <p className="py-6 text-center text-xs text-(--s-sub)">Counting…</p>}

      {state === "error" && (
        <p className="py-6 text-center text-xs text-(--s-sub)">
          Couldn&apos;t load the board. Pull again in a moment.
        </p>
      )}

      {state === "ready" && board?.top.length === 0 && (
        <p className="py-6 text-center text-xs text-(--s-sub)">
          Nobody on the board {window_ === "weekly" ? "this week" : "yet"}. Check in to start.
        </p>
      )}

      {state === "ready" && board?.top.length > 0 && (
        <>
          <div className="space-y-0.5">
            {board.top.map((e) => (
              <Row key={e.address} e={e} isMe={e.address === board.me?.address} />
            ))}
          </div>

          {/* Your own row, when you're past the cut — a board you can't find
              yourself on is just a wall of strangers. */}
          {board.me && !meInTop && (
            <>
              <p className="py-1 text-center text-xs text-(--s-sub)">···</p>
              <Row e={board.me} isMe />
            </>
          )}

          <p className="mt-3 text-center text-xs text-(--s-sub)">
            5 XP a day for checking in · winning picks pay more the longer the odds
          </p>
        </>
      )}
    </div>
  );
}
