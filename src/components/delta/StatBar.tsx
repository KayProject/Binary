"use client";

import { useEffect, useRef, useState } from "react";
import AnimatedNumber from "./AnimatedNumber";
import { cn } from "@/lib/cn";

const POLL_MS = 30_000;

interface Stats {
  rank: number;
  participants: number;
  taggedTxs: number;
  taggedVolumeUsd: number;
  volumeShare: number;
  fetchedAt: number;
}

const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const int0 = (n: number) => Math.round(n).toLocaleString("en-US");

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
        // Flash only when the count actually moved — an identical poll should
        // be visually silent, or the effect becomes noise.
        if (lastTxsRef.current !== null && data.taggedTxs !== lastTxsRef.current) {
          setPulse(true);
          setTimeout(() => alive && setPulse(false), 1400);
        }
        lastTxsRef.current = data.taggedTxs;
        setStats(data);
        setError(false);
      } catch {
        if (alive && lastTxsRef.current === null) setError(true);
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const share = stats ? `${(stats.volumeShare * 100).toFixed(1)}%` : "—";

  return (
    <div className="relative">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 -top-px h-px transition-opacity duration-700",
          "bg-gradient-to-r from-transparent via-act to-transparent",
          pulse ? "opacity-100" : "opacity-30",
        )}
      />
      <div className="grid divide-y divide-white/[0.06] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x lg:divide-white/[0.06]">
        <Cell
          label="Tagged volume"
          value={<AnimatedNumber value={stats?.taggedVolumeUsd ?? null} format={usd0} />}
          foot={stats ? `${share} of every tagged dollar` : " "}
          emphasis
        />
        <Cell
          label="Transactions"
          value={<AnimatedNumber value={stats?.taggedTxs ?? null} format={int0} />}
          foot="each carrying celo_22480bd47654"
        />
        <Cell
          label="Rank"
          value={
            <span className="tabular-nums">
              {stats ? `#${stats.rank}` : "—"}
              {stats && <span className="text-fog"> / {stats.participants}</span>}
            </span>
          }
          foot="Celo agentic attribution"
        />
        <Cell label="Wallets paid" value={<span>150+</span>} foot="settled, on mainnet" />
      </div>

      <div className="mt-8 flex items-center justify-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fog">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors duration-500",
            error ? "bg-lose" : stats ? "bg-win" : "bg-fog",
          )}
        />
        {error
          ? "leaderboard unreachable"
          : stats
            ? `verified on Dune · live · refreshed ${new Date(stats.fetchedAt).toLocaleTimeString("en-US", { hour12: false })}`
            : "reading…"}
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  foot,
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  foot: string;
  emphasis?: boolean;
}) {
  return (
    <div className="px-2 py-8 text-center lg:px-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fog">
        {label}
      </p>
      {/* Sized to fit the widest real value ($388,777) inside a quarter-width
          cell — the larger display size was clipping it. */}
      <p
        className={cn(
          "mt-4 font-extrabold leading-none tracking-[-0.035em] tabular-nums",
          emphasis
            ? "bg-gradient-to-b from-ice to-act-soft bg-clip-text text-[2.1rem] text-transparent lg:text-[2.75rem]"
            : "text-ice text-[2rem] lg:text-[2.6rem]",
        )}
      >
        {value}
      </p>
      <p className="mt-3 text-xs text-fog">{foot}</p>
    </div>
  );
}
