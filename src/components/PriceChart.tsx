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
import { withNetworkParam } from "@/lib/hyperliquid";
import {
  buildLocalProjectedLfxLevels,
  isLfxMajorCoin,
  pressureLevelsToSupportResistanceLevels,
} from "@/lib/pressureLevels";
import { buildTradePlan } from "@/lib/tradePlan";
import { SectionEyebrow } from "@/components/trading-ui";
import type { PressurePayload, SupportResistanceLevel } from "@/types";

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

function averageTrueRangePct(candles: CandleDatum[], length = 14): number | null {
  const scoped = candles.slice(-length);
  const lastClose = scoped.at(-1)?.close;
  if (scoped.length === 0 || lastClose == null || lastClose <= 0) return null;

  const atr =
    scoped.reduce((sum, candle, index) => {
      const previousClose = index === 0 ? candle.close : scoped[index - 1].close;
      const trueRange = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose),
      );
      return sum + Math.max(trueRange, 0);
    }, 0) / scoped.length;

  return atr > 0 ? Number(((atr / lastClose) * 100).toFixed(4)) : null;
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
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(timeMs));
}

function confidenceClass(confidence: "low" | "medium" | "high" | undefined): string {
  if (confidence === "high") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (confidence === "medium") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-zinc-700 bg-zinc-900 text-zinc-400";
}

function formatCompactUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "n/a";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function riskCopy(level: SupportResistanceLevel): string {
  return level.flowSide === "forced_sell" ? "sell-risk" : "buy-risk";
}

function flowSummary(level: SupportResistanceLevel): string {
  if (level.pressureSource === "estimated_leverage") {
    return `Near mark / ${formatCompactUsd(level.notionalUsd)} ${riskCopy(level)} / LFX ${
      level.lfxScore ?? level.pressureScore ?? "n/a"
    }`;
  }

  const rank =
    level.flowRank != null && level.flowRank <= 2
      ? `Top #${level.flowRank}`
      : (level.flowRelative ?? 0) >= 1.15
        ? "Above avg"
        : "Market flow";
  return `${rank} / ${formatCompactUsd(level.notionalUsd)} ${riskCopy(level)} / LFX ${level.lfxScore ?? level.pressureScore ?? "n/a"}`;
}

function nearestLower(levels: SupportResistanceLevel[], price: number): SupportResistanceLevel | null {
  return levels.filter((level) => level.price < price).sort((a, b) => b.price - a.price)[0] ?? null;
}

function nearestHigher(levels: SupportResistanceLevel[], price: number): SupportResistanceLevel | null {
  return levels.filter((level) => level.price > price).sort((a, b) => a.price - b.price)[0] ?? null;
}

function describeFlowPath(
  level: SupportResistanceLevel,
  sameSideLevels: SupportResistanceLevel[],
  oppositeLevels: SupportResistanceLevel[],
): string {
  if (level.kind === "support") {
    const holdTarget = nearestHigher(oppositeLevels, level.price);
    const failTarget = nearestLower(sameSideLevels, level.price);
    return `Hold -> ${holdTarget ? formatLevelRange(holdTarget) : "next upside flow"}; fail -> ${
      failTarget ? formatLevelRange(failTarget) : "lower flow"
    }`;
  }

  const clearTarget = nearestHigher(sameSideLevels, level.price);
  const rejectTarget = nearestLower(oppositeLevels, level.price);
  return `Clear -> ${clearTarget ? formatLevelRange(clearTarget) : "higher flow"}; reject -> ${
    rejectTarget ? formatLevelRange(rejectTarget) : "nearest downside flow"
  }`;
}

function evidenceToneClass(text: string): string {
  const normalized = text.toLowerCase();
  if (normalized.includes("thin") || normalized.includes("sell-risk") || normalized.includes("buy-risk")) {
    return "border-amber-500/25 bg-amber-500/10 text-amber-200";
  }
  if (
    normalized.includes("top #") ||
    normalized.includes("above-average") ||
    normalized.includes("high leverage") ||
    normalized.includes("near current") ||
    normalized.includes("projected")
  ) {
    return "border-sky-500/25 bg-sky-500/10 text-sky-200";
  }
  if (normalized.includes("high reach") || normalized.includes("deep")) {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  }
  return "border-zinc-800 bg-zinc-950 text-zinc-500";
}

function levelLineWidth(level: SupportResistanceLevel, index: number): 1 | 2 | 3 {
  const score = level.lfxScore ?? level.pressureScore ?? level.strength;
  if (score >= 70 || index === 0) return 3;
  if (score >= 38) return 2;
  return 1;
}

function levelAlpha(level: SupportResistanceLevel, index: number): number {
  const score = level.lfxScore ?? level.pressureScore ?? level.strength;
  return Math.min(0.95, Math.max(index === 0 ? 0.72 : 0.35, 0.3 + score / 125));
}

function chartTagForLevel(level: SupportResistanceLevel, side: "downside" | "upside"): string {
  if (level.pressureSource === "estimated_leverage") return `near ${side === "downside" ? "sell" : "buy"} flow`;
  if (level.flowRank != null) return `#${level.flowRank} ${side === "downside" ? "sell" : "buy"} flow`;
  return level.label;
}

type ChartZoneBand = {
  id: string;
  level: SupportResistanceLevel;
  side: "downside" | "upside";
  top: number;
  height: number;
  centerY: number;
  arrowTop: number | null;
  arrowHeight: number | null;
  arrowDirection: "up" | "down" | null;
  arrowRight: number;
  alpha: number;
};

export default function PriceChart({
  coin,
  marketType = "perp",
  compact = false,
  fundingAPR = null,
  fundingPercentile = null,
}: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<CandleDatum[]>([]);
  const [pressurePayload, setPressurePayload] = useState<PressurePayload | null>(null);
  const [pressureUnavailable, setPressureUnavailable] = useState(false);
  const [interval, setInterval] = useState<TradingInterval>(DEFAULT_INTERVAL);
  const [zoneBands, setZoneBands] = useState<ChartZoneBand[]>([]);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);

  const atrPct = useMemo(() => averageTrueRangePct(candles), [candles]);
  const lfxSupported = marketType === "perp" && isLfxMajorCoin(coin);
  const currentPrice = pressurePayload?.currentPrice ?? candles.at(-1)?.close ?? null;
  const chartPressureLevels = useMemo(() => {
    if (!lfxSupported || currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return [];
    const baseLevels = pressurePayload?.levels ?? [];
    const localLevels = buildLocalProjectedLfxLevels({
      coin,
      currentPrice,
      candles,
      fundingAPR: pressurePayload?.market.fundingAPR ?? null,
      openInterestUsd: pressurePayload?.market.openInterestUsd ?? null,
      maxLeverage: pressurePayload?.market.maxLeverage ?? null,
      topBookImbalancePct: pressurePayload?.market.topBookImbalancePct ?? null,
      atrPct,
      maxLevels: 4,
    });
    return [...baseLevels, ...localLevels];
  }, [atrPct, candles, coin, currentPrice, lfxSupported, pressurePayload]);
  const levels = useMemo(
    () =>
      lfxSupported
        ? pressureLevelsToSupportResistanceLevels({
            levels: chartPressureLevels,
            currentPrice,
            maxPerSide: 4,
          })
        : [],
    [chartPressureLevels, currentPrice, lfxSupported],
  );
  const lastCandleTimeMs = candles.at(-1)?.time ? normalizeTime(candles.at(-1)!.time) : null;
  const dataThroughTimeMs = lastCandleTimeMs != null ? lastCandleTimeMs + INTERVAL_MS[interval] : null;
  const latestLevelTimeMs = pressurePayload?.updatedAt ?? null;
  const tradePlan = useMemo(
    () =>
      buildTradePlan({
        candles,
        interval: API_INTERVAL[interval],
        levels,
        fundingAPR,
        fundingPercentile,
      }),
    [candles, fundingAPR, fundingPercentile, interval, levels],
  );
  const visibleDownsideFlows = useMemo(
    () =>
      levels
        .filter((level) => level.kind === "support" && (currentPrice == null || level.price < currentPrice))
        .sort((a, b) =>
          currentPrice == null ? b.price - a.price : Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice),
        )
        .slice(0, 4),
    [currentPrice, levels],
  );
  const visibleUpsideFlows = useMemo(
    () =>
      levels
        .filter((level) => level.kind === "resistance" && (currentPrice == null || level.price > currentPrice))
        .sort((a, b) =>
          currentPrice == null ? a.price - b.price : Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice),
        )
        .slice(0, 4),
    [currentPrice, levels],
  );

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
    let cancelled = false;

    async function fetchPressureLevels() {
      setPressureUnavailable(false);
      setPressurePayload(null);

      if (!lfxSupported) {
        setPressureUnavailable(marketType === "perp");
        return;
      }

      try {
        const params = new URLSearchParams({ coin });
        if (atrPct != null) params.set("atrPct", String(atrPct));
        const response = await fetch(withNetworkParam(`/api/market/pressure?${params.toString()}`));
        if (!response.ok) throw new Error("Unable to fetch LFX map.");
        const payload = (await response.json()) as PressurePayload;
        if (!cancelled) setPressurePayload(payload);
      } catch {
        if (!cancelled) {
          setPressurePayload(null);
          setPressureUnavailable(true);
        }
      }
    }

    fetchPressureLevels();
    return () => {
      cancelled = true;
    };
  }, [atrPct, coin, lfxSupported, marketType]);

  useEffect(() => {
    const container = chartContainerRef.current;
    const data = toCandlestickData(candles);
    if (!container || data.length === 0) return;
    const precision = pricePrecision(candles.at(-1)?.close);

    const chart = createChart(container, {
      autoSize: true,
      localization: {
        priceFormatter: chartPriceFormatter,
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

    const renderLevel = (level: SupportResistanceLevel, index: number, side: "downside" | "upside") => {
      const alpha = levelAlpha(level, index);
      const color = side === "downside" ? `rgba(20, 184, 166, ${alpha})` : `rgba(244, 63, 94, ${alpha})`;
      const edgeColor =
        side === "downside" ? `rgba(20, 184, 166, ${Math.max(0.28, alpha * 0.45)})` : `rgba(244, 63, 94, ${Math.max(0.28, alpha * 0.45)})`;
      const lineWidth = levelLineWidth(level, index);

      candleSeries.createPriceLine({
        price: level.price,
        color,
        lineWidth,
        lineStyle: lineWidth >= 3 ? LineStyle.Solid : lineWidth === 2 ? LineStyle.Dashed : LineStyle.Dotted,
        axisLabelVisible: false,
        title: "",
      });

      if (level.zoneLow != null && level.zoneHigh != null) {
        [level.zoneLow, level.zoneHigh].forEach((price) => {
          candleSeries.createPriceLine({
            price,
            color: edgeColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: "",
          });
        });
      }
    };
    let zoneFrame: number | null = null;
    const renderZoneBands = () => {
      const currentY = currentPrice != null ? candleSeries.priceToCoordinate(currentPrice) : null;
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
        const arrowHeight = currentY == null ? null : Math.max(18, Math.abs(yCenter - currentY));
        const arrowTop = currentY == null ? null : Math.min(yCenter, currentY);
        const arrowDirection = currentY == null ? null : yCenter < currentY ? "up" : "down";

        nextBands.push({
          id: level.id,
          level,
          side,
          top,
          height,
          centerY: yCenter,
          arrowTop,
          arrowHeight,
          arrowDirection,
          arrowRight: side === "upside" ? 172 + index * 18 : 104 + index * 18,
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
  }, [candles, currentPrice, visibleDownsideFlows, visibleUpsideFlows]);

  const levelSourceNote =
    latestLevelTimeMs != null
      ? `Market-inferred LFX - refreshed ${formatTimeMs(latestLevelTimeMs)}`
      : dataThroughTimeMs != null
        ? `Market-inferred LFX - candles through ${formatTimeMs(dataThroughTimeMs)}`
        : "Market-inferred LFX";
  const hasActionablePlan = tradePlan.bias !== "wait";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0d1016]">
      <div className="shrink-0 border-b border-zinc-800 px-3 py-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionEyebrow>{marketType === "spot" ? "RWA chart proxy" : "LFX map"}</SectionEyebrow>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <div className={compact ? "font-mono text-base font-semibold text-zinc-100" : "font-mono text-lg font-semibold text-zinc-100"}>{coin}</div>
              <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                {API_INTERVAL[interval]} candles
              </div>
              {currentPrice != null && (
                <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                  {formatLevelPrice(currentPrice)}
                </div>
              )}
            </div>
            <div className="mt-2 max-w-2xl text-[11px] leading-5 text-zinc-500">
              Market-inferred forced-flow zones. Use as a risk map, not wallet-confirmed triggers.
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
            {marketType === "perp" ? (
              <>
                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-emerald-300">
                  Downside flow
                </span>
                <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-rose-300">
                  Upside flow
                </span>
                <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1">
                  Intensity = LFX
                </span>
                <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1">
                  Market-inferred
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="p-3">
        <div className="relative h-[360px] overflow-hidden rounded-[18px] border border-zinc-800 bg-zinc-950 md:h-[430px] xl:h-[460px]">
          {loading ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
              Loading LFX map...
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
                hoveredZoneId={hoveredZoneId}
                onHover={setHoveredZoneId}
                downsideLevels={visibleDownsideFlows}
                upsideLevels={visibleUpsideFlows}
              />
            </>
          )}
        </div>
        <div className="mt-2 text-[11px] leading-5 text-zinc-500">{levelSourceNote}</div>
      </div>

      {!loading && !error && candles.length > 0 ? (
        <div className="max-h-[300px] shrink-0 overflow-y-auto border-t border-zinc-800 bg-zinc-950/70 px-3 py-3">
          <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2 text-xs text-zinc-500">
            Hover chart bands for flow size, depth, leverage, and path. Near tags are projected from recent entry flow.
          </div>

          <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <SectionEyebrow>Trade plan</SectionEyebrow>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em] ${
                    tradePlan.bias === "long-setup"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : tradePlan.bias === "short-setup"
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400"
                  }`}
                >
                  {tradePlan.confidence} confidence
                </span>
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">{tradePlan.title}</div>
              <div className="mt-1 text-xs leading-5 text-zinc-400">{tradePlan.summary}</div>
            </div>

            <div className="grid gap-2 text-xs md:grid-cols-3">
              <PlanBox label="Confirmation level" value={tradePlan.trigger} />
              <PlanBox
                label="Invalidation"
                value={hasActionablePlan ? tradePlan.invalidation : "Defined after confirmation."}
                tone={hasActionablePlan ? "danger" : "neutral"}
              />
              <PlanBox
                label="Target"
                value={hasActionablePlan && tradePlan.targets.length > 0 ? tradePlan.targets.join(" -> ") : "Appears after confirmation."}
                tone={hasActionablePlan ? "success" : "neutral"}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {tradePlan.context.slice(0, 3).map((item) => (
              <div key={item} className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-500">
                {item}
              </div>
            ))}
            {dataThroughTimeMs != null ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-500">
                Candles through {formatTimeMs(dataThroughTimeMs)}. LFX refreshes from current perp market data.
              </div>
            ) : null}
            {pressureUnavailable || (lfxSupported && levels.length === 0) ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-500">
                {lfxSupported
                  ? "LFX data is temporarily unavailable."
                  : "LFX v1 covers BTC, ETH, SOL, HYPE."}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FlowZoneOverlay({
  bands,
  hoveredZoneId,
  onHover,
  downsideLevels,
  upsideLevels,
}: {
  bands: ChartZoneBand[];
  hoveredZoneId: string | null;
  onHover: (id: string | null) => void;
  downsideLevels: SupportResistanceLevel[];
  upsideLevels: SupportResistanceLevel[];
}) {
  const hoveredBand = bands.find((band) => band.id === hoveredZoneId) ?? null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {bands.map((band) => {
        const isDownside = band.side === "downside";
        const color = isDownside ? "20, 184, 166" : "244, 63, 94";
        const textColor = isDownside ? "text-teal-200" : "text-rose-200";
        const borderColor = isDownside ? "border-teal-400/35" : "border-rose-400/35";
        const active = hoveredZoneId === band.id;

        return (
          <div key={band.id}>
            <button
              type="button"
              className={`pointer-events-auto absolute left-0 right-[58px] cursor-help border-y border-transparent bg-transparent transition focus:outline-none focus:ring-1 focus:ring-white/40 ${
                active ? "shadow-[0_0_28px_rgba(255,255,255,0.12)]" : ""
              }`}
              style={{
                top: band.top,
                height: band.height,
                backgroundColor: active ? `rgba(${color}, ${Math.max(0.1, band.alpha * 0.12)})` : "transparent",
                borderTopColor: active ? `rgba(${color}, 0.65)` : "transparent",
                borderBottomColor: active ? `rgba(${color}, 0.65)` : "transparent",
              }}
              aria-label={`${formatLevelRange(band.level)} ${band.level.label}`}
              onClick={() => onHover(band.id)}
              onMouseEnter={() => onHover(band.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(band.id)}
              onBlur={() => onHover(null)}
            />

            {band.arrowTop != null && band.arrowHeight != null && band.arrowDirection != null ? (
              <div
                className="pointer-events-auto absolute"
                style={{ right: band.arrowRight, top: band.arrowTop, height: band.arrowHeight }}
                onMouseEnter={() => onHover(band.id)}
                onMouseLeave={() => onHover(null)}
              >
                <div
                  className="h-full border-l border-dashed"
                  style={{ borderColor: `rgba(${color}, ${active ? 0.9 : 0.45})` }}
                />
                <div
                  className="absolute left-[-4px]"
                  style={{
                    ...(band.arrowDirection === "up"
                      ? {
                          top: -3,
                          borderLeft: "4px solid transparent",
                          borderRight: "4px solid transparent",
                          borderBottom: `7px solid rgba(${color}, ${active ? 0.95 : 0.62})`,
                        }
                      : {
                          bottom: -3,
                          borderLeft: "4px solid transparent",
                          borderRight: "4px solid transparent",
                          borderTop: `7px solid rgba(${color}, ${active ? 0.95 : 0.62})`,
                        }),
                  }}
                />
              </div>
            ) : null}

            <button
              type="button"
              className={`pointer-events-auto absolute right-16 max-w-[124px] cursor-help truncate rounded-full border bg-zinc-950/80 px-2 py-0.5 text-[10px] leading-4 backdrop-blur-md focus:outline-none focus:ring-1 focus:ring-white/40 ${borderColor} ${textColor}`}
              style={{ top: Math.max(8, band.centerY - 10) }}
              onMouseEnter={() => onHover(band.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(band.id)}
              onBlur={() => onHover(null)}
              onClick={() => onHover(band.id)}
            >
              {chartTagForLevel(band.level, band.side)}
            </button>
          </div>
        );
      })}

      {hoveredBand ? (
        <LevelHoverCard band={hoveredBand} downsideLevels={downsideLevels} upsideLevels={upsideLevels} />
      ) : null}
    </div>
  );
}

function LevelHoverCard({
  band,
  downsideLevels,
  upsideLevels,
}: {
  band: ChartZoneBand;
  downsideLevels: SupportResistanceLevel[];
  upsideLevels: SupportResistanceLevel[];
}) {
  const sameSideLevels = band.side === "downside" ? downsideLevels : upsideLevels;
  const oppositeLevels = band.side === "downside" ? upsideLevels : downsideLevels;
  const path = describeFlowPath(band.level, sameSideLevels, oppositeLevels);
  const isDownside = band.side === "downside";
  const cardTop = Math.max(10, band.centerY - 88);

  return (
    <div
      className={`pointer-events-none absolute right-16 w-[min(340px,calc(100%_-_5rem))] rounded-xl border bg-zinc-950/92 p-3 shadow-2xl backdrop-blur-md ${
        isDownside ? "border-teal-400/30" : "border-rose-400/30"
      }`}
      style={{ top: cardTop }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-zinc-100">{formatLevelRange(band.level)}</span>
        <span className={isDownside ? "text-[10px] text-teal-300" : "text-[10px] text-rose-300"}>
          {band.level.label}
        </span>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] ${confidenceClass(band.level.confidence)}`}>
          {band.level.confidence ?? "low"}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-zinc-500">{flowSummary(band.level)}</div>
      <div className="mt-2 text-[11px] leading-5 text-zinc-300">
        {band.level.explanation ?? band.level.reason ?? "Market-inferred forced-flow zone."}
      </div>
      <div className="mt-1 text-[10px] leading-4 text-zinc-500">Path: {path}</div>
      {band.level.evidence && band.level.evidence.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {band.level.evidence.slice(0, 4).map((item) => (
            <span
              key={item}
              className={`rounded-full border px-2 py-0.5 text-[10px] leading-4 ${evidenceToneClass(item)}`}
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
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
