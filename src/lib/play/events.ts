// BinaryPlay event scanner.
//
// XP and the leaderboard are computed off-chain from CheckedIn/Picked, exactly
// as the contract intends ("Grading and XP live off-chain, computed from this
// contract's events"). This module only reads the chain and decodes; it holds
// no opinion about scoring — see xp.ts for that.
import { parseAbiItem } from "viem";
import { PLAY_CONTRACT, publicClient } from "@/lib/chain";

// Deploy block, measured — scanning from 0 would be ~72M blocks of nothing.
export const DEPLOY_BLOCK = 72_047_029n;

// Celo's public forno RPC rejects wider getLogs ranges outright. Every scan
// has to be chunked, so this ceiling drives the whole cursor design.
const MAX_RANGE = 5_000n;

// Chunks are latency-bound, not rate-limited: one getLogs to forno measures
// ~915ms regardless of how little it returns, so walking the chunks one at a
// time spends the whole scan waiting. Measured over 12 chunks: serial 22.2s,
// 4-wide 1.9s, 8-wide 2.5s — all with zero failures. 4 takes the win and
// leaves headroom rather than leaning on a public RPC as hard as it allows.
const CONCURRENCY = 4;

// Celo produces one block per second with no measured drift, so a block number
// converts to a wall-clock time by arithmetic. This matters: pricing a pick at
// the minute it happened otherwise needs a getBlock per pick.
const CELO_BLOCK_SECONDS = 1n;

const checkedIn = parseAbiItem(
  "event CheckedIn(address indexed user, uint32 indexed day, uint32 streak)"
);
const picked = parseAbiItem(
  "event Picked(address indexed user, bytes32 indexed marketId, uint8 outcome)"
);

export interface CheckIn {
  user: `0x${string}`;
  day: number; // UTC day index: block.timestamp / 1 days
  block: number;
}

export interface PickEvent {
  user: `0x${string}`;
  marketId: `0x${string}`;
  outcome: 0 | 1;
  block: number;
  at: number; // unix seconds, derived from the block number
}

export interface Scan {
  checkIns: CheckIn[];
  picks: PickEvent[];
  toBlock: number;
}

/** Wall-clock time of a block, anchored to a known block/timestamp pair. */
export function blockTime(block: bigint, anchor: { block: bigint; ts: bigint }): number {
  return Number(anchor.ts + (block - anchor.block) * CELO_BLOCK_SECONDS);
}

/**
 * Read CheckedIn/Picked between two blocks. Chunked to MAX_RANGE and walked
 * CONCURRENCY waves at a time, so the cost is proportional to the range asked
 * for — callers should pass a cursor rather than rescanning history every time.
 */
export async function scan(fromBlock: bigint, toBlock?: bigint): Promise<Scan> {
  const tip = toBlock ?? (await publicClient.getBlockNumber());
  const anchorBlock = await publicClient.getBlock({ blockNumber: tip });
  const anchor = { block: tip, ts: anchorBlock.timestamp };

  const checkIns: CheckIn[] = [];
  const picks: PickEvent[] = [];

  const ranges: Array<[bigint, bigint]> = [];
  for (let start = fromBlock; start <= tip; start += MAX_RANGE) {
    ranges.push([start, start + MAX_RANGE - 1n > tip ? tip : start + MAX_RANGE - 1n]);
  }

  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const wave = await Promise.all(
      ranges.slice(i, i + CONCURRENCY).map(([start, end]) =>
        Promise.all([
          publicClient.getLogs({ address: PLAY_CONTRACT, event: checkedIn, fromBlock: start, toBlock: end }),
          publicClient.getLogs({ address: PLAY_CONTRACT, event: picked, fromBlock: start, toBlock: end }),
        ])
      )
    );

    for (const [cLogs, pLogs] of wave) {
      for (const l of cLogs) {
        if (!l.args.user || l.args.day === undefined) continue;
        checkIns.push({
          user: l.args.user.toLowerCase() as `0x${string}`,
          day: Number(l.args.day),
          block: Number(l.blockNumber),
        });
      }
      for (const l of pLogs) {
        if (!l.args.user || !l.args.marketId || l.args.outcome === undefined) continue;
        picks.push({
          user: l.args.user.toLowerCase() as `0x${string}`,
          marketId: l.args.marketId.toLowerCase() as `0x${string}`,
          outcome: (l.args.outcome === 1 ? 1 : 0) as 0 | 1,
          block: Number(l.blockNumber),
          at: blockTime(l.blockNumber!, anchor),
        });
      }
    }
  }

  return { checkIns, picks, toBlock: Number(tip) };
}
