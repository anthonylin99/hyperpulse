"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { CopyableAddress } from "@/components/ui/CopyableAddress";
import { cn, formatUSD } from "@/lib/format";
import type { PortfolioStats } from "@/types";

export function OperatorTrackRecord({
  address,
  stats,
  lookbackDays,
}: {
  address: string;
  stats: PortfolioStats;
  lookbackDays: number;
}) {
  const pnlTone = stats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label text-emerald-400/75">Operator track record</div>
          <div className="mt-1 text-sm text-zinc-400">
            Personal wallet performance over the last {lookbackDays} days.
          </div>
          <div className="mt-2"><CopyableAddress address={address} /></div>
        </div>
        <Link
          href={`/portfolio?address=${address}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
        >
          Full portfolio analytics <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {stats.totalTrades === 0 ? (
        <div className="mt-4 text-sm text-zinc-500">
          No closed round-trip trades on the operator&apos;s personal wallet in this window.
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Win rate" value={`${(stats.winRate * 100).toFixed(1)}%`} />
          <Tile label="Expectancy" value={formatUSD(stats.expectancy)} tone={stats.expectancy >= 0 ? "success" : "danger"} />
          <Tile label="Total trades" value={stats.totalTrades.toString()} />
          <Tile label={`${lookbackDays}d PnL`} value={formatUSD(stats.totalPnl)} tone={stats.totalPnl >= 0 ? "success" : "danger"} className={pnlTone} />
        </div>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  tone = "neutral",
  className,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
  className?: string;
}) {
  const toneCls =
    tone === "success" ? "text-emerald-400" : tone === "danger" ? "text-red-400" : "text-zinc-100";
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={cn("mt-1 font-mono text-base tabular-nums", toneCls, className)}>{value}</div>
    </div>
  );
}
