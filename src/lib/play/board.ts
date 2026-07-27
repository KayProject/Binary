// One scan, one cache, every view.
//
// The leaderboard and a player's own history are the same question asked twice
// — "what happened on BinaryPlay?" — so they read the same scan. That isn't
// only about cost: when the board and the Portfolio scan separately they can
// disagree, and a player who sees a win ranked that their own history doesn't
// show has no way to tell which one is lying.
//
// The scan is expensive (a full re-read from the deploy block, ~10s at present)
// and its cost grows with history, not activity. Two things keep that viable
// here: the cache below, and de-duping concurrent misses — the app opens the
// Portfolio and the leaderboard together, and a cold instance would otherwise
// run the same 10s scan twice at once.
import { DEPLOY_BLOCK, scan, type CheckIn, type PickEvent } from "./events";
import { grade } from "./grade";
import type { Graded } from "./xp";

const CACHE_MS = 60_000;

export interface Board {
  checkIns: CheckIn[];
  graded: Graded[];
}

let cache: { at: number; board: Board } | null = null;
let inflight: Promise<Board> | null = null;

export async function board(): Promise<Board> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.board;
  if (inflight) return inflight;

  inflight = (async () => {
    const { checkIns, picks } = await scan(DEPLOY_BLOCK);
    const graded = await grade(picks as PickEvent[]);
    const fresh: Board = { checkIns, graded };
    cache = { at: Date.now(), board: fresh };
    return fresh;
  })();

  try {
    return await inflight;
  } finally {
    // Cleared on failure too, so a thrown scan doesn't wedge every later
    // caller onto the same rejected promise.
    inflight = null;
  }
}
