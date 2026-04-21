"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Flame, Layers3 } from "lucide-react";
import { cn } from "@/lib/format";

type HeatmapBand = {
  price: number;
  notionalUsd: number;
  walletCount: number;
  distancePct: number;
  side: "short_liq" | "long_liq";
};

type HeatmapResponse = {
  assets: string[];
  selectedAsset: string;
  currentPrice: number | null;
  updatedAt: number | null;
  windowHours: number;
  maxDistancePct: number;
  bucketStepPct: number;
  priceSeries: Array<{ time: number; price: number }>;
  bands: HeatmapBand[];
  summary: {
    shortTotalNotionalUsd: number;
    longTotalNotionalUsd: number;
    nearestShortDistancePct: number | null;
    nearestLongDistancePct: number | null;
    trackedWallets: number;
  };
};

const VIEWBOX_WIDTH = 920;
const VIEWBOX_HEIGHT = 420;
const PADDING = { top: 18, right: 18, bottom: 26, left: 68 };

function formatCompactUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

function formatPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value >= 100 ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function buildPath(priceSeries: Array<{ time: number; price: number }>, yForPrice: (price: number) => number) {
  if (priceSeries.length === 0) return "";
  const innerWidth = VIEWBOX_WIDTH - PADDING.left - PADDING.right;
  return priceSeries
    .map((point, index) => {
      const x = PADDING.left + (index / Math.max(priceSeries.length - 1, 1)) * innerWidth;
      const y = yForPrice(point.price);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function TrackedLiquidationHeatmap() {
  const [selectedAsset, setSelectedAsset] = useState("BTC");
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/whales/liquidation-heatmap?coin=${selectedAsset}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load tracked liquidation heatmap.");
        const payload = (await response.json()) as HeatmapResponse;
        if (!mounted) return;
        setData(payload);
        setError(null);
      } catch (loadError) {
        console.error(loadError);
        if (mounted) setError("Unable to load the tracked-book liquidation heatmap.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [selectedAsset]);

  const chart = useMemo(() => {
    if (!data || !data.currentPrice || data.priceSeries.length === 0) return null;
    const innerHeight = VIEWBOX_HEIGHT - PADDING.top - PADDING.bottom;
    const minPrice = data.currentPrice * (1 - data.maxDistancePct / 100);
    const maxPrice = data.currentPrice * (1 + data.maxDistancePct / 100);
    const yForPrice = (price: number) => {
      const normalized = (price - minPrice) / Math.max(maxPrice - minPrice, 1);
      return VIEWBOX_HEIGHT - PADDING.bottom - normalized * innerHeight;
    };
    const maxBandNotional = Math.max(...data.bands.map((band) => band.notionalUsd), 1);
    const path = buildPath(data.priceSeries, yForPrice);
    return { minPrice, maxPrice, yForPrice, maxBandNotional, path };
  }, [data]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#13171f] overflow-hidden">
      <div className="border-b border-zinc-800 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Tracked-Book Heatmap</div>
            <div className="mt-1 text-lg font-semibold text-zinc-100">Liquidation ladder for major crypto perps</div>
            <div className="mt-1 max-w-4xl text-sm text-zinc-400">
              This is built from the current liquidation prices of the profitable wallets HyperPulse tracks. It is not a full exchange-wide liquidation heatmap.
            </div>
          </div>
          <Link
            href={`/?tab=markets&asset=${selectedAsset}`}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
          >
            Open market
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {(data?.assets ?? ["BTC", "ETH", "SOL", "HYPE", "AAVE"]).map((asset) => (
            <button
              key={asset}
              onClick={() => setSelectedAsset(asset)}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm transition-colors",
                selectedAsset === asset
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:text-zinc-200",
              )}
            >
              {asset}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            {error}
          </div>
        )}

        {data && (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Current price</div>
              <div className="mt-2 font-mono text-2xl text-zinc-100">{formatPrice(data.currentPrice)}</div>
              <div className="mt-1 text-xs text-zinc-500">{data.updatedAt ? new Date(data.updatedAt).toLocaleString() : "n/a"}</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Short pockets</div>
                  <div className="mt-2 font-mono text-2xl text-amber-300">{formatCompactUsd(data.summary.shortTotalNotionalUsd)}</div>
                  <div className="mt-1 text-xs text-zinc-500">Nearest pocket {formatPct(data.summary.nearestShortDistancePct)}</div>
                </div>
                <Flame className="h-4 w-4 text-amber-300" />
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Long pockets</div>
                  <div className="mt-2 font-mono text-2xl text-teal-300">{formatCompactUsd(data.summary.longTotalNotionalUsd)}</div>
                  <div className="mt-1 text-xs text-zinc-500">Nearest pocket {formatPct(data.summary.nearestLongDistancePct)}</div>
                </div>
                <Layers3 className="h-4 w-4 text-teal-300" />
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Tracked scope</div>
              <div className="mt-2 font-mono text-2xl text-zinc-100">{data.summary.trackedWallets}</div>
              <div className="mt-1 text-xs text-zinc-500">wallets contributing to current ladder</div>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-[24px] border border-zinc-800 bg-[linear-gradient(180deg,#160a25,#1d0731_35%,#12061f)] p-3">
          {loading ? (
            <div className="h-[420px] rounded-[18px] border border-zinc-800 skeleton" />
          ) : !data || !chart ? (
            <div className="flex h-[420px] items-center justify-center rounded-[18px] border border-dashed border-zinc-800 text-sm text-zinc-500">
              No tracked-book heatmap data yet for this asset.
            </div>
          ) : (
            <div className="space-y-3">
              <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="w-full overflow-visible rounded-[18px] bg-transparent">
                <defs>
                  <linearGradient id="priceGlow" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="#fb7185" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>

                <rect x={PADDING.left} y={PADDING.top} width={VIEWBOX_WIDTH - PADDING.left - PADDING.right} height={VIEWBOX_HEIGHT - PADDING.top - PADDING.bottom} rx="16" fill="rgba(38, 0, 62, 0.22)" />

                {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                  const price = chart.minPrice + (chart.maxPrice - chart.minPrice) * step;
                  const y = chart.yForPrice(price);
                  return (
                    <g key={step}>
                      <line x1={PADDING.left} x2={VIEWBOX_WIDTH - PADDING.right} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 8" />
                      <text x={10} y={y + 4} fill="rgba(255,255,255,0.52)" fontSize="11" fontFamily="monospace">
                        {formatPrice(price)}
                      </text>
                    </g>
                  );
                })}

                {data.bands.map((band) => {
                  const intensity = Math.max(band.notionalUsd / chart.maxBandNotional, 0.08);
                  const y = chart.yForPrice(band.price);
                  const height = 8 + intensity * 10;
                  const fill =
                    band.side === "short_liq"
                      ? `rgba(250, 204, 21, ${0.18 + intensity * 0.82})`
                      : `rgba(45, 212, 191, ${0.12 + intensity * 0.65})`;
                  return (
                    <g key={`${band.side}-${band.distancePct}`}>
                      <rect
                        x={PADDING.left}
                        y={y - height / 2}
                        width={VIEWBOX_WIDTH - PADDING.left - PADDING.right}
                        height={height}
                        rx="4"
                        fill={fill}
                      />
                    </g>
                  );
                })}

                <path d={chart.path} fill="none" stroke="url(#priceGlow)" strokeWidth="2.5" strokeLinecap="round" />

                {data.currentPrice != null && (
                  <>
                    <line
                      x1={PADDING.left}
                      x2={VIEWBOX_WIDTH - PADDING.right}
                      y1={chart.yForPrice(data.currentPrice)}
                      y2={chart.yForPrice(data.currentPrice)}
                      stroke="rgba(255,255,255,0.28)"
                      strokeDasharray="6 6"
                    />
                    <text
                      x={VIEWBOX_WIDTH - PADDING.right - 4}
                      y={chart.yForPrice(data.currentPrice) - 6}
                      textAnchor="end"
                      fill="rgba(255,255,255,0.72)"
                      fontSize="11"
                      fontFamily="monospace"
                    >
                      {data.selectedAsset} now {formatPrice(data.currentPrice)}
                    </text>
                  </>
                )}
              </svg>

              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                <div className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  Short liquidation pockets above price
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-300" />
                  Long liquidation pockets below price
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className="h-0.5 w-6 rounded-full bg-gradient-to-r from-rose-400 to-emerald-400" />
                  24h price path
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-400">
                These horizontal bands show the current liquidation ladder from tracked profitable wallets projected across the last 24h price path. For a true time-evolving heatmap like Coinglass, HyperPulse would need to persist this ladder on a schedule and build historical heatmap snapshots over time.
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
