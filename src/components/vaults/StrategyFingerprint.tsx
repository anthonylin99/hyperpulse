"use client";

import { cn, formatCompact } from "@/lib/format";
import type { StrategyFingerprint } from "@/types/vaults";

function formatHold(ms: number | null): string {
  if (ms == null) return "—";
  const hours = ms / 3600_000;
  if (hours < 1) return `${(ms / 60_000).toFixed(0)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function StrategyFingerprintPanel({ fingerprint }: { fingerprint: StrategyFingerprint }) {
  if (fingerprint.fillCount === 0) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="label text-emerald-400/75">Strategy fingerprint</div>
        <div className="mt-3 text-sm text-zinc-500">
          No fills in the last {fingerprint.sampleWindowDays} days — operator may be paused.
        </div>
      </section>
    );
  }
  if (fingerprint.fillCount < 3) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="label text-emerald-400/75">Strategy fingerprint</div>
        <div className="mt-3 text-sm text-zinc-500">Not enough trades to characterize the strategy.</div>
      </section>
    );
  }

  const maxNotional = Math.max(...fingerprint.topAssets.map((a) => a.totalNotional), 1);
  const bias = fingerprint.longShortBias;

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="label text-emerald-400/75">Strategy fingerprint</div>
          <div className="mt-1 text-sm text-zinc-400">
            Last {fingerprint.sampleWindowDays} days of operator fills ({fingerprint.fillCount} fills).
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Top assets bar chart */}
        <div>
          <div className="text-xs text-zinc-500">Top assets by notional volume</div>
          <div className="mt-3 space-y-2">
            {fingerprint.topAssets.map((asset) => {
              const widthPct = (asset.totalNotional / maxNotional) * 100;
              const longPct = asset.totalNotional > 0 ? (asset.longNotional / asset.totalNotional) * 100 : 0;
              return (
                <div key={asset.coin}>
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-zinc-200">{asset.coin}</span>
                    <span className="font-mono tabular-nums text-zinc-400">
                      {formatCompact(asset.totalNotional)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-900">
                    <div className="flex h-full" style={{ width: `${widthPct}%` }}>
                      <div className="h-full bg-emerald-500/60" style={{ width: `${longPct}%` }} />
                      <div className="h-full bg-red-500/60" style={{ width: `${100 - longPct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-4 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500/70" /> Long
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500/70" /> Short
            </span>
          </div>
        </div>

        {/* Bias + activity */}
        <div className="space-y-4">
          <div>
            <div className="text-xs text-zinc-500">Long / short bias</div>
            {bias == null ? (
              <div className="mt-2 text-sm text-zinc-500">—</div>
            ) : (
              <>
                <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                  <span>100% short</span>
                  <span className={cn("font-mono", bias >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {(bias * 100).toFixed(0)}%
                  </span>
                  <span>100% long</span>
                </div>
                <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-900">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-700" />
                  <div
                    className={cn(
                      "absolute inset-y-0",
                      bias >= 0 ? "bg-emerald-500/70 left-1/2" : "bg-red-500/70 right-1/2",
                    )}
                    style={{ width: `${Math.abs(bias) * 50}%` }}
                  />
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">Trades / day</div>
              <div className="mt-1 font-mono text-sm tabular-nums text-zinc-100">
                {fingerprint.tradesPerDay != null ? fingerprint.tradesPerDay.toFixed(1) : "—"}
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">Median hold</div>
              <div className="mt-1 font-mono text-sm tabular-nums text-zinc-100">
                {formatHold(fingerprint.medianHoldTimeMs)}
              </div>
            </div>
            <div className="col-span-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                Top asset concentration
              </div>
              <div className="mt-1 font-mono text-sm tabular-nums text-zinc-100">
                {fingerprint.topAssetConcentrationPct != null
                  ? `${fingerprint.topAssetConcentrationPct.toFixed(0)}% in ${fingerprint.topAssets[0]?.coin ?? "—"}`
                  : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
