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
    try {
      const { checkIns, picks } = await scan(DEPLOY_BLOCK);
      const graded = await grade(picks as PickEvent[]);
      const fresh: Board = { checkIns, graded };
      cache = { at: Date.now(), board: fresh };
      return fresh;
    } catch (error) {
      // Cleared on failure too, so a thrown scan doesn't wedge every later
      // caller onto the same rejected promise.
      inflight = null;
      throw error;
    }
  })();

  return await inflight;
}