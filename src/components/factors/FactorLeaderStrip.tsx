"use client";

import { useFactors } from "@/context/FactorContext";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/format";

export default function FactorLeaderStrip() {
  const { leader, leaderText, loading, error } = useFactors();

  if (loading && !leader) {
    return <div className="h-16 rounded-xl border border-zinc-800 skeleton" />;
  }

  if (error || !leader) {
    return null;
  }

  const week =
    leader.windows.find((window: { days: number; spreadReturn: number | null }) => window.days === 7)
      ?.spreadReturn ?? null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Factor Leader</div>
          <div className="mt-1 text-base font-semibold text-zinc-100">{leaderText}</div>
          <div className="mt-1 text-sm text-zinc-400">
            Artemis regime is favoring <span className="text-zinc-100">{leader.snapshot.name}</span>. Best tradable expressions right now: {leader.tradeCandidates.map((candidate: { symbol: string }) => candidate.symbol).join(", ") || "none yet"}.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">7d Spread</div>
            <div className={cn("mt-1 text-sm font-semibold", week == null ? "text-zinc-500" : week >= 0 ? "text-emerald-400" : "text-red-400")}>
              {week == null ? "n/a" : formatPct(week)}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Confidence</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">{leader.confidence}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
