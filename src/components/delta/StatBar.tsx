"use client";

import { useEffect, useRef, useState } from "react";
import AnimatedNumber from "./AnimatedNumber";

const POLL_MS = 30_000;

interface Stats {
  rank: number;
  participants: number;
  taggedTxs: number;
  taggedVolumeUsd: number;
  volumeShare: number;
  totalVolumeUsd: number;
  runnerUpVolumeUsd: number | null;
  fetchedAt: number;
  stale?: boolean;
}

const usd0 = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;
const int0 = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function StatBar() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  const [pulse, setPulse] = useState(false);
  const lastTxsRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch("/api/delta/stats");
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Stats;
        if (!alive) return;
        // Flash the row only when the underlying count actually moved, so a
        // poll that returns identical numbers stays visually silent.
        if (lastTxsRef.current !== null && data.taggedTxs !== lastTxsRef.current) {
          setPulse(true);
          setTimeout(() => alive && setPulse(false), 1200);
        }
        lastTxsRef.current = data.taggedTxs;
        setStats(data);
        setError(false);
      } catch {
        if (alive && !lastTxsRef.current) setError(true);
      }
    };

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const cells: Array<{ label: string; node: React.ReactNode; sub?: string }> = [
    {
      label: "Tagged volume",
      node: (
        <AnimatedNumber value={stats?.taggedVolumeUsd ?? null} format={usd0} />
      ),
      sub: stats ? `${pct(stats.volumeShare)} of the whole board` : undefined,
    },
    {
      label: "Tagged transactions",
      node: <AnimatedNumber value={stats?.taggedTxs ?? null} format={int0} />,
      sub: "every one carries celo_22480bd47654",
    },
    {
      label: "Leaderboard rank",
      node: (
        <span className="tabular-nums">
          {stats ? `#${stats.rank}` : "—"}
          {stats && (
            <span className="text-fog text-xl font-normal">
              {" "}/ {stats.participants}
            </span>
          )}
        </span>
      ),
      sub: "Celo agentic attribution",
    },
    {
      label: "Wallets Δ has paid",
      node: <span className="tabular-nums">150+</span>,
      sub: "settled on Celo mainnet",
    },
  ];

  return (
    <div
      className={`rounded-3xl border transition-colors duration-700 ${
        pulse ? "border-act/60 bg-act/[0.07]" : "border-mid-3 bg-mid-2/40"
      }`}
    >
      <div className="grid gap-px overflow-hidden rounded-3xl sm:grid-cols-2 lg:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="px-6 py-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fog">
              {c.label}
            </p>
            <p className="mt-3 text-4xl font-extrabold leading-none text-ice lg:text-5xl">
              {c.node}
            </p>
            {c.sub && <p className="mt-2 text-sm text-fog">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-mid-3 px-6 py-3 font-mono text-[11px] text-fog">
        <span className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${
              error ? "bg-lose" : stats ? "bg-win" : "bg-fog"
            }`}
          />
          {error
            ? "leaderboard unreachable"
            : stats
              ? `verified on Dune · refreshed ${new Date(stats.fetchedAt).toLocaleTimeString("en-US", { hour12: false })}`
              : "reading the chain…"}
        </span>
        <span>polls every 30s</span>
      </div>
    </div>
  );
}
