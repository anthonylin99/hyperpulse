"use client";

import { Fragment, useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { useWallet } from "@/context/WalletContext";
import { cn, formatCompactUsd } from "@/lib/format";

function colorForCorrelation(value: number | null): string {
  if (value == null) return "bg-zinc-900 text-zinc-600";
  const abs = Math.abs(value);
  if (abs >= 0.75) return value > 0 ? "bg-emerald-500/20 text-emerald-200" : "bg-red-500/20 text-red-200";
  if (abs >= 0.45) return value > 0 ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300";
  return "bg-zinc-900 text-zinc-400";
}

export default function CorrelationMap() {
  const { accountState } = useWallet();
  const { correlation, researchLoading, researchError } = usePortfolio();

  const openAssets = useMemo(
    () => new Set((accountState?.positions ?? []).map((position) => position.coin)),
    [accountState?.positions],
  );

  const assets = useMemo(() => {
    const current = correlation?.assets.filter((asset) => openAssets.has(asset)) ?? [];
    return current.length >= 2 ? current.slice(0, 6) : (correlation?.assets ?? []).slice(0, 6);
  }, [correlation?.assets, openAssets]);

  const lookup = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const entry of correlation?.matrix ?? []) {
      map.set(`${entry.assetA}:${entry.assetB}`, entry.correlation);
    }
    return map;
  }, [correlation?.matrix]);

  if (!accountState) return null;

  return (
    <section className="overflow-hidden rounded-[26px] border border-zinc-800 bg-zinc-950/85">
      <div className="border-b border-zinc-800 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-400/75">
              Correlation Map
            </div>
            <h3 className="mt-2 text-lg font-semibold text-zinc-100">
              Are these separate trades, or one crowded risk?
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              90d daily returns across assets you trade. Useful for sizing, not a prediction engine.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Status</div>
            <div className="mt-1 text-xs text-zinc-300">
              {researchLoading ? "Refreshing..." : correlation?.configured === false ? "DB fallback" : "Research layer"}
            </div>
          </div>
        </div>
      </div>

      {researchError ? (
        <div className="border-b border-zinc-800 bg-amber-500/10 px-5 py-3 text-xs text-amber-200">
          {researchError}
        </div>
      ) : null}

      {correlation?.warning ? (
        <div className="border-b border-zinc-800 bg-amber-500/10 px-5 py-3 text-xs text-amber-100">
          {correlation.warning}
        </div>
      ) : null}

      {assets.length >= 2 ? (
        <div className="grid gap-4 p-5 xl:grid-cols-[1fr_0.75fr]">
          <div className="overflow-x-auto">
            <div className="min-w-[420px]">
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `90px repeat(${assets.length}, minmax(52px, 1fr))` }}
              >
                <div />
                {assets.map((asset) => (
                  <div key={asset} className="px-2 py-1 text-center text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                    {asset}
                  </div>
                ))}
                {assets.map((assetA) => (
                  <Fragment key={assetA}>
                    <div key={`${assetA}-label`} className="px-2 py-2 text-xs font-medium text-zinc-300">
                      {assetA}
                    </div>
                    {assets.map((assetB) => {
                      const value = lookup.get(`${assetA}:${assetB}`) ?? null;
                      return (
                        <div
                          key={`${assetA}-${assetB}`}
                          className={cn("rounded-xl px-2 py-2 text-center font-mono text-xs", colorForCorrelation(value))}
                        >
                          {value == null ? "n/a" : value.toFixed(2)}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              Active clusters
            </div>
            {correlation?.clusters.length ? (
              correlation.clusters.map((cluster) => (
                <div key={`${cluster.primaryAsset}-${cluster.secondaryAsset}`} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-mono text-sm text-zinc-100">
                      {cluster.primaryAsset}/{cluster.secondaryAsset}
                    </div>
                    <div className="font-mono text-xs text-emerald-300">{cluster.correlation.toFixed(2)}</div>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-zinc-500">
                    {cluster.note} Combined open notional {formatCompactUsd(cluster.combinedNotionalUsd)}.
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-6 text-sm text-zinc-500">
                No high-correlation open clusters detected in this window.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="px-5 py-8 text-sm text-zinc-500">
          Correlation needs at least two traded assets with enough daily history.
        </div>
      )}
    </section>
  );
}
