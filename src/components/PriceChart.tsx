"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import { withNetworkParam } from "@/lib/hyperliquid";
import { formatEasternChartTick, formatEasternDateTime } from "@/lib/time";
import { type ReactionOverlayMode } from "@/lib/reactionLevels";
import { calculateSupportResistanceLevels } from "@/lib/supportResistance";
import { buildTaGuide, type MovingAveragePoint } from "@/lib/technicalAnalysis";
import { SectionEyebrow } from "@/components/trading-ui";
import type { SupportResistanceLevel } from "@/types";

interface PriceChartProps {
  coin: string;
  marketType?: "perp" | "spot";
  compact?: boolean;
  fundingAPR?: number | null;
  fundingPercentile?: number | null;
}

type TradingInterval = "5" | "15" | "60" | "240" | "D";
const DEFAULT_INTERVAL: TradingInterval = "15";

const API_INTERVAL: Record<TradingInterval, "5m" | "15m" | "1h" | "4h" | "1d"> = {
  "5": "5m",
  "15": "15m",
  "60": "1h",
  "240": "4h",
  D: "1d",
};

const LOOKBACK_MS: Record<TradingInterval, number> = {
  "5": 2 * 24 * 60 * 60 * 1000,
  "15": 5 * 24 * 60 * 60 * 1000,
  "60": 30 * 24 * 60 * 60 * 1000,
  "240": 90 * 24 * 60 * 60 * 1000,
  D: 119 * 24 * 60 * 60 * 1000,
};

const INTERVAL_MS: Record<TradingInterval, number> = {
  "5": 5 * 60 * 1000,
  "15": 15 * 60 * 1000,
  "60": 60 * 60 * 1000,
  "240": 4 * 60 * 60 * 1000,
  D: 24 * 60 * 60 * 1000,
};

const INTERVAL_OPTIONS: Array<{ label: string; value: TradingInterval }> = [
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "1h", value: "60" },
  { label: "4h", value: "240" },
  { label: "1d", value: "D" },
];

type CandleDatum = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function normalizeTime(time: number): number {
  return time > 10_000_000_000 ? time : time * 1000;
}

function toChartTime(time: number): UTCTimestamp {
  return Math.floor(normalizeTime(time) / 1000) as UTCTimestamp;
}

function toCandlestickData(candles: CandleDatum[]): CandlestickData[] {
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
      const time = Number(candle.time);
      if (seen.has(time)) return false;
      seen.add(time);
      return (
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        candle.high >= candle.low &&
        candle.close > 0
      );
    });
}

function toLineData(points: MovingAveragePoint[]): LineData[] {
  return points
    .map((point) => ({
      time: toChartTime(point.time),
      value: point.value,
    }))
    .filter((point) => Number.isFinite(point.value));
}

function formatLevelPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toLocaleString(undefined, { maximumFractionDigits: value < 1 ? 6 : value < 100 ? 2 : 0 });
}

function formatLevelRange(level: SupportResistanceLevel | null | undefined): string {
  if (!level) return "n/a";
  if (
    level.zoneLow != null &&
    level.zoneHigh != null &&
    Number.isFinite(level.zoneLow) &&
    Number.isFinite(level.zoneHigh) &&
    level.zoneHigh > level.zoneLow
  ) {
    return `${formatLevelPrice(level.zoneLow)}-${formatLevelPrice(level.zoneHigh)}`;
  }
  return formatLevelPrice(level.price);
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
  return formatLevelPrice(value);
}

function formatTimeMs(timeMs: number | null | undefined): string {
  if (!timeMs || !Number.isFinite(timeMs)) return "n/a";
  return formatEasternDateTime(timeMs);
}

type LevelRead = {
  label: "Rejection" | "Break" | "Pivot" | "Stress";
  summary: string;
  reason: string;
  className: string;
};

function isStressZone(level: SupportResistanceLevel): boolean {
  return level.leverageBucket === "stress";
}

function isDownsideReactionLevel(
  level: SupportResistanceLevel,
  currentPrice: number | null,
  overlayMode: ReactionOverlayMode,
): boolean {
  if (level.kind !== "support") return false;
  if (overlayMode === "oi_holding" && level.exposureSide === "bull") return true;
  return currentPrice == null || level.price < currentPrice;
}

function isUpsideReactionLevel(
  level: SupportResistanceLevel,
  currentPrice: number | null,
  overlayMode: ReactionOverlayMode,
): boolean {
  if (level.kind !== "resistance") return false;
  if (overlayMode === "oi_holding" && level.exposureSide === "bear") return true;
  return currentPrice == null || level.price > currentPrice;
}

function levelReadFor(level: SupportResistanceLevel, side: "downside" | "upside"): LevelRead {
  const isUpside = side === "upside";
  if (level.leverageBucket === "positioning") {
    const likelyLong = level.flowSide === "forced_sell";
    return {
      label: "Pivot",
      summary: likelyLong
        ? "Top inferred long holding. It can defend on retest, but a clean break can turn into sell pressure."
        : "Top inferred short holding. It can reject on retest, but a clean hold above can turn into buy pressure.",
      reason: "Ranked from public trade concentration allocated against positive OI change. This is not exact trader-position data.",
      className: "border-sky-400/35 bg-sky-400/10 text-sky-200",
    };
  }
  if (isStressZone(level)) {
    return {
      label: "Stress",
      summary: isUpside
        ? "Likely buy-stress above price from tracked shorts or squeeze pressure."
        : "Likely sell-stress below price from tracked longs or crowding pressure.",
      reason: "This is an inferred stress pocket from public streams and tracked samples, not a complete exchange-wide position map.",
      className: "border-zinc-600 bg-zinc-800/70 text-zinc-300",
    };
  }

  const impact = level.depthAdjustedImpact;
  const score = level.lfxScore ?? level.pressureScore ?? level.strength;
  const thinBook = impact != null && impact >= 6;
  const deepBook = impact != null && impact < 6;
  const closeToMark = Math.abs(level.distancePct ?? Infinity) <= 1.2;

  if (level.zoneType === "magnet" || closeToMark) {
    const reason = "Price is close enough that confirmation matters more than the raw score.";
    return {
      label: "Pivot",
      summary: isUpside
        ? "Likely decision zone. It can reject here or turn into continuation if price accepts above."
        : "Likely decision zone. It can bounce here or turn into continuation if price accepts below.",
      reason,
      className: "border-amber-400/35 bg-amber-400/10 text-amber-200",
    };
  }

  if (level.zoneType === "upside_squeeze" || level.zoneType === "downside_cascade" || (thinBook && score >= 38)) {
    return {
      label: "Break",
      summary: isUpside
        ? "Likely upside continuation if buyers hold above this concentration."
        : "Likely downside continuation if sellers hold below this concentration.",
      reason: isUpside ? "Asks look thin against nearby inferred buy pressure." : "Bids look thin against nearby inferred sell pressure.",
      className: "border-sky-400/35 bg-sky-400/10 text-sky-200",
    };
  }

  if (level.zoneType === "absorption_resistance" || level.zoneType === "absorption_support" || (deepBook && score >= 28)) {
    return {
      label: "Rejection",
      summary: isUpside
        ? "Likely upside rejection. Buyers need a clean hold above before trusting the break."
        : "Likely downside rejection. Sellers need a clean hold below before trusting the break.",
      reason: isUpside ? "Asks look deep enough to absorb the first push." : "Bids look deep enough to absorb the first push.",
      className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    };
  }

  return {
    label: "Pivot",
    summary: "Likely two-way zone. Wait for either a clean rejection or a clean hold through the level.",
    reason: "The level is active, but the strength read is not one-sided yet.",
    className: "border-amber-400/35 bg-amber-400/10 text-amber-200",
  };
}

function formatCompactUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "n/a";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function levelVisualStrength(level: SupportResistanceLevel, index: number): number {
  const score = level.lfxScore ?? level.pressureScore ?? level.strength;
  const scoreTerm = clamp(score / 85, 0.08, 1);
  const rankTerm =
    level.flowRank != null
      ? clamp(1 - (level.flowRank - 1) * 0.16, 0.46, 1)
      : clamp(1 - index * 0.12, 0.5, 1);
  const impactTerm =
    level.depthAdjustedImpact == null ? 0.72 : clamp(Math.log10(level.depthAdjustedImpact + 1) / 1.1, 0.45, 1);
  const sourceTerm = isStressZone(level) ? 0.78 : level.leverageBucket === "book" ? 0.9 : 1;

  return clamp(scoreTerm * 0.48 + rankTerm * 0.3 + impactTerm * 0.22, 0.22, 1) * sourceTerm;
}

function levelLineWidth(level: SupportResistanceLevel, index: number): 1 | 2 | 3 | 4 {
  const strength = levelVisualStrength(level, index);
  if (strength >= 0.82) return 4;
  if (strength >= 0.62) return 3;
  if (strength >= 0.4) return 2;
  return 1;
}

function levelAlpha(level: SupportResistanceLevel, index: number): number {
  const strength = levelVisualStrength(level, index);
  return Number(clamp(0.2 + strength * 0.72, 0.28, 0.96).toFixed(3));
}

function reactionDisplayPriority(level: SupportResistanceLevel): number {
  const score = level.lfxScore ?? level.pressureScore ?? level.strength;
  const distance = Math.abs(level.distancePct ?? 0);
  const distanceBonus = clamp(distance / 4, 0, 1) * 18;
  const sourceBonus =
    level.leverageBucket === "stress"
      ? 10
      : level.leverageBucket === "mixed"
        ? 8
        : level.leverageBucket === "positioning"
          ? 14
          : 0;
  return score + distanceBonus + sourceBonus;
}

function selectVisibleReactionLevels(levels: SupportResistanceLevel[], limit = 4): SupportResistanceLevel[] {
  return [...levels]
    .sort((a, b) => reactionDisplayPriority(b) - reactionDisplayPriority(a))
    .slice(0, limit)
    .sort((a, b) => a.price - b.price);
}

type ChartZoneBand = {
  id: string;
  level: SupportResistanceLevel;
  side: "downside" | "upside";
  top: number;
  height: number;
  centerY: number;
  alpha: number;
};

export default function PriceChart({
  coin,
  marketType = "perp",
  compact = false,
  fundingAPR = null,
  fundingPercentile = null,
}: PriceChartProps) {
  const chartFrameRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<CandleDatum[]>([]);
  const [interval, setInterval] = useState<TradingInterval>(DEFAULT_INTERVAL);
  const [zoneBands, setZoneBands] = useState<ChartZoneBand[]>([]);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  const currentPrice = candles.at(-1)?.close ?? null;
  const levels = useMemo(
    () => calculateSupportResistanceLevels(candles, API_INTERVAL[interval]).filter((level) => level.status !== "expired" && level.status !== "broken"),
    [candles, interval],
  );
  const lastCandleTimeMs = candles.at(-1)?.time ? normalizeTime(candles.at(-1)!.time) : null;
  const dataThroughTimeMs = lastCandleTimeMs != null ? lastCandleTimeMs + INTERVAL_MS[interval] : null;
  const taGuide = useMemo(
    () => buildTaGuide({ candles, levels, fundingAPR, fundingPercentile }),
    [candles, fundingAPR, fundingPercentile, levels],
  );
  const visibleDownsideFlows = useMemo(
    () =>
      selectVisibleReactionLevels(
        levels.filter((level) => isDownsideReactionLevel(level, currentPrice, "all")),
        4,
      ),
    [currentPrice, levels],
  );
  const visibleUpsideFlows = useMemo(
    () =>
      selectVisibleReactionLevels(
        levels.filter((level) => isUpsideReactionLevel(level, currentPrice, "all")),
        4,
      ),
    [currentPrice, levels],
  );
  const activeZoneId = hoveredZoneId ?? selectedZoneId;
  const activeZoneBand = useMemo(
    () => zoneBands.find((band) => band.id === activeZoneId) ?? zoneBands[0] ?? null,
    [activeZoneId, zoneBands],
  );

  useEffect(() => {
    if (selectedZoneId && !zoneBands.some((band) => band.id === selectedZoneId)) {
      setSelectedZoneId(null);
    }
  }, [selectedZoneId, zoneBands]);

  useEffect(() => {
    let cancelled = false;

    async function fetchCandles() {
      setLoading(true);
      setError(null);
      try {
        const now = Date.now();
        const startTime = now - LOOKBACK_MS[interval];
        const response = await fetch(
          withNetworkParam(
            `/api/market/candles?coin=${encodeURIComponent(coin)}&marketType=${marketType}&interval=${API_INTERVAL[interval]}&startTime=${startTime}&endTime=${now}`,
          ),
        );
        if (!response.ok) throw new Error("Unable to fetch price candles.");
        const rawCandles = (await response.json()) as Array<Record<string, string | number>>;
        const nextCandles = rawCandles
          .map((candle) => ({
            time: Number(candle.t ?? candle.T ?? candle.time),
            open: Number(candle.o ?? candle.open),
            high: Number(candle.h ?? candle.high),
            low: Number(candle.l ?? candle.low),
            close: Number(candle.c ?? candle.close),
            volume: Number(candle.v ?? candle.vlm ?? 0),
          }))
          .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
          .sort((a, b) => normalizeTime(a.time) - normalizeTime(b.time));
        if (!cancelled) setCandles(nextCandles);
      } catch (err) {
        if (!cancelled) {
          setCandles([]);
          setError(err instanceof Error ? err.message : "Unable to fetch price candles.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCandles();
    return () => {
      cancelled = true;
    };
  }, [coin, interval, marketType]);

  useEffect(() => {
    const container = chartContainerRef.current;
    const data = toCandlestickData(candles);
    if (!container || data.length === 0) return;
    const precision = pricePrecision(candles.at(-1)?.close);

    const chart = createChart(container, {
      autoSize: true,
      localization: {
        priceFormatter: chartPriceFormatter,
        timeFormatter: (time: unknown) =>
          formatEasternChartTick(time, interval === "D" ? "date" : "datetime"),
      },
      layout: {
        background: { type: ColorType.Solid, color: "#090b10" },
        textColor: "#a1a1aa",
        panes: { separatorColor: "#18181b" },
      },
      grid: {
        vertLines: { color: "rgba(63, 63, 70, 0.22)" },
        horzLines: { color: "rgba(63, 63, 70, 0.22)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#71717a", labelBackgroundColor: "#18181b" },
        horzLine: { color: "#71717a", labelBackgroundColor: "#18181b" },
      },
      rightPriceScale: {
        borderColor: "#27272a",
        textColor: "#d4d4d8",
        scaleMargins: { top: 0.08, bottom: 0.12 },
      },
      timeScale: {
        borderColor: "#27272a",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        tickMarkFormatter: (time: unknown) =>
          formatEasternChartTick(time, interval === "D" ? "date" : "time"),
      },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#14b8a6",
      downColor: "#ef4444",
      borderUpColor: "#2dd4bf",
      borderDownColor: "#fb7185",
      wickUpColor: "#5eead4",
      wickDownColor: "#fb7185",
      priceLineColor: "#f4f4f5",
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dashed,
      priceFormat: {
        type: "price",
        precision,
        minMove: minMoveForPrecision(precision),
      },
    });

    candleSeries.setData(data);

    const movingAverageLines = [
      { label: "EMA 9", points: taGuide.movingAverages.ema9, color: "#2dd4bf", width: 1 },
      { label: "EMA 21", points: taGuide.movingAverages.ema21, color: "#38bdf8", width: 1 },
      { label: "SMA 50", points: taGuide.movingAverages.sma50, color: "#f59e0b", width: 2 },
      { label: "SMA 200", points: taGuide.movingAverages.sma200, color: "#a78bfa", width: 2 },
    ] as const;

    movingAverageLines.forEach((line) => {
      const lineData = toLineData(line.points);
      if (lineData.length < 2) return;
      const series = chart.addSeries(LineSeries, {
        color: line.color,
        lineWidth: line.width,
        lastValueVisible: false,
        priceLineVisible: false,
        title: line.label,
      });
      series.setData(lineData);
    });

    const renderLevel = (level: SupportResistanceLevel, index: number, side: "downside" | "upside") => {
      const alpha = levelAlpha(level, index);
      const color = side === "downside" ? `rgba(20, 184, 166, ${alpha})` : `rgba(244, 63, 94, ${alpha})`;
      const edgeColor =
        side === "downside" ? `rgba(20, 184, 166, ${Math.max(0.18, alpha * 0.34)})` : `rgba(244, 63, 94, ${Math.max(0.18, alpha * 0.34)})`;
      const lineWidth = levelLineWidth(level, index);

      candleSeries.createPriceLine({
        price: level.price,
        color,
        lineWidth,
        lineStyle: lineWidth >= 3 ? LineStyle.Solid : lineWidth === 2 ? LineStyle.Dashed : LineStyle.Dotted,
        axisLabelVisible: true,
        title: side === "downside" ? "Support" : "Resistance",
      });

      if (level.zoneLow != null && level.zoneHigh != null) {
        [level.zoneLow, level.zoneHigh].forEach((price) => {
          candleSeries.createPriceLine({
            price,
            color: edgeColor,
            lineWidth: lineWidth >= 3 ? 2 : 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: "",
          });
        });
      }
    };
    let zoneFrame: number | null = null;
    const renderZoneBands = () => {
      const nextBands: ChartZoneBand[] = [];

      [
        ...visibleDownsideFlows.map((level, index) => ({ level, index, side: "downside" as const })),
        ...visibleUpsideFlows.map((level, index) => ({ level, index, side: "upside" as const })),
      ].forEach(({ level, index, side }) => {
        const low = level.zoneLow ?? level.price;
        const high = level.zoneHigh ?? level.price;
        const yLow = candleSeries.priceToCoordinate(low);
        const yHigh = candleSeries.priceToCoordinate(high);
        const yCenter = candleSeries.priceToCoordinate(level.price);
        if (yLow == null || yHigh == null || yCenter == null) return;

        const alpha = levelAlpha(level, index);
        const top = Math.min(yLow, yHigh);
        const height = Math.max(4, Math.abs(yLow - yHigh));

        nextBands.push({
          id: level.id,
          level,
          side,
          top,
          height,
          centerY: yCenter,
          alpha,
        });
      });
      setZoneBands(nextBands);
    };
    const scheduleZoneBandRender = () => {
      if (zoneFrame != null) window.cancelAnimationFrame(zoneFrame);
      zoneFrame = window.requestAnimationFrame(() => {
        zoneFrame = null;
        renderZoneBands();
      });
    };
    visibleDownsideFlows.forEach((level, index) => renderLevel(level, index, "downside"));
    visibleUpsideFlows.forEach((level, index) => renderLevel(level, index, "upside"));

    chart.timeScale().fitContent();
    renderZoneBands();
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
      scheduleZoneBandRender();
    });
    resizeObserver.observe(container);
    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleZoneBandRender);
    chart.timeScale().subscribeVisibleTimeRangeChange(scheduleZoneBandRender);
    chart.subscribeCrosshairMove(scheduleZoneBandRender);
    container.addEventListener("wheel", scheduleZoneBandRender, { passive: true });
    container.addEventListener("pointermove", scheduleZoneBandRender);
    container.addEventListener("pointerup", scheduleZoneBandRender);

    return () => {
      resizeObserver.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleZoneBandRender);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(scheduleZoneBandRender);
      chart.unsubscribeCrosshairMove(scheduleZoneBandRender);
      container.removeEventListener("wheel", scheduleZoneBandRender);
      container.removeEventListener("pointermove", scheduleZoneBandRender);
      container.removeEventListener("pointerup", scheduleZoneBandRender);
      if (zoneFrame != null) window.cancelAnimationFrame(zoneFrame);
      setZoneBands([]);
      setHoveredZoneId(null);
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, currentPrice, interval, taGuide.movingAverages, visibleDownsideFlows, visibleUpsideFlows]);

  const levelSourceNote =
    dataThroughTimeMs != null
      ? `TA Guide - candles through ${formatTimeMs(dataThroughTimeMs)}`
      : "TA Guide";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0d1016]">
      <div className="shrink-0 border-b border-zinc-800 px-3 py-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionEyebrow>{marketType === "spot" ? "RWA TA guide" : "TA Guide"}</SectionEyebrow>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <div className={compact ? "font-mono text-base font-semibold text-zinc-100" : "font-mono text-lg font-semibold text-zinc-100"}>{coin}</div>
              <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                {API_INTERVAL[interval]} candles
              </div>
              <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                EMA 9/21 · SMA 50/200
              </div>
              {currentPrice != null && (
                <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                  {formatLevelPrice(currentPrice)}
                </div>
              )}
            </div>
            <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-5">
              <GuideMetric label="Trend" value={taGuide.trendLabel} detail={taGuide.trendDetail} tone={taGuide.tone === "red" ? "danger" : taGuide.tone === "green" ? "success" : "neutral"} />
              <GuideMetric label="Support" value={formatLevelPrice(taGuide.nearestSupport?.price)} tone="success" />
              <GuideMetric label="Resistance" value={formatLevelPrice(taGuide.nearestResistance?.price)} tone="danger" />
              <GuideMetric label="Next trim" value={taGuide.nextResistance ? formatLevelPrice(taGuide.nextResistance.price) : formatLevelPrice(taGuide.nearestResistance?.price)} tone="danger" />
              <GuideMetric label="Invalidation" value={taGuide.invalidationText.replace(/^Invalidate /, "").replace(/\.$/, "")} />
            </div>
          </div>
          <div className="flex flex-wrap justify-start gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500 lg:justify-end">
            <div className="flex rounded-full border border-zinc-800 bg-zinc-950/70 p-0.5 tracking-normal">
              {INTERVAL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setInterval(option.value)}
                  className={`rounded-full px-2 py-0.5 transition ${
                    interval === option.value
                      ? "bg-emerald-500/15 text-emerald-200"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-3">
        <div
          ref={chartFrameRef}
          className="relative h-[360px] overflow-hidden overscroll-contain rounded-[18px] border border-zinc-800 bg-zinc-950 md:h-[430px] xl:h-[460px]"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
              Loading chart...
            </div>
          ) : error || candles.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
              {error ?? "No price candles available."}
            </div>
          ) : (
            <>
              <div ref={chartContainerRef} className="absolute inset-0" />
              <FlowZoneOverlay
                bands={zoneBands}
                activeZoneId={activeZoneId}
                onHover={setHoveredZoneId}
                onSelect={setSelectedZoneId}
              />
            </>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] leading-5 text-zinc-500">
          <span>{levelSourceNote}</span>
          {taGuide.movingAverages.latest.sma200 == null ? (
            <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-zinc-500">SMA 200 warming up</span>
          ) : null}
        </div>
        <ZoneDetailPanel
          bands={zoneBands}
          activeBand={activeZoneBand}
          currentPrice={currentPrice}
          onHover={setHoveredZoneId}
          onSelect={setSelectedZoneId}
        />
      </div>

      {!loading && !error && candles.length > 0 ? (
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-950/70 px-3 py-3">
          <div className="grid gap-2 text-xs xl:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <SectionEyebrow>TA Guide</SectionEyebrow>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em] ${
                    taGuide.tone === "green"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : taGuide.tone === "red"
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                        : taGuide.tone === "amber"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                          : "border-zinc-700 bg-zinc-900 text-zinc-400"
                  }`}
                >
                  {taGuide.confidence} confidence
                </span>
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">{taGuide.biasLabel}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {taGuide.why.slice(0, 2).map((item) => (
                  <span key={item} className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-400">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <PlanBox label="Entry condition" value={taGuide.entryCondition} />
              <PlanBox label="Trim / sell" value={taGuide.trimText} tone={taGuide.tone === "red" ? "neutral" : "danger"} />
              <PlanBox label="Invalidation" value={taGuide.invalidationText} tone="danger" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ZoneDetailPanel({
  bands,
  activeBand,
  currentPrice,
  onHover,
  onSelect,
}: {
  bands: ChartZoneBand[];
  activeBand: ChartZoneBand | null;
  currentPrice: number | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const rows = [...bands].sort((a, b) => Math.abs(a.level.distancePct ?? 0) - Math.abs(b.level.distancePct ?? 0)).slice(0, 6);

  if (rows.length === 0) {
    return (
      <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950/55 px-4 py-3 text-xs text-zinc-500">
        Reaction zones are still warming up for this asset.
      </div>
    );
  }

  const selected = activeBand ?? rows[0];
  const flowSize = selected.level.zoneTooltip?.inferredOiUsd ?? selected.level.zoneTooltip?.totalRecentFlowUsd ?? selected.level.notionalUsd;

  return (
    <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950/65 p-3">
      <div className="grid gap-2 text-xs md:grid-cols-[1fr_1fr_0.75fr_0.75fr_1.5fr]">
        <ZoneMetric label="Role" value={zoneRoleLabel(selected)} tone={selected.side === "downside" ? "success" : "danger"} />
        <ZoneMetric label="Range" value={formatLevelRange(selected.level)} />
        <ZoneMetric label="Distance" value={formatSignedPct(selected.level.distancePct ?? distanceFromCurrent(selected.level.price, currentPrice))} />
        <ZoneMetric label="Flow/OI" value={formatCompactUsd(flowSize)} />
        <ZoneMetric label="Trader read" value={shortTraderRead(selected.level, selected.side)} />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-[11px]">
          <thead className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
            <tr>
              <th className="px-2 py-2 font-medium">Role</th>
              <th className="px-2 py-2 font-medium">Range</th>
              <th className="px-2 py-2 font-medium">Distance</th>
              <th className="px-2 py-2 font-medium">Size</th>
              <th className="px-2 py-2 font-medium">Read</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {rows.map((band) => {
              const active = band.id === selected.id;
              const rowRead = levelReadFor(band.level, band.side);
              const size = band.level.zoneTooltip?.inferredOiUsd ?? band.level.zoneTooltip?.totalRecentFlowUsd ?? band.level.notionalUsd;
              return (
                <tr
                  key={band.id}
                  className={`cursor-pointer transition ${active ? "bg-zinc-900/80 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200"}`}
                  onMouseEnter={() => onHover(band.id)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onSelect(band.id)}
                >
                  <td className={`whitespace-nowrap px-2 py-2 font-medium ${band.side === "downside" ? "text-teal-300" : "text-rose-300"}`}>{zoneRoleLabel(band)}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono">{formatLevelRange(band.level)}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono">{formatSignedPct(band.level.distancePct ?? distanceFromCurrent(band.level.price, currentPrice))}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono">{formatCompactUsd(size)}</td>
                  <td className="min-w-[220px] px-2 py-2 text-zinc-400">{shortTraderRead(band.level, band.side) || rowRead.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[10px] leading-4 text-zinc-600">Click a zone row to pin it. Hovering highlights the matching band on the chart.</div>
    </div>
  );
}

function ZoneMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "danger" }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</div>
      <div className={`mt-1 truncate font-mono text-xs ${tone === "success" ? "text-teal-300" : tone === "danger" ? "text-rose-300" : "text-zinc-200"}`}>{value}</div>
    </div>
  );
}

function GuideMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/65 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div
        className={`mt-1 truncate font-mono text-xs ${
          tone === "success" ? "text-emerald-300" : tone === "danger" ? "text-rose-300" : "text-zinc-200"
        }`}
      >
        {value}
      </div>
      {detail ? <div className="mt-0.5 truncate text-[10px] text-zinc-600">{detail}</div> : null}
    </div>
  );
}

function zoneRoleLabel(band: ChartZoneBand): string {
  if (band.side === "downside") return "Downside support";
  return "Upside resistance";
}

function distanceFromCurrent(price: number, currentPrice: number | null): number | null {
  if (currentPrice == null || currentPrice <= 0 || price <= 0) return null;
  return ((price - currentPrice) / currentPrice) * 100;
}

function formatSignedPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${abs.toFixed(abs < 1 ? 2 : 1)}%`;
}

function shortTraderRead(level: SupportResistanceLevel, side: "downside" | "upside"): string {
  if (side === "downside") {
    if (level.exposureSide === "bull") return "Support/long-risk zone; reclaim can fuel bounce.";
    return "Downside liquidity; fail below can extend lower.";
  }
  if (level.exposureSide === "bear") return "Resistance/short-risk zone; clean hold can squeeze.";
  return "Upside liquidity; rejection can mark take-profit.";
}

function FlowZoneOverlay({
  bands,
  activeZoneId,
  onHover,
  onSelect,
}: {
  bands: ChartZoneBand[];
  activeZoneId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {bands.map((band) => {
        const isDownside = band.side === "downside";
        const read = levelReadFor(band.level, band.side);
        const color = isDownside ? "20, 184, 166" : "244, 63, 94";
        const textColor = isDownside ? "text-teal-200" : "text-rose-200";
        const borderColor = isDownside ? "border-teal-400/35" : "border-rose-400/35";
        const idleBandAlpha = band.alpha * 0.045;
        const idleBorderAlpha = band.alpha * 0.24;
        const active = activeZoneId === band.id;

        return (
          <div key={band.id}>
            <button
              type="button"
              className={`pointer-events-auto absolute left-0 right-[58px] cursor-crosshair border-y border-transparent bg-transparent transition focus:outline-none focus:ring-1 focus:ring-white/40 ${
                active ? "shadow-[0_0_22px_rgba(255,255,255,0.10)]" : ""
              }`}
              style={{
                top: band.top,
                height: band.height,
                backgroundColor: active
                  ? `rgba(${color}, ${Math.max(0.09, band.alpha * 0.10)})`
                  : `rgba(${color}, ${idleBandAlpha})`,
                borderTopColor: active ? `rgba(${color}, 0.62)` : `rgba(${color}, ${idleBorderAlpha})`,
                borderBottomColor: active ? `rgba(${color}, 0.62)` : `rgba(${color}, ${idleBorderAlpha})`,
              }}
              aria-label={`${formatLevelRange(band.level)} ${read.label} ${band.level.label}`}
              onClick={() => onSelect(band.id)}
              onMouseEnter={() => onHover(band.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(band.id)}
              onBlur={() => onHover(null)}
            />

            <button
              type="button"
              className={`pointer-events-auto absolute right-2 max-w-[calc(100%_-_1rem)] cursor-crosshair truncate rounded-full border bg-zinc-950/80 px-2 py-0.5 text-[10px] leading-4 backdrop-blur-md focus:outline-none focus:ring-1 focus:ring-white/40 sm:right-16 sm:max-w-[112px] ${borderColor} ${textColor}`}
              style={{
                top: Math.max(8, band.centerY - 10),
                backgroundColor: `rgba(9, 9, 11, ${Math.max(0.74, 0.94 - band.alpha * 0.14)})`,
                borderColor: `rgba(${color}, ${Math.max(0.24, band.alpha * 0.58)})`,
                boxShadow: active ? `0 0 ${Math.round(10 + band.alpha * 14)}px rgba(${color}, ${band.alpha * 0.14})` : "none",
                opacity: active ? 1 : Math.max(0.5, band.alpha * 0.86),
              }}
              onMouseEnter={() => onHover(band.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(band.id)}
              onBlur={() => onHover(null)}
              onClick={() => onSelect(band.id)}
            >
              {formatLevelPrice(band.level.price)}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function PlanBox({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div
        className={`mt-1 leading-5 ${
          tone === "success" ? "text-emerald-300" : tone === "danger" ? "text-rose-300" : "text-zinc-300"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
