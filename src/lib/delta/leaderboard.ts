// Binary's standing on the Celo agentic attribution leaderboard, read from
// Dune. Every value-moving transaction Binary and Delta sign carries the tag
// `celo_22480bd47654`, so this is an independent count — nobody has to take
// our word for the volume.
//
// The Dune result endpoint serves the last completed execution, so callers get
// a cached answer immediately rather than waiting ~20s for a fresh run.

const OUR_CODE = "celo_22480bd47654";
const DUNE_BASE = "https://api.dune.com/api/v1/query";

export interface LeaderboardRow {
  team: string;
  code: string;
  githubRepo: string;
  taggedTxs: number;
  taggedVolumeUsd: number;
  x402Settlements: number;
}

export interface DeltaStats {
  rank: number;
  participants: number;
  taggedTxs: number;
  taggedVolumeUsd: number;
  /** Our share of every tagged dollar on the board, 0..1. */
  volumeShare: number;
  totalVolumeUsd: number;
  x402Settlements: number;
  runnerUpVolumeUsd: number | null;
  fetchedAt: number;
}

interface DuneRow {
  team: string;
  code: string;
  github_repo: string;
  tagged_txs: number;
  tagged_volume_usd: number;
  x402_settlements: number;
}

export async function fetchDeltaStats(): Promise<DeltaStats> {
  const key = process.env.DUNE_API_KEY;
  const queryId = process.env.DUNE_LEADERBOARD_QUERY_ID ?? "7868470";
  if (!key) throw new Error("DUNE_API_KEY not set");

  const res = await fetch(`${DUNE_BASE}/${queryId}/results?limit=1000`, {
    headers: { "x-dune-api-key": key },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`dune ${res.status}`);

  const body = (await res.json()) as { result?: { rows?: DuneRow[] } };
  const rows = body.result?.rows ?? [];
  if (!rows.length) throw new Error("dune returned no rows");

  // Rank by tagged volume rather than trusting the query's own ordering.
  const ranked = [...rows].sort((a, b) => b.tagged_volume_usd - a.tagged_volume_usd);
  const index = ranked.findIndex((r) => r.code === OUR_CODE);
  if (index === -1) throw new Error("our attribution tag is not on the board");

  const ours = ranked[index];
  const totalVolumeUsd = ranked.reduce((sum, r) => sum + r.tagged_volume_usd, 0);
  const runnerUp = index === 0 ? ranked[1] : ranked[0];

  return {
    rank: index + 1,
    participants: ranked.length,
    taggedTxs: ours.tagged_txs,
    taggedVolumeUsd: ours.tagged_volume_usd,
    volumeShare: totalVolumeUsd > 0 ? ours.tagged_volume_usd / totalVolumeUsd : 0,
    totalVolumeUsd,
    x402Settlements: ours.x402_settlements,
    runnerUpVolumeUsd: runnerUp ? runnerUp.tagged_volume_usd : null,
    fetchedAt: Date.now(),
  };
}
