"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatChartPrice, formatCompactUsd, formatPct, formatTimestampShort } from "@/lib/format";
import { CompactStat, FilterChip, SectionEyebrow } from "@/components/trading-ui";

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
const VIEWBOX_HEIGHT = 248;
const PADDING = { top: 14, right: 16, bottom: 24, left: 62 };

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
  const [activeBand, setActiveBand] = useState<HeatmapBand | null>(null);

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
        setActiveBand(null);
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

  const featuredBand = activeBand ?? data?.bands[0] ?? null;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#13171f]">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <SectionEyebrow>Tracked-book heatmap</SectionEyebrow>
              <div className="mt-1 text-base font-semibold text-zinc-100">Nearby liquidation pockets for major crypto perps</div>
              <div className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
                Built from the current liquidation prices of tracked profitable wallets. This is a monitored-book pressure map, not a full exchange heatmap.
              </div>
            </div>
            <Link
              href={`/?tab=markets&asset=${selectedAsset}`}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
            >
              Open market
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            {(data?.assets ?? ["BTC", "ETH", "SOL", "HYPE", "AAVE"]).map((asset) => (
              <FilterChip key={asset} label={asset} active={selectedAsset === asset} onClick={() => setSelectedAsset(asset)} className="py-1.5 text-xs" />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        {error ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">{error}</div>
        ) : null}

        {data ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <CompactStat label="Current price" value={formatChartPrice(data.currentPrice)} helper={formatTimestampShort(data.updatedAt)} />
            <CompactStat
              label="Short pockets"
              value={formatCompactUsd(data.summary.shortTotalNotionalUsd)}
              helper={`Nearest ${formatPct(data.summary.nearestShortDistancePct)}`}
              tone="amber"
            />
            <CompactStat
              label="Long pockets"
              value={formatCompactUsd(data.summary.longTotalNotionalUsd)}
              helper={`Nearest ${formatPct(data.summary.nearestLongDistancePct)}`}
              tone="green"
            />
            <CompactStat label="Tracked wallets" value={data.summary.trackedWallets.toString()} helper="wallets with usable liq levels" />
          </div>
        ) : null}

        <div className="rounded-[20px] border border-zinc-800 bg-[linear-gradient(180deg,#13091f,#1a0a2d_48%,#100717)] p-2.5">
          {loading ? (
            <div className="h-[248px] rounded-[16px] border border-zinc-800 skeleton" />
          ) : !data || !chart ? (
            <div className="flex h-[248px] items-center justify-center rounded-[16px] border border-dashed border-zinc-800 text-sm text-zinc-500">
              No tracked-book heatmap data yet for this asset.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 px-1 text-[11px] text-zinc-400">
                <div className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  Short liq above price
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-300" />
                  Long liq below price
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className="h-0.5 w-6 rounded-full bg-gradient-to-r from-rose-400 to-emerald-400" />
                  24h price path
                </div>
              </div>

              <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="w-full overflow-visible rounded-[16px] bg-transparent">
                <defs>
                  <linearGradient id="priceGlow" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="#fb7185" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>

                <rect
                  x={PADDING.left}
                  y={PADDING.top}
                  width={VIEWBOX_WIDTH - PADDING.left - PADDING.right}
                  height={VIEWBOX_HEIGHT - PADDING.top - PADDING.bottom}
                  rx="16"
                  fill="rgba(40, 6, 58, 0.24)"
                />

                {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                  const price = chart.minPrice + (chart.maxPrice - chart.minPrice) * step;
                  const y = chart.yForPrice(price);
                  return (
                    <g key={step}>
                      <line x1={PADDING.left} x2={VIEWBOX_WIDTH - PADDING.right} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 8" />
                      <text x={10} y={y + 4} fill="rgba(255,255,255,0.52)" fontSize="11" fontFamily="monospace">
                        {formatChartPrice(price)}
                      </text>
                    </g>
                  );
                })}

                {data.bands.map((band) => {
                  const intensity = Math.max(band.notionalUsd / chart.maxBandNotional, 0.08);
                  const y = chart.yForPrice(band.price);
                  const height = 6 + intensity * 9;
                  const fill =
                    band.side === "short_liq"
                      ? `rgba(250, 204, 21, ${0.18 + intensity * 0.84})`
                      : `rgba(45, 212, 191, ${0.14 + intensity * 0.68})`;
                  return (
                    <g key={`${band.side}-${band.distancePct}-${band.price}`}>
                      <rect
                        x={PADDING.left}
                        y={y - height / 2}
                        width={VIEWBOX_WIDTH - PADDING.left - PADDING.right}
                        height={height}
                        rx="4"
                        fill={fill}
                        onMouseEnter={() => setActiveBand(band)}
                        onMouseLeave={() => setActiveBand(null)}
                        onClick={() => setActiveBand(band)}
                        className="cursor-pointer"
                      />
                    </g>
                  );
                })}

                <path d={chart.path} fill="none" stroke="url(#priceGlow)" strokeWidth="2.6" strokeLinecap="round" />

                {data.currentPrice != null ? (
                  <>
                    <line
                      x1={PADDING.left}
                      x2={VIEWBOX_WIDTH - PADDING.right}
                      y1={chart.yForPrice(data.currentPrice)}
                      y2={chart.yForPrice(data.currentPrice)}
                      stroke="rgba(255,255,255,0.3)"
                      strokeDasharray="6 6"
                    />
                    <text
                      x={VIEWBOX_WIDTH - PADDING.right - 4}
                      y={chart.yForPrice(data.currentPrice) - 6}
                      textAnchor="end"
                      fill="rgba(255,255,255,0.72)"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {data.selectedAsset} now {formatChartPrice(data.currentPrice)}
                    </text>
                  </>
                ) : null}
              </svg>

              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 px-3 py-2 text-[11px] leading-5 text-zinc-400">
                  Hover a pocket to inspect distance, notional, and wallet count. These ladders are projected from current tracked positions across the recent price path and do not represent exchange-wide liquidation interest.
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 px-3 py-2 text-[11px] leading-5 text-zinc-300">
                  {featuredBand ? (
                    <div className="space-y-1">
                      <div className="font-medium text-zinc-100">
                        {featuredBand.side === "short_liq" ? "Short pocket" : "Long pocket"} at {formatChartPrice(featuredBand.price)}
                      </div>
                      <div>{formatCompactUsd(featuredBand.notionalUsd)} across {featuredBand.walletCount} wallets</div>
                      <div>{formatPct(featuredBand.distancePct)} from current price</div>
                    </div>
                  ) : (
                    <div>No highlighted pocket yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
