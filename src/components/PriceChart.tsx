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
  reactionLevelsToSupportResistanceLevels,
  type ReactionLevelsPayload,
  type ReactionOverlayMode,
} from "@/lib/reactionLevels";
import { buildTradePlan } from "@/lib/tradePlan";
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

const REACTION_WINDOW: Record<TradingInterval, "5m" | "15m" | "1h"> = {
  "5": "5m",
  "15": "15m",
  "60": "1h",
  "240": "1h",
  D: "1h",
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

const OVERLAY_OPTIONS: Array<{ label: string; value: ReactionOverlayMode }> = [
  { label: "All", value: "all" },
  { label: "Book", value: "book" },
  { label: "Positioning", value: "positioning" },
  { label: "Stress", value: "stress" },
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

type LevelRead = {
  label: "Rejection" | "Break" | "Pivot" | "Stress";
  summary: string;
  reason: string;
  className: string;
};

function isStressZone(level: SupportResistanceLevel): boolean {
  return level.leverageBucket === "stress";
}

function isActionableFlowLevel(level: SupportResistanceLevel): boolean {
  return level.status === "active";
}

function levelReadFor(level: SupportResistanceLevel, side: "downside" | "upside"): LevelRead {
  const isUpside = side === "upside";
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

function riskCopy(level: SupportResistanceLevel): string {
  return level.flowSide === "forced_sell" ? "sell-risk" : "buy-risk";
}

function flowSummary(level: SupportResistanceLevel): string {
  if (isStressZone(level)) {
    return `Tracked/inferred stress / ${formatCompactUsd(level.notionalUsd)} ${level.flowSide === "forced_sell" ? "sell-stress" : "buy-stress"} / Score ${
      level.lfxScore ?? level.pressureScore ?? "n/a"
    }`;
  }

  const rank =
    level.flowRank != null && level.flowRank <= 2
      ? `Top #${level.flowRank}`
      : (level.flowRelative ?? 0) >= 1.15
        ? "Above avg"
        : "Market flow";
  return `${rank} / ${formatCompactUsd(level.notionalUsd)} ${riskCopy(level)} / Score ${level.lfxScore ?? level.pressureScore ?? "n/a"}`;
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
    return `Reject -> ${holdTarget ? formatLevelRange(holdTarget) : "next upside flow"}; break -> ${
      failTarget ? formatLevelRange(failTarget) : "lower flow"
    }`;
  }

  const clearTarget = nearestHigher(sameSideLevels, level.price);
  const rejectTarget = nearestLower(oppositeLevels, level.price);
  return `Break -> ${clearTarget ? formatLevelRange(clearTarget) : "higher flow"}; reject -> ${
    rejectTarget ? formatLevelRange(rejectTarget) : "nearest downside flow"
  }`;
}

function evidenceToneClass(text: string): string {
  const normalized = text.toLowerCase();
  if (normalized.includes("stress") || normalized.includes("tracked")) {
    return "border-zinc-700 bg-zinc-900 text-zinc-300";
  }
  if (normalized.includes("thin") || normalized.includes("sell-risk") || normalized.includes("buy-risk")) {
    return "border-amber-500/25 bg-amber-500/10 text-amber-200";
  }
  if (
    normalized.includes("top #") ||
    normalized.includes("above-average") ||
    normalized.includes("high leverage") ||
    normalized.includes("near current") ||
    normalized.includes("projected") ||
    normalized.includes("inferred")
  ) {
    return "border-sky-500/25 bg-sky-500/10 text-sky-200";
  }
  if (normalized.includes("high reach") || normalized.includes("deep")) {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  }
  return "border-zinc-800 bg-zinc-950 text-zinc-500";
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

function chartTagForLevel(level: SupportResistanceLevel, side: "downside" | "upside"): string {
  if (isStressZone(level)) return `${side === "downside" ? "sell" : "buy"} stress`;
  if (level.leverageBucket === "book") return `${side === "downside" ? "bid" : "ask"} book`;
  if (level.leverageBucket === "positioning") return `${side === "downside" ? "long" : "short"} crowd`;
  if (level.leverageBucket === "mixed") return "mixed level";
  if (level.flowRank != null) return `#${level.flowRank} ${side === "downside" ? "sell" : "buy"} flow`;
  return level.label;
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
          ? 6
          : 0;
  return score + distanceBonus + sourceBonus;
}

function selectVisibleReactionLevels(levels: SupportResistanceLevel[]): SupportResistanceLevel[] {
  return [...levels]
    .sort((a, b) => reactionDisplayPriority(b) - reactionDisplayPriority(a))
    .slice(0, 4)
    .sort((a, b) => a.price - b.price);
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
  const chartFrameRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const pageScrollLockRef = useRef<{ htmlOverflow: string; bodyOverflow: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<CandleDatum[]>([]);
  const [reactionPayload, setReactionPayload] = useState<ReactionLevelsPayload | null>(null);
  const [reactionUnavailable, setReactionUnavailable] = useState(false);
  const [overlayMode, setOverlayMode] = useState<ReactionOverlayMode>("all");
  const [interval, setInterval] = useState<TradingInterval>(DEFAULT_INTERVAL);
  const [zoneBands, setZoneBands] = useState<ChartZoneBand[]>([]);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);

  const reactionSupported = marketType === "perp";
  const currentPrice = reactionPayload?.currentPrice ?? candles.at(-1)?.close ?? null;
  const levels = useMemo(
    () => (reactionSupported && reactionPayload ? reactionLevelsToSupportResistanceLevels(reactionPayload, overlayMode) : []),
    [overlayMode, reactionPayload, reactionSupported],
  );
  const lastCandleTimeMs = candles.at(-1)?.time ? normalizeTime(candles.at(-1)!.time) : null;
  const dataThroughTimeMs = lastCandleTimeMs != null ? lastCandleTimeMs + INTERVAL_MS[interval] : null;
  const latestLevelTimeMs = reactionPayload?.updatedAt ?? null;
  const tradePlan = useMemo(
    () =>
      buildTradePlan({
        candles,
        interval: API_INTERVAL[interval],
        levels: levels.filter(isActionableFlowLevel),
        fundingAPR,
        fundingPercentile,
      }),
    [candles, fundingAPR, fundingPercentile, interval, levels],
  );
  const visibleDownsideFlows = useMemo(
    () =>
      selectVisibleReactionLevels(
        levels.filter((level) => level.kind === "support" && (currentPrice == null || level.price < currentPrice)),
      ),
    [currentPrice, levels],
  );
  const visibleUpsideFlows = useMemo(
    () =>
      selectVisibleReactionLevels(
        levels.filter((level) => level.kind === "resistance" && (currentPrice == null || level.price > currentPrice)),
      ),
    [currentPrice, levels],
  );

  const lockPageScrollInChart = () => {
    if (typeof document === "undefined" || pageScrollLockRef.current) return;
    pageScrollLockRef.current = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  };

  const unlockPageScrollInChart = () => {
    if (typeof document === "undefined" || !pageScrollLockRef.current) return;
    document.documentElement.style.overflow = pageScrollLockRef.current.htmlOverflow;
    document.body.style.overflow = pageScrollLockRef.current.bodyOverflow;
    pageScrollLockRef.current = null;
  };

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

    async function fetchReactionLevels() {
      setReactionUnavailable(false);
      setReactionPayload(null);

      if (!reactionSupported) {
        setReactionUnavailable(false);
        return;
      }

      try {
        const params = new URLSearchParams({
          coin,
          window: REACTION_WINDOW[interval],
        });
        const response = await fetch(withNetworkParam(`/api/market/reaction-levels?${params.toString()}`));
        if (!response.ok) throw new Error("Unable to fetch Reaction Map.");
        const payload = (await response.json()) as ReactionLevelsPayload;
        if (!cancelled) {
          setReactionPayload(payload);
          setReactionUnavailable(payload.levels.length === 0);
        }
      } catch {
        if (!cancelled) {
          setReactionPayload(null);
          setReactionUnavailable(true);
        }
      }
    }

    fetchReactionLevels();
    return () => {
      cancelled = true;
    };
  }, [coin, interval, reactionSupported]);

  useEffect(() => {
    const frame = chartFrameRef.current;
    if (!frame) return;

    const stopPageScroll = (event: WheelEvent) => {
      event.preventDefault();
    };

    frame.addEventListener("wheel", stopPageScroll, { passive: false });
    return () => {
      frame.removeEventListener("wheel", stopPageScroll);
    };
  }, []);

  useEffect(() => () => unlockPageScrollInChart(), []);

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
        side === "downside" ? `rgba(20, 184, 166, ${Math.max(0.18, alpha * 0.34)})` : `rgba(244, 63, 94, ${Math.max(0.18, alpha * 0.34)})`;
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
      ? `Reaction Map - refreshed ${formatTimeMs(latestLevelTimeMs)}`
      : dataThroughTimeMs != null
        ? `Reaction Map - candles through ${formatTimeMs(dataThroughTimeMs)}`
        : "Reaction Map";
  const hasActionablePlan = tradePlan.bias !== "wait";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0d1016]">
      <div className="shrink-0 border-b border-zinc-800 px-3 py-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionEyebrow>{marketType === "spot" ? "RWA chart proxy" : "Reaction Map"}</SectionEyebrow>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <div className={compact ? "font-mono text-base font-semibold text-zinc-100" : "font-mono text-lg font-semibold text-zinc-100"}>{coin}</div>
              <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                {API_INTERVAL[interval]} candles
              </div>
              {marketType === "perp" ? (
                <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                  {REACTION_WINDOW[interval]} reaction window
                </div>
              ) : null}
              {currentPrice != null && (
                <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                  {formatLevelPrice(currentPrice)}
                </div>
              )}
            </div>
            <div className="mt-2 max-w-2xl text-[11px] leading-5 text-zinc-500">
              Inferred from public trades, OI changes, book depth, funding, and tracked samples when available.
            </div>
          </div>
          <div className="flex flex-wrap justify-start gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500 lg:justify-end">
            {marketType === "perp" ? (
              <div className="flex rounded-full border border-zinc-800 bg-zinc-950/70 p-0.5 tracking-normal">
                {OVERLAY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setOverlayMode(option.value)}
                    className={`rounded-full px-2 py-0.5 transition ${
                      overlayMode === option.value
                        ? "bg-sky-500/15 text-sky-200"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
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
                  Downside reaction
                </span>
                <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-rose-300">
                  Upside reaction
                </span>
                <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1">
                  Inferred
                </span>
                <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2 py-1">
                  Not exact positions
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="p-3">
        <div
          ref={chartFrameRef}
          className="relative h-[360px] overflow-hidden overscroll-contain rounded-[18px] border border-zinc-800 bg-zinc-950 md:h-[430px] xl:h-[460px]"
          onPointerEnter={lockPageScrollInChart}
          onPointerLeave={unlockPageScrollInChart}
          onBlur={unlockPageScrollInChart}
        >
          {loading ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
              Loading Reaction Map...
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
            Reaction levels are inferred market pressure, not complete trader-position truth or a promise that price must hold.
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
                Candles through {formatTimeMs(dataThroughTimeMs)}. Reaction Map refreshes from public Hyperliquid streams.
              </div>
            ) : null}
            {reactionUnavailable || (reactionSupported && levels.length === 0) ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-500">
                {reactionSupported
                  ? "Reaction Map is warming up. It needs recent public stream buckets before it can rank levels."
                  : "Reaction Map is available for Hyperliquid perps."}
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
        const read = levelReadFor(band.level, band.side);
        const color = isDownside ? "20, 184, 166" : "244, 63, 94";
        const textColor = isDownside ? "text-teal-200" : "text-rose-200";
        const borderColor = isDownside ? "border-teal-400/35" : "border-rose-400/35";
        const idleBandAlpha = band.alpha * 0.06;
        const idleBorderAlpha = band.alpha * 0.3;
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
                backgroundColor: active
                  ? `rgba(${color}, ${Math.max(0.11, band.alpha * 0.14)})`
                  : `rgba(${color}, ${idleBandAlpha})`,
                borderTopColor: active ? `rgba(${color}, 0.72)` : `rgba(${color}, ${idleBorderAlpha})`,
                borderBottomColor: active ? `rgba(${color}, 0.72)` : `rgba(${color}, ${idleBorderAlpha})`,
              }}
              aria-label={`${formatLevelRange(band.level)} ${read.label} ${band.level.label}`}
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
                  style={{ borderColor: `rgba(${color}, ${active ? 0.9 : Math.max(0.28, band.alpha * 0.52)})` }}
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
              style={{
                top: Math.max(8, band.centerY - 10),
                backgroundColor: `rgba(9, 9, 11, ${Math.max(0.74, 0.94 - band.alpha * 0.14)})`,
                borderColor: `rgba(${color}, ${Math.max(0.28, band.alpha * 0.72)})`,
                boxShadow: band.alpha >= 0.72 ? `0 0 ${Math.round(10 + band.alpha * 16)}px rgba(${color}, ${band.alpha * 0.18})` : "none",
                opacity: Math.max(0.62, band.alpha),
              }}
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
  const read = levelReadFor(band.level, band.side);
  const showPath = !isStressZone(band.level);
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
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${read.className}`}>
          {read.label}
        </span>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] ${confidenceClass(band.level.confidence)}`}>
          {band.level.confidence ?? "low"}
        </span>
      </div>
      <div className={isDownside ? "mt-1 text-[10px] text-teal-300" : "mt-1 text-[10px] text-rose-300"}>
        {band.level.label}
      </div>
      <div className="mt-2 text-[12px] leading-5 text-zinc-100">
        {read.summary}
      </div>
      <div className="mt-1 text-[11px] leading-5 text-zinc-400">{read.reason}</div>
      <div className="mt-2 text-[10px] leading-4 text-zinc-500">{flowSummary(band.level)}</div>
      {showPath ? <div className="mt-1 text-[10px] leading-4 text-zinc-500">Next: {path}</div> : null}
      {band.level.evidence && band.level.evidence.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {band.level.evidence.slice(0, 6).map((item) => (
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
