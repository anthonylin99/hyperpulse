"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Layers3, Target } from "lucide-react";
import { cn, formatChartPrice, formatCompactUsd, formatTimestampShort } from "@/lib/format";
import { withNetworkParam } from "@/lib/hyperliquid";
import { FilterChip, SectionEyebrow } from "@/components/trading-ui";

type LiquidityBandSide = "short_liq" | "long_liq" | "ask_liquidity" | "bid_liquidity" | "structure_resistance" | "structure_support";
type LiquidityBandSource = "tracked_liquidation" | "visible_orderbook" | "price_structure";

type LiquidityBand = {
  price: number;
  lowPrice: number;
  highPrice: number;
  notionalUsd: number;
  walletCount: number;
  orderCount: number;
  distancePct: number;
  side: LiquidityBandSide;
  source: LiquidityBandSource;
  confidence: "high" | "medium" | "low";
  strength?: number;
  touches?: number;
};

type LiquidityCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type LiquidityMapResponse = {
  coin: string;
  range: "24h" | "3d" | "7d";
  interval: string;
  currentPrice: number;
  generatedAt: number;
  candles: LiquidityCandle[];
  bands: LiquidityBand[];
  maxDistancePct: number;
  source: "tracked-liquidations-plus-book" | "visible-orderbook-only";
  caveat: string;
  summary: {
    shortLiquidationUsd: number;
    longLiquidationUsd: number;
    askLiquidityUsd: number;
    bidLiquidityUsd: number;
    trackedBandCount: number;
    bookBandCount: number;
    trackedWallets: number;
    currentPrice: number;
  };
};

type LiquidityRange = "24h" | "3d" | "7d";

type ChartScales = {
  minPrice: number;
  maxPrice: number;
  maxBandNotional: number;
  xForTime: (time: number) => number;
  yForPrice: (price: number) => number;
  plotWidth: number;
  plotHeight: number;
};

const RANGES: LiquidityRange[] = ["24h", "3d", "7d"];
const WIDTH = 1040;
const HEIGHT = 470;
const PAD = { top: 20, right: 78, bottom: 34, left: 24 };
const MIN_BODY_HEIGHT = 2.4;
const NEAR_DISTANCE_PCT = 6;
const MAX_PLOTTED_BANDS = 10;

function bandLabel(side: LiquidityBandSide) {
  switch (side) {
    case "short_liq":
      return "Short liquidation";
    case "long_liq":
      return "Long liquidation";
    case "ask_liquidity":
      return "Ask wall";
    case "bid_liquidity":
      return "Bid wall";
    case "structure_resistance":
      return "Resistance";
    case "structure_support":
      return "Support";
  }
}

function bandUse(side: LiquidityBandSide) {
  switch (side) {
    case "short_liq":
      return "short pain / long take-profit zone";
    case "long_liq":
      return "long pain / short take-profit zone";
    case "ask_liquidity":
      return "sell wall / upside resistance";
    case "bid_liquidity":
      return "buy wall / downside support";
    case "structure_resistance":
      return "long take-profit / short stop-loss reference";
    case "structure_support":
      return "short take-profit / long stop-loss reference";
  }
}

function bandTone(side: LiquidityBandSide) {
  switch (side) {
    case "short_liq":
      return { fill: [248, 113, 113], stroke: "#fb7185", text: "text-rose-300", border: "border-rose-500/30", bg: "bg-rose-500/10" };
    case "long_liq":
      return { fill: [52, 211, 153], stroke: "#34d399", text: "text-emerald-300", border: "border-emerald-500/30", bg: "bg-emerald-500/10" };
    case "ask_liquidity":
      return { fill: [251, 191, 36], stroke: "#fbbf24", text: "text-amber-300", border: "border-amber-500/30", bg: "bg-amber-500/10" };
    case "bid_liquidity":
      return { fill: [45, 212, 191], stroke: "#2dd4bf", text: "text-teal-300", border: "border-teal-500/30", bg: "bg-teal-500/10" };
    case "structure_resistance":
      return { fill: [251, 146, 60], stroke: "#fb923c", text: "text-orange-300", border: "border-orange-500/30", bg: "bg-orange-500/10" };
    case "structure_support":
      return { fill: [20, 184, 166], stroke: "#14b8a6", text: "text-teal-300", border: "border-teal-500/30", bg: "bg-teal-500/10" };
  }
}

function colorWithAlpha(rgb: number[], alpha: number) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function formatDistance(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(Math.abs(value) < 1 ? 2 : 1)}%`;
}

function rangeLabel(range: LiquidityRange) {
  if (range === "24h") return "24h";
  if (range === "3d") return "3d";
  return "7d";
}

function bandScore(band: LiquidityBand) {
  const sourceWeight = band.source === "tracked_liquidation" ? 2.25 : band.source === "price_structure" ? 1.65 : 1;
  const confidenceWeight = band.confidence === "high" ? 1.25 : band.confidence === "medium" ? 1.05 : 0.85;
  return (band.notionalUsd / 1_000_000) * sourceWeight * confidenceWeight / Math.max(Math.abs(band.distancePct), 0.35);
}

function sortByDistance(a: LiquidityBand, b: LiquidityBand) {
  return Math.abs(a.distancePct) - Math.abs(b.distancePct) || b.notionalUsd - a.notionalUsd;
}

function sortByScore(a: LiquidityBand, b: LiquidityBand) {
  return bandScore(b) - bandScore(a) || sortByDistance(a, b);
}

function bandRangeLabel(band: LiquidityBand) {
  if (Math.abs(band.highPrice - band.lowPrice) / band.price < 0.0015) return formatChartPrice(band.price);
  return `${formatChartPrice(band.lowPrice)}-${formatChartPrice(band.highPrice)}`;
}

function sourceLabel(band: LiquidityBand) {
  if (band.source === "tracked_liquidation") return "tracked wallets";
  if (band.source === "price_structure") return `${band.touches ?? 1} touch${(band.touches ?? 1) === 1 ? "" : "es"}`;
  return "visible book";
}

function bandSizeLabel(band: LiquidityBand) {
  if (band.source === "price_structure") {
    return `${band.confidence} confidence`;
  }
  return formatCompactUsd(band.notionalUsd);
}

export default function LiquidityMapPanel({ coin }: { coin: string }) {
  const [range, setRange] = useState<LiquidityRange>("3d");
  const [data, setData] = useState<LiquidityMapResponse | null>(null);
  const [activeBand, setActiveBand] = useState<LiquidityBand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(withNetworkParam(`/api/market/liquidity-map?coin=${encodeURIComponent(coin)}&range=${range}`), {
          cache: "no-store",
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Liquidity map unavailable");
        }
        const payload = (await response.json()) as LiquidityMapResponse;
        if (!mounted) return;
        setData(payload);
        setActiveBand(null);
      } catch (loadError) {
        if (!mounted) return;
        setData(null);
        setActiveBand(null);
        setError(loadError instanceof Error ? loadError.message : "Liquidity map unavailable");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [coin, range]);

  const plottedBands = useMemo(() => {
    const bands = data?.bands ?? [];
    return bands
      .filter((band) => Math.abs(band.distancePct) <= NEAR_DISTANCE_PCT)
      .sort(sortByScore)
      .slice(0, MAX_PLOTTED_BANDS)
      .sort(sortByDistance);
  }, [data]);

  const hiddenBandCount = Math.max((data?.bands.length ?? 0) - plottedBands.length, 0);

  const chart = useMemo((): ChartScales | null => {
    if (!data || data.candles.length === 0) return null;
    const candlePrices = data.candles.flatMap((candle) => [candle.high, candle.low]);
    const bandPrices = plottedBands.flatMap((band) => [band.lowPrice, band.highPrice, band.price]);
    const minRaw = Math.min(...candlePrices, ...bandPrices, data.currentPrice);
    const maxRaw = Math.max(...candlePrices, ...bandPrices, data.currentPrice);
    if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw) || minRaw <= 0 || maxRaw <= minRaw) return null;
    const padding = Math.max((maxRaw - minRaw) * 0.08, data.currentPrice * 0.0015);
    const minPrice = minRaw - padding;
    const maxPrice = maxRaw + padding;
    const minTime = data.candles[0].time;
    const maxTime = data.candles[data.candles.length - 1].time;
    const plotWidth = WIDTH - PAD.left - PAD.right;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const xForTime = (time: number) => PAD.left + ((time - minTime) / Math.max(maxTime - minTime, 1)) * plotWidth;
    const yForPrice = (price: number) => PAD.top + ((maxPrice - price) / Math.max(maxPrice - minPrice, 1)) * plotHeight;
    const maxBandNotional = Math.max(...plottedBands.map((band) => band.notionalUsd), 1);
    return { minPrice, maxPrice, maxBandNotional, xForTime, yForPrice, plotWidth, plotHeight };
  }, [data, plottedBands]);

  const action = useMemo(() => {
    const bands = data?.bands ?? [];
    const actionableBands = bands.filter((band) => Math.abs(band.distancePct) <= NEAR_DISTANCE_PCT);
    const upside = actionableBands.filter((band) => band.distancePct > 0).sort(sortByScore);
    const downside = actionableBands.filter((band) => band.distancePct < 0).sort(sortByScore);
    const nearestShortLiq = actionableBands.filter((band) => band.side === "short_liq" && band.distancePct > 0).sort(sortByDistance)[0] ?? null;
    const nearestLongLiq = actionableBands.filter((band) => band.side === "long_liq" && band.distancePct < 0).sort(sortByDistance)[0] ?? null;
    const nearestAsk = actionableBands.filter((band) => band.side === "ask_liquidity" && band.distancePct > 0).sort(sortByDistance)[0] ?? null;
    const nearestBid = actionableBands.filter((band) => band.side === "bid_liquidity" && band.distancePct < 0).sort(sortByDistance)[0] ?? null;
    const nearestResistance = actionableBands.filter((band) => band.side === "structure_resistance" && band.distancePct > 0).sort(sortByDistance)[0] ?? null;
    const nearestSupport = actionableBands.filter((band) => band.side === "structure_support" && band.distancePct < 0).sort(sortByDistance)[0] ?? null;
    return {
      upsideMagnet: upside[0] ?? nearestResistance ?? nearestShortLiq ?? null,
      downsideMagnet: downside[0] ?? nearestSupport ?? nearestLongLiq ?? null,
      nearestShortLiq,
      nearestLongLiq,
      nearestAsk,
      nearestBid,
      nearestResistance,
      nearestSupport,
    };
  }, [data]);

  const strongestBands = useMemo(() => plottedBands.sort(sortByDistance).slice(0, 8), [plottedBands]);
  const highlighted = activeBand ?? strongestBands[0] ?? null;

  const readCopy = useMemo(() => {
    if (!data) return "";
    const up = action.upsideMagnet;
    const down = action.downsideMagnet;
    if (up && down) {
      return `Near-term map is bracketed: upside ${bandLabel(up.side).toLowerCase()} near ${formatChartPrice(up.price)}, downside ${bandLabel(down.side).toLowerCase()} near ${formatChartPrice(down.price)}.`;
    }
    if (up) return `Upside liquidity is the cleaner magnet: watch ${formatChartPrice(up.price)} (${formatDistance(up.distancePct)}) as the next take-profit/risk zone.`;
    if (down) return `Downside liquidity is the cleaner magnet: watch ${formatChartPrice(down.price)} (${formatDistance(down.distancePct)}) as the next take-profit/risk zone.`;
    return "No actionable nearby liquidity cluster; use the price-structure tab for support/resistance first.";
  }, [action.downsideMagnet, action.upsideMagnet, data]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-zinc-800 bg-[#10151b] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionEyebrow>Liquidity map</SectionEyebrow>
            <div className="mt-1 text-sm font-semibold text-zinc-100">Actionable liquidity zones around current price</div>
            <div className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
              This view is for trade locations: upside clusters can become long take-profit / short-risk zones, while downside clusters can become short take-profit / long-risk zones.
            </div>
          </div>
          <div className="flex items-center gap-1">
            {RANGES.map((item) => (
              <FilterChip key={item} label={rangeLabel(item)} active={range === item} onClick={() => setRange(item)} className="py-1 text-[11px]" />
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="h-[560px] rounded-2xl border border-zinc-800 skeleton" />
      ) : data && chart ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#070a0f]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-lg font-semibold text-zinc-100">{data.coin}</span>
                <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-zinc-300">
                  {data.interval} candles
                </span>
                <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-zinc-100">
                  {formatChartPrice(data.currentPrice)}
                </span>
              </div>
              <div className="text-[11px] text-zinc-500">Updated {formatTimestampShort(data.generatedAt)}</div>
            </div>

            <div className="border-b border-zinc-900/90 px-4 py-3">
              <div className="grid gap-2 md:grid-cols-2">
                <ActionCard title="Long TP / Short SL" band={action.upsideMagnet} empty="No upside level nearby" icon="up" />
                <ActionCard title="Short TP / Long SL" band={action.downsideMagnet} empty="No downside level nearby" icon="down" />
              </div>
              <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs leading-5 text-zinc-400">
                <span className="text-zinc-200">Trader read:</span> {readCopy}
              </div>
            </div>

            <div className="p-3">
              <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[540px] w-full rounded-[18px] border border-zinc-800 bg-[#070a0f]">
                <defs>
                  <linearGradient id="liquidityFade" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.02)" />
                    <stop offset="55%" stopColor="rgba(255,255,255,0.09)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.16)" />
                  </linearGradient>
                </defs>

                <rect x={PAD.left} y={PAD.top} width={chart.plotWidth} height={chart.plotHeight} fill="#070a0f" />

                {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                  const y = PAD.top + step * chart.plotHeight;
                  const price = chart.maxPrice - step * (chart.maxPrice - chart.minPrice);
                  return (
                    <g key={step}>
                      <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke="rgba(255,255,255,0.055)" />
                      <text x={WIDTH - PAD.right + 10} y={y + 4} fill="rgba(212,212,216,0.72)" fontSize="11" fontFamily="monospace">
                        {formatChartPrice(price)}
                      </text>
                    </g>
                  );
                })}

                {[0, 0.2, 0.4, 0.6, 0.8, 1].map((step) => {
                  const x = PAD.left + step * chart.plotWidth;
                  return <line key={step} x1={x} x2={x} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="rgba(255,255,255,0.035)" />;
                })}

                {plottedBands.map((band) => {
                  const tone = bandTone(band.side);
                  const y1 = chart.yForPrice(band.highPrice);
                  const y2 = chart.yForPrice(band.lowPrice);
                  const height = Math.max(Math.abs(y2 - y1), band.source === "tracked_liquidation" ? 7 : 4);
                  const intensity = Math.min(1, Math.max(0.1, band.notionalUsd / chart.maxBandNotional));
                  const baseAlpha = band.source === "tracked_liquidation" ? 0.18 : 0.1;
                  const alpha = Math.min(0.72, baseAlpha + intensity * (band.source === "tracked_liquidation" ? 0.5 : 0.32));
                  const y = chart.yForPrice(band.price) - height / 2;
                  const active = highlighted === band;
                  return (
                    <g key={`${band.source}-${band.side}-${band.distancePct}`} onMouseEnter={() => setActiveBand(band)} onClick={() => setActiveBand(band)} className="cursor-pointer">
                      <rect x={PAD.left} y={y} width={chart.plotWidth} height={height} fill={colorWithAlpha(tone.fill, alpha)} />
                      <rect x={PAD.left} y={y} width={chart.plotWidth} height={height} fill="url(#liquidityFade)" opacity={band.source === "tracked_liquidation" ? 0.72 : 0.4} />
                      {active ? <line x1={PAD.left} x2={WIDTH - PAD.right} y1={chart.yForPrice(band.price)} y2={chart.yForPrice(band.price)} stroke={tone.stroke} strokeWidth="1.5" /> : null}
                    </g>
                  );
                })}

                {[action.upsideMagnet, action.downsideMagnet].filter(Boolean).map((band) => {
                  if (!band || !plottedBands.includes(band)) return null;
                  const tone = bandTone(band.side);
                  const y = chart.yForPrice(band.price);
                  const label = band.distancePct > 0 ? "Long TP / Short SL" : "Short TP / Long SL";
                  return (
                    <g key={`trade-label-${band.side}-${band.distancePct}`}>
                      <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke={tone.stroke} strokeDasharray="5 4" opacity="0.86" />
                      <rect x={WIDTH - PAD.right - 112} y={y - 12} width="112" height="24" rx="5" fill="rgba(9,9,11,0.92)" stroke={tone.stroke} />
                      <text x={WIDTH - PAD.right - 56} y={y + 4} textAnchor="middle" fill={tone.stroke} fontSize="10" fontFamily="monospace">
                        {label}
                      </text>
                    </g>
                  );
                })}

                {data.candles.map((candle, index) => {
                  const x = chart.xForTime(candle.time);
                  const next = data.candles[index + 1];
                  const nextX = next ? chart.xForTime(next.time) : x + chart.plotWidth / Math.max(data.candles.length, 1);
                  const candleWidth = Math.max(1, Math.min(7, (nextX - x) * 0.58));
                  const isUp = candle.close >= candle.open;
                  const color = isUp ? "#2dd4bf" : "#fb7185";
                  const highY = chart.yForPrice(candle.high);
                  const lowY = chart.yForPrice(candle.low);
                  const openY = chart.yForPrice(candle.open);
                  const closeY = chart.yForPrice(candle.close);
                  const bodyTop = Math.min(openY, closeY);
                  const bodyHeight = Math.max(Math.abs(closeY - openY), MIN_BODY_HEIGHT);
                  return (
                    <g key={`${candle.time}-${index}`}>
                      <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth="1.15" opacity="0.95" />
                      <rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} rx="0.7" fill={color} opacity="0.94" />
                    </g>
                  );
                })}

                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={chart.yForPrice(data.currentPrice)}
                  y2={chart.yForPrice(data.currentPrice)}
                  stroke="rgba(244,244,245,0.74)"
                  strokeDasharray="3 4"
                />
                <rect x={WIDTH - PAD.right} y={chart.yForPrice(data.currentPrice) - 11} width="66" height="22" rx="3" fill="rgba(244,244,245,0.95)" />
                <text x={WIDTH - PAD.right + 33} y={chart.yForPrice(data.currentPrice) + 4} textAnchor="middle" fill="#09090b" fontSize="11" fontFamily="monospace">
                  {formatChartPrice(data.currentPrice)}
                </text>
              </svg>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
                <span>Showing nearby/actionable bands only so price remains readable.</span>
                {hiddenBandCount > 0 ? <span>{hiddenBandCount} distant cluster{hiddenBandCount === 1 ? "" : "s"} hidden from chart scale.</span> : null}
              </div>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-teal-300" />
                <SectionEyebrow>Trade-use levels</SectionEyebrow>
              </div>
              <div className="mt-3 grid gap-2">
                <MiniLevel label="Nearest resistance" band={action.nearestResistance} empty="No resistance nearby" />
                <MiniLevel label="Nearest support" band={action.nearestSupport} empty="No support nearby" />
                <MiniLevel label="Nearest short-liq risk" band={action.nearestShortLiq} empty="No tracked short-liq nearby" />
                <MiniLevel label="Nearest long-liq risk" band={action.nearestLongLiq} empty="No tracked long-liq nearby" />
                <MiniLevel label="Nearest ask wall" band={action.nearestAsk} empty="No nearby ask wall" />
                <MiniLevel label="Nearest bid wall" band={action.nearestBid} empty="No nearby bid wall" />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-teal-300" />
                <SectionEyebrow>Nearby levels</SectionEyebrow>
              </div>
              <div className="mt-3 space-y-2">
                {strongestBands.length > 0 ? (
                  strongestBands.map((band) => {
                    const tone = bandTone(band.side);
                    const active = highlighted === band;
                    return (
                      <button
                        key={`${band.source}-${band.side}-${band.distancePct}`}
                        onClick={() => setActiveBand(band)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-2 text-left transition",
                          active ? "border-teal-500/45 bg-teal-500/10" : "border-zinc-800 bg-zinc-900/45 hover:border-zinc-700",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("text-xs font-semibold", tone.text)}>{bandLabel(band.side)}</span>
                          <span className="font-mono text-xs text-zinc-100">{bandRangeLabel(band)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                          <span>{bandSizeLabel(band)} · {sourceLabel(band)}</span>
                          <span>{formatDistance(band.distancePct)}</span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-800 px-3 py-5 text-center text-xs text-zinc-500">
                    No meaningful bands in range.
                  </div>
                )}
              </div>
            </div>

            {highlighted ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                <SectionEyebrow>Selected band</SectionEyebrow>
                <div className="mt-2 text-base font-semibold text-zinc-100">{bandLabel(highlighted.side)}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <InfoPill label="Zone" value={bandRangeLabel(highlighted)} />
                  <InfoPill label="Distance" value={formatDistance(highlighted.distancePct)} />
                  <InfoPill label={highlighted.source === "price_structure" ? "Quality" : "Size"} value={bandSizeLabel(highlighted)} />
                  <InfoPill label="Source" value={sourceLabel(highlighted)} />
                </div>
                <div className="mt-3 text-[11px] leading-5 text-zinc-500">
                  Use case: {bandUse(highlighted.side)}. {highlighted.source === "tracked_liquidation"
                    ? `${highlighted.walletCount} monitored wallet${highlighted.walletCount === 1 ? "" : "s"} contribute to this band.`
                    : `${highlighted.orderCount} visible order${highlighted.orderCount === 1 ? "" : "s"} contribute to this band.`}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-10 text-center text-sm text-zinc-500">
          No liquidity-map data available yet.
        </div>
      )}

      {data ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 px-4 py-3 text-xs leading-5 text-zinc-500">
          {data.source === "tracked-liquidations-plus-book"
            ? "Accuracy note: liquidation bands are estimated only from monitored HyperPulse wallets with usable liquidation prices, while depth bands are current visible Hyperliquid L2 liquidity. This is a level-finding tool, not a full Coinglass all-exchange liquidation map."
            : data.caveat}
        </div>
      ) : null}
    </div>
  );
}

function ActionCard({ title, band, empty, icon }: { title: string; band: LiquidityBand | null; empty: string; icon: "up" | "down" }) {
  const Icon = icon === "up" ? ArrowUpRight : ArrowDownRight;
  const tone = band ? bandTone(band.side) : null;
  return (
    <div className={cn("rounded-xl border px-3 py-3", tone ? `${tone.border} ${tone.bg}` : "border-zinc-800 bg-zinc-950/60")}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{title}</div>
        <Icon className={cn("h-4 w-4", tone?.text ?? "text-zinc-600")} />
      </div>
      {band ? (
        <>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <div className="font-mono text-lg font-semibold text-zinc-100">{bandRangeLabel(band)}</div>
            <div className={cn("font-mono text-xs", tone?.text)}>{formatDistance(band.distancePct)}</div>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {bandLabel(band.side)} · {bandSizeLabel(band)} · {sourceLabel(band)}
          </div>
        </>
      ) : (
        <div className="mt-3 text-sm text-zinc-500">{empty}</div>
      )}
    </div>
  );
}

function MiniLevel({ label, band, empty }: { label: string; band: LiquidityBand | null; empty: string }) {
  const tone = band ? bandTone(band.side) : null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.13em] text-zinc-500">{label}</span>
        {band ? <span className={cn("font-mono text-[11px]", tone?.text)}>{formatDistance(band.distancePct)}</span> : null}
      </div>
      {band ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-mono text-sm text-zinc-100">{bandRangeLabel(band)}</span>
          <span className="text-[11px] text-zinc-500">{bandSizeLabel(band)}</span>
        </div>
      ) : (
        <div className="mt-1 text-xs text-zinc-600">{empty}</div>
      )}
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className="mt-1 font-mono text-sm text-zinc-100">{value}</div>
    </div>
  );
}
