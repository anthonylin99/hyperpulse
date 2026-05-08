"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, MousePointer2, Target } from "lucide-react";
import { cn, formatChartPrice, formatCompactUsd, formatTimestampShort } from "@/lib/format";
import { withNetworkParam } from "@/lib/hyperliquid";
import { formatEasternChartTick } from "@/lib/time";
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
  source: "tracked-liquidations-plus-book" | "visible-orderbook-only" | "price-structure-only";
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

const RANGES: LiquidityRange[] = ["24h", "3d", "7d"];
const NEAR_DISTANCE_PCT = 8;
const MAX_CHART_LEVELS = 4;
const MAX_TABLE_LEVELS = 7;

function bandLabel(side: LiquidityBandSide) {
  switch (side) {
    case "short_liq":
      return "Short liq";
    case "long_liq":
      return "Long liq";
    case "ask_liquidity":
      return "Ask wall";
    case "bid_liquidity":
      return "Bid wall";
    case "structure_resistance":
      return "Structure ceiling";
    case "structure_support":
      return "Structure floor";
  }
}

function bandRole(side: LiquidityBandSide) {
  switch (side) {
    case "short_liq":
      return "TP for longs / squeeze risk for shorts";
    case "long_liq":
      return "TP for shorts / risk for longs";
    case "ask_liquidity":
      return "Upside supply";
    case "bid_liquidity":
      return "Downside demand";
    case "structure_resistance":
      return "Resistance";
    case "structure_support":
      return "Support";
  }
}

function bandTone(side: LiquidityBandSide) {
  switch (side) {
    case "short_liq":
      return { stroke: "#fb7185", text: "text-rose-300", border: "border-rose-500/30", bg: "bg-rose-500/10" };
    case "long_liq":
      return { stroke: "#34d399", text: "text-emerald-300", border: "border-emerald-500/30", bg: "bg-emerald-500/10" };
    case "ask_liquidity":
      return { stroke: "#fbbf24", text: "text-amber-300", border: "border-amber-500/30", bg: "bg-amber-500/10" };
    case "bid_liquidity":
      return { stroke: "#2dd4bf", text: "text-teal-300", border: "border-teal-500/30", bg: "bg-teal-500/10" };
    case "structure_resistance":
      return { stroke: "#fb923c", text: "text-orange-300", border: "border-orange-500/30", bg: "bg-orange-500/10" };
    case "structure_support":
      return { stroke: "#14b8a6", text: "text-teal-300", border: "border-teal-500/30", bg: "bg-teal-500/10" };
  }
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

function bandSizeLabel(band: LiquidityBand) {
  if (band.source === "price_structure") return `${band.confidence} · ${band.touches ?? 1} touch${(band.touches ?? 1) === 1 ? "" : "es"}`;
  const count = band.source === "tracked_liquidation" ? band.walletCount : band.orderCount;
  return `${formatCompactUsd(band.notionalUsd)} · ${count || 0} ${band.source === "tracked_liquidation" ? "wallets" : "orders"}`;
}

function sourceLabel(band: LiquidityBand) {
  if (band.source === "tracked_liquidation") return "tracked liq";
  if (band.source === "price_structure") return "structure";
  return "order book";
}

function toChartTime(time: number): UTCTimestamp {
  const normalized = time > 10_000_000_000 ? time : time * 1000;
  return Math.floor(normalized / 1000) as UTCTimestamp;
}

function toCandlestickData(candles: LiquidityCandle[]): CandlestickData[] {
  const seen = new Set<number>();
  return candles
    .map((candle) => ({
      time: toChartTime(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }))
    .filter((candle) => {
      const key = Number(candle.time);
      if (seen.has(key)) return false;
      seen.add(key);
      return [candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(value) && value > 0) && candle.high >= candle.low;
    });
}

function pricePrecision(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 2;
  if (value >= 100) return 0;
  if (value >= 1) return 2;
  if (value >= 0.01) return 4;
  return 6;
}

function minMoveForPrecision(precision: number): number {
  return precision === 0 ? 1 : Number(`0.${"0".repeat(Math.max(precision - 1, 0))}1`);
}

function chartPriceFormatter(value: number): string {
  return formatChartPrice(value);
}

function dedupeBands(bands: Array<LiquidityBand | null | undefined>) {
  const seen = new Set<string>();
  const output: LiquidityBand[] = [];
  for (const band of bands) {
    if (!band) continue;
    const key = `${band.side}:${Math.round(band.price * 1_000_000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(band);
  }
  return output;
}

function chartTitleForBand(band: LiquidityBand) {
  if (band.side === "short_liq") return "TP / Short SL";
  if (band.side === "long_liq") return "Short TP / Long SL";
  if (band.side === "structure_resistance") return "R";
  if (band.side === "structure_support") return "S";
  if (band.side === "ask_liquidity") return "Ask";
  return "Bid";
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

  const action = useMemo(() => {
    const bands = data?.bands ?? [];
    const actionableBands = bands.filter((band) => Math.abs(band.distancePct) <= NEAR_DISTANCE_PCT);
    const upside = actionableBands.filter((band) => band.distancePct > 0).sort(sortByScore);
    const downside = actionableBands.filter((band) => band.distancePct < 0).sort(sortByScore);
    const nearestShortLiq = actionableBands.filter((band) => band.side === "short_liq" && band.distancePct > 0).sort(sortByDistance)[0] ?? null;
    const nearestLongLiq = actionableBands.filter((band) => band.side === "long_liq" && band.distancePct < 0).sort(sortByDistance)[0] ?? null;
    const nearestResistance = actionableBands.filter((band) => band.side === "structure_resistance" && band.distancePct > 0).sort(sortByDistance)[0] ?? null;
    const nearestSupport = actionableBands.filter((band) => band.side === "structure_support" && band.distancePct < 0).sort(sortByDistance)[0] ?? null;
    return {
      upsideMagnet: nearestShortLiq ?? nearestResistance ?? upside[0] ?? null,
      downsideMagnet: nearestLongLiq ?? nearestSupport ?? downside[0] ?? null,
      nearestResistance,
      nearestSupport,
      fallbackBands: actionableBands.sort(sortByScore),
    };
  }, [data]);

  const chartBands = useMemo(() => {
    const primary = dedupeBands([
      action.upsideMagnet,
      action.downsideMagnet,
      action.nearestResistance,
      action.nearestSupport,
      ...action.fallbackBands,
    ]);
    return primary.slice(0, MAX_CHART_LEVELS).sort((a, b) => a.price - b.price);
  }, [action.downsideMagnet, action.fallbackBands, action.nearestResistance, action.nearestSupport, action.upsideMagnet]);

  const levelRows = useMemo(() => {
    const rows = dedupeBands([action.upsideMagnet, action.downsideMagnet, action.nearestResistance, action.nearestSupport, ...action.fallbackBands]);
    return rows.sort(sortByDistance).slice(0, MAX_TABLE_LEVELS);
  }, [action.downsideMagnet, action.fallbackBands, action.nearestResistance, action.nearestSupport, action.upsideMagnet]);

  const highlighted = activeBand ?? levelRows[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-zinc-800 bg-[#10151b] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionEyebrow>Liquidity Context</SectionEyebrow>
            <div className="mt-1 text-sm font-semibold text-zinc-100">Advanced depth and zone context</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
              <MousePointer2 className="h-3.5 w-3.5 text-teal-300" />
              Secondary context only. Use the Price chart TA Guide for the main decision levels.
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
      ) : data ? (
        <div className="space-y-3">
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
                <ActionCard title="Upside TP / short risk" band={action.upsideMagnet} empty="No upside zone nearby" icon="up" />
                <ActionCard title="Downside TP / long risk" band={action.downsideMagnet} empty="No downside zone nearby" icon="down" />
              </div>
            </div>

            <div className="p-3">
              <LiquidityCandlestickChart data={data} levels={chartBands} activeBand={highlighted} range={range} />
            </div>
          </div>

          <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60">
              <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
                <Target className="h-4 w-4 text-teal-300" />
                <SectionEyebrow>Nearby levels</SectionEyebrow>
              </div>
              <LevelTable rows={levelRows} activeBand={highlighted} onSelect={setActiveBand} />
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <SectionEyebrow>Selected</SectionEyebrow>
              {highlighted ? (
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">{bandLabel(highlighted.side)}</div>
                    <div className="mt-1 font-mono text-lg text-zinc-50">{bandRangeLabel(highlighted)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <InfoPill label="Distance" value={formatDistance(highlighted.distancePct)} />
                    <InfoPill label="Quality" value={bandSizeLabel(highlighted)} />
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2 text-xs leading-5 text-zinc-400">
                    {bandRole(highlighted.side)} · {sourceLabel(highlighted)}
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-zinc-500">No selected level.</div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-10 text-center text-sm text-zinc-500">
          No liquidity-map data available yet.
        </div>
      )}

      {data ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 px-4 py-3 text-xs leading-5 text-zinc-500">
          {data.source === "tracked-liquidations-plus-book"
            ? "Accuracy note: liquidation bands are estimated from monitored HyperPulse wallets with usable liquidation prices. Depth bands are current visible Hyperliquid L2 liquidity."
            : data.caveat}
        </div>
      ) : null}
    </div>
  );
}

function LiquidityCandlestickChart({
  data,
  levels,
  activeBand,
  range,
}: {
  data: LiquidityMapResponse;
  levels: LiquidityBand[];
  activeBand: LiquidityBand | null;
  range: LiquidityRange;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const candles = toCandlestickData(data.candles);
    if (!container || candles.length === 0) return;
    const precision = pricePrecision(data.currentPrice);

    const chart = createChart(container, {
      autoSize: true,
      localization: {
        priceFormatter: chartPriceFormatter,
        timeFormatter: (time: unknown) => formatEasternChartTick(time, range === "24h" ? "datetime" : "date"),
      },
      layout: {
        background: { type: ColorType.Solid, color: "#070a0f" },
        textColor: "#a1a1aa",
        panes: { separatorColor: "#18181b" },
      },
      grid: {
        vertLines: { color: "rgba(63, 63, 70, 0.2)" },
        horzLines: { color: "rgba(63, 63, 70, 0.2)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#71717a", labelBackgroundColor: "#18181b" },
        horzLine: { color: "#71717a", labelBackgroundColor: "#18181b" },
      },
      rightPriceScale: {
        borderColor: "#27272a",
        textColor: "#d4d4d8",
        scaleMargins: { top: 0.08, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#27272a",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 10,
        tickMarkFormatter: (time: unknown) => formatEasternChartTick(time, range === "24h" ? "time" : "date"),
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#14b8a6",
      downColor: "#ef4444",
      borderUpColor: "#2dd4bf",
      borderDownColor: "#fb7185",
      wickUpColor: "#5eead4",
      wickDownColor: "#fb7185",
      priceLineColor: "rgba(244,244,245,0.8)",
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dashed,
      priceFormat: {
        type: "price",
        precision,
        minMove: minMoveForPrecision(precision),
      },
    });

    candleSeries.setData(candles);

    levels.forEach((band) => {
      const tone = bandTone(band.side);
      const active = activeBand === band;
      const lineWidth = active ? 3 : band.confidence === "high" ? 2 : 1;
      candleSeries.createPriceLine({
        price: band.price,
        color: tone.stroke,
        lineWidth,
        lineStyle: active ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: true,
        title: chartTitleForBand(band),
      });

      if (Math.abs(band.highPrice - band.lowPrice) / band.price >= 0.0015) {
        [band.lowPrice, band.highPrice].forEach((price) => {
          candleSeries.createPriceLine({
            price,
            color: tone.stroke,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: "",
          });
        });
      }
    });

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [activeBand, data, levels, range]);

  return (
    <div className="rounded-[18px] border border-zinc-800 bg-[#070a0f]">
      <div ref={containerRef} className="h-[460px] w-full md:h-[540px]" />
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
            {bandLabel(band.side)} · {bandSizeLabel(band)}
          </div>
        </>
      ) : (
        <div className="mt-3 text-sm text-zinc-500">{empty}</div>
      )}
    </div>
  );
}

function LevelTable({ rows, activeBand, onSelect }: { rows: LiquidityBand[]; activeBand: LiquidityBand | null; onSelect: (band: LiquidityBand) => void }) {
  if (!rows.length) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">No meaningful nearby levels.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-800 text-left text-xs">
        <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">
          <tr>
            <th className="px-4 py-3 font-medium">Level</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 text-right font-medium">Distance</th>
            <th className="px-4 py-3 text-right font-medium">Size / Quality</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-900">
          {rows.map((band) => {
            const tone = bandTone(band.side);
            const active = activeBand === band;
            return (
              <tr
                key={`${band.source}-${band.side}-${band.price}-${band.distancePct}`}
                onClick={() => onSelect(band)}
                className={cn("cursor-pointer transition hover:bg-zinc-900/60", active && "bg-teal-500/5")}
              >
                <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-zinc-100">{bandRangeLabel(band)}</td>
                <td className="px-4 py-3">
                  <div className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]", tone.border, tone.bg, tone.text)}>
                    {bandLabel(band.side)}
                  </div>
                  <div className="mt-1 max-w-[260px] truncate text-[11px] text-zinc-500">{bandRole(band.side)}</div>
                </td>
                <td className={cn("whitespace-nowrap px-4 py-3 text-right font-mono text-sm", tone.text)}>{formatDistance(band.distancePct)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-zinc-400">
                  <div className="font-mono text-xs text-zinc-200">{bandSizeLabel(band)}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-600">{sourceLabel(band)}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
