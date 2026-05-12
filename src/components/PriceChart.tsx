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
import { formatEasternChartTick, formatEasternDateTime } from "@/lib/time";
import {
  reactionLevelsToSupportResistanceLevels,
  type ReactionLevelsPayload,
  type ReactionOverlayMode,
} from "@/lib/reactionLevels";
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

const REACTION_WINDOW: Record<TradingInterval, "5m" | "15m" | "1h" | "4h"> = {
  "5": "5m",
  "15": "15m",
  "60": "1h",
  "240": "4h",
  D: "4h",
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
  { label: "Reaction", value: "all" },
  { label: "Order Book", value: "book" },
  { label: "Positioning", value: "oi_holding" },
  { label: "Stress", value: "stress" },
];

const CANDLE_FETCH_TIMEOUT_MS = 10_000;
const CANDLE_FETCH_RETRIES = 2;
const CANDLE_RETRY_DELAY_MS = 350;

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchCandleRows(url: string): Promise<Array<Record<string, string | number>>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= CANDLE_FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CANDLE_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: unknown } | null;
        const upstreamMessage = typeof body?.error === "string" ? body.error : "";
        const transient = response.status === 429 || response.status >= 500;
        lastError = new Error(upstreamMessage || "Unable to fetch price candles.");
        if (!transient || attempt === CANDLE_FETCH_RETRIES) throw lastError;
      } else {
        const payload = await response.json();
        if (!Array.isArray(payload)) throw new Error("Price candle response was not usable.");
        return payload as Array<Record<string, string | number>>;
      }
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      lastError = aborted
        ? new Error("Price candles took too long to load.")
        : error instanceof Error
          ? error
          : new Error("Unable to fetch price candles.");
      if (attempt === CANDLE_FETCH_RETRIES) throw lastError;
    } finally {
      window.clearTimeout(timeoutId);
    }

    await wait(CANDLE_RETRY_DELAY_MS * (attempt + 1));
  }

  throw lastError ?? new Error("Unable to fetch price candles.");
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

type ChartZoneTone = {
  rgb: string;
  textClass: string;
  borderClass: string;
};

function chartToneForLevel(level: SupportResistanceLevel, side: "downside" | "upside"): ChartZoneTone {
  const role = level.zoneTooltip?.role;
  if (level.leverageBucket === "positioning") {
    if (role === "long_defense") {
      return { rgb: "45, 212, 191", textClass: "text-teal-200", borderClass: "border-teal-400/35" };
    }
    if (role === "short_defense") {
      return { rgb: "251, 113, 133", textClass: "text-rose-200", borderClass: "border-rose-400/35" };
    }
    if (role === "trapped_shorts") {
      return { rgb: "56, 189, 248", textClass: "text-sky-200", borderClass: "border-sky-400/35" };
    }
    if (role === "trapped_longs") {
      return { rgb: "251, 191, 36", textClass: "text-amber-200", borderClass: "border-amber-400/35" };
    }
    return { rgb: "148, 163, 184", textClass: "text-slate-200", borderClass: "border-slate-400/35" };
  }
  if (level.leverageBucket === "stress") {
    return { rgb: "161, 161, 170", textClass: "text-zinc-200", borderClass: "border-zinc-500/35" };
  }
  return side === "downside"
    ? { rgb: "20, 184, 166", textClass: "text-teal-200", borderClass: "border-teal-400/35" }
    : { rgb: "244, 63, 94", textClass: "text-rose-200", borderClass: "border-rose-400/35" };
}

export default function PriceChart({
  coin,
  marketType = "perp",
  compact = false,
}: PriceChartProps) {
  const chartFrameRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<CandleDatum[]>([]);
  const [reactionPayload, setReactionPayload] = useState<ReactionLevelsPayload | null>(null);
  const [reactionLoading, setReactionLoading] = useState(false);
  const [reactionUnavailable, setReactionUnavailable] = useState(false);
  const [overlayMode, setOverlayMode] = useState<ReactionOverlayMode>("all");
  const [interval, setInterval] = useState<TradingInterval>(DEFAULT_INTERVAL);
  const [candleRetryNonce, setCandleRetryNonce] = useState(0);
  const [zoneBands, setZoneBands] = useState<ChartZoneBand[]>([]);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  const reactionSupported = marketType === "perp";
  const currentPrice = reactionPayload?.currentPrice ?? candles.at(-1)?.close ?? null;
  const overlayAvailability = useMemo(() => {
    if (!reactionPayload) {
      return {
        all: true,
        book: false,
        oi_holding: false,
        stress: false,
      } satisfies Record<ReactionOverlayMode, boolean>;
    }

    const hasBook =
      reactionPayload.levels.some((level) => level.primarySource === "book") ||
      (reactionPayload.orderBook?.bidShelves?.length ?? 0) > 0 ||
      (reactionPayload.orderBook?.askShelves?.length ?? 0) > 0;
    const hasPositioning =
      (reactionPayload.overlayLevels?.oiHolding?.length ?? 0) > 0 ||
      (reactionPayload.positioning?.buyerInitiatedBuilds?.length ?? 0) > 0 ||
      (reactionPayload.positioning?.sellerInitiatedBuilds?.length ?? 0) > 0;
    const hasStress = reactionPayload.levels.some((level) => level.primarySource === "stress");

    return {
      all: true,
      book: hasBook,
      oi_holding: hasPositioning,
      stress: hasStress,
    } satisfies Record<ReactionOverlayMode, boolean>;
  }, [reactionPayload]);
  const levels = useMemo(
    () => (reactionSupported && reactionPayload ? reactionLevelsToSupportResistanceLevels(reactionPayload, overlayMode) : []),
    [overlayMode, reactionPayload, reactionSupported],
  );
  const oiHoldingHidden =
    overlayMode === "oi_holding" && reactionSupported && reactionPayload != null && levels.length === 0;
  const orderBookWarming =
    overlayMode === "book" && reactionSupported && reactionPayload != null && levels.length === 0;
  const showReactionProgress = reactionLoading || orderBookWarming;
  const lastCandleTimeMs = candles.at(-1)?.time ? normalizeTime(candles.at(-1)!.time) : null;
  const dataThroughTimeMs = lastCandleTimeMs != null ? lastCandleTimeMs + INTERVAL_MS[interval] : null;
  const latestLevelTimeMs = reactionPayload?.updatedAt ?? null;
  const visibleDownsideFlows = useMemo(
    () =>
      selectVisibleReactionLevels(
        levels.filter((level) => isDownsideReactionLevel(level, currentPrice, overlayMode)),
        overlayMode === "oi_holding" ? 5 : 4,
      ),
    [currentPrice, levels, overlayMode],
  );
  const visibleUpsideFlows = useMemo(
    () =>
      selectVisibleReactionLevels(
        levels.filter((level) => isUpsideReactionLevel(level, currentPrice, overlayMode)),
        overlayMode === "oi_holding" ? 5 : 4,
      ),
    [currentPrice, levels, overlayMode],
  );
  const activeZoneId = hoveredZoneId ?? selectedZoneId;

  useEffect(() => {
    if (selectedZoneId && !zoneBands.some((band) => band.id === selectedZoneId)) {
      setSelectedZoneId(null);
    }
  }, [selectedZoneId, zoneBands]);

  useEffect(() => {
    if (!overlayAvailability[overlayMode]) {
      setOverlayMode("all");
    }
  }, [overlayAvailability, overlayMode]);

  useEffect(() => {
    let cancelled = false;

    async function fetchCandles() {
      setLoading(true);
      setError(null);
      try {
        const now = Date.now();
        const startTime = now - LOOKBACK_MS[interval];
        const rawCandles = await fetchCandleRows(
          withNetworkParam(
            `/api/market/candles?coin=${encodeURIComponent(coin)}&marketType=${marketType}&interval=${API_INTERVAL[interval]}&startTime=${startTime}&endTime=${now}`,
          ),
        );
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
  }, [candleRetryNonce, coin, interval, marketType]);

  useEffect(() => {
    let cancelled = false;

    async function fetchReactionLevels() {
      setReactionUnavailable(false);
      setReactionPayload(null);
      setReactionLoading(reactionSupported);

      if (!reactionSupported) {
        setReactionUnavailable(false);
        setReactionLoading(false);
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
      } finally {
        if (!cancelled) setReactionLoading(false);
      }
    }

    fetchReactionLevels();
    return () => {
      cancelled = true;
    };
  }, [coin, interval, reactionSupported]);

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

    const renderLevel = (level: SupportResistanceLevel, index: number, side: "downside" | "upside") => {
      const alpha = levelAlpha(level, index);
      const tone = chartToneForLevel(level, side);
      const color = `rgba(${tone.rgb}, ${alpha})`;
      const edgeColor = `rgba(${tone.rgb}, ${Math.max(0.18, alpha * 0.34)})`;
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
  }, [candles, currentPrice, interval, visibleDownsideFlows, visibleUpsideFlows]);

  const levelSourceNote =
    oiHoldingHidden
      ? "Positioning zones are warming up from current public flow."
      : orderBookWarming
        ? "Order Book shelves are still collecting from recent public depth."
      : latestLevelTimeMs != null
      ? `Reaction Map - refreshed ${formatTimeMs(latestLevelTimeMs)}`
      : dataThroughTimeMs != null
        ? `Reaction Map - candles through ${formatTimeMs(dataThroughTimeMs)}`
        : "Reaction Map";
  const levelAvailabilityMessage = oiHoldingHidden
    ? "Positioning needs enough recent flow and positive OI change before zones appear. Missing zones are hidden rather than forced."
    : orderBookWarming
      ? "Order Book levels need a few clean depth samples before they appear."
    : reactionSupported
      ? "Reaction Map is warming up. It needs recent public stream buckets before it can rank levels."
      : "Reaction Map is limited to major liquid perps so smaller names do not show noisy pressure bands.";
  const compactStatus = reactionUnavailable || (reactionSupported && levels.length === 0)
    ? levelAvailabilityMessage
    : levelSourceNote;

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
                  {REACTION_WINDOW[interval]} zones
                </div>
              ) : null}
              {currentPrice != null && (
                <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                  {formatLevelPrice(currentPrice)}
                </div>
              )}
            </div>
            <div className="mt-2 max-w-2xl text-[11px] leading-5 text-zinc-500">Reaction combines book shelves, inferred positioning, and price behavior. Acceptance or rejection matters more than a red or green line.</div>
          </div>
          <div className="flex flex-wrap justify-start gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500 lg:justify-end">
            {marketType === "perp" ? (
              <div className="flex rounded-full border border-zinc-800 bg-zinc-950/70 p-0.5 tracking-normal">
                {OVERLAY_OPTIONS.map((option) => {
                  const available = overlayAvailability[option.value];
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!available}
                      title={available ? `${option.label} overlay` : `${option.label} data is still warming up for ${coin}`}
                      onClick={() => {
                        if (available) setOverlayMode(option.value);
                      }}
                      className={`rounded-full px-2 py-0.5 transition ${
                        overlayMode === option.value
                          ? "bg-sky-500/15 text-sky-200"
                          : available
                            ? "text-zinc-500 hover:text-zinc-200"
                            : "cursor-not-allowed text-zinc-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
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
          </div>
        </div>
      </div>

      <div className="p-3">
        <div
          ref={chartFrameRef}
          className="relative h-[360px] overflow-hidden overscroll-contain rounded-[18px] border border-zinc-800 bg-zinc-950 md:h-[430px] xl:h-[460px]"
        >
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-zinc-500">
              <div>Loading price candles...</div>
              {reactionPayload ? (
                <div className="text-[11px] text-zinc-600">Reaction zones are ready.</div>
              ) : null}
            </div>
          ) : error || candles.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-zinc-500">
              <div>{error ?? "No price candles available."}</div>
              <button
                type="button"
                onClick={() => setCandleRetryNonce((value) => value + 1)}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-teal-400/50 hover:text-teal-200"
              >
                Retry candles
              </button>
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
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] leading-5 text-zinc-500">
          <span>{compactStatus}</span>
          <span className="text-zinc-600">Hover a band for context. Details stay on-chart to keep the drawer compact.</span>
        </div>
        {showReactionProgress ? (
          <div className="mt-2 overflow-hidden rounded-full border border-zinc-800 bg-zinc-950" aria-label="Reaction Map levels loading">
            <div className="h-1.5 w-1/2 animate-pulse rounded-full bg-sky-400/70" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function zoneRoleLabel(band: ChartZoneBand): string {
  const role = band.level.zoneTooltip?.roleLabel;
  if (role) return role;
  if (band.level.leverageBucket === "book") return band.side === "downside" ? "Bid shelf" : "Ask shelf";
  if (band.side === "downside") return "Downside reaction";
  return "Upside reaction";
}

function shortTraderRead(level: SupportResistanceLevel, side: "downside" | "upside"): string {
  const role = level.zoneTooltip?.role;
  if (role === "long_defense") return "Buyer build below price. Watch whether buyers defend or lose the zone.";
  if (role === "trapped_longs") return "Buyer build above price. Bulls need acceptance back through the zone.";
  if (role === "short_defense") return "Seller build above price. Watch rejection versus clean acceptance above.";
  if (role === "trapped_shorts") return "Seller build below price. Reclaim can turn it into squeeze fuel.";
  if (level.leverageBucket === "book") {
    return side === "downside"
      ? "Real bid liquidity. Useful only if it stays/refills when tested."
      : "Real ask liquidity. Useful only if it stays/refills when tested.";
  }
  return side === "downside"
    ? "Downside reaction area; wait for acceptance or rejection."
    : "Upside reaction area; wait for acceptance or rejection.";
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
  const activeBand = bands.find((band) => band.id === activeZoneId) ?? null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {bands.map((band) => {
        const read = levelReadFor(band.level, band.side);
        const tone = chartToneForLevel(band.level, band.side);
        const color = tone.rgb;
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
              className={`pointer-events-auto absolute right-2 max-w-[calc(100%_-_1rem)] cursor-crosshair truncate rounded-full border bg-zinc-950/80 px-2 py-0.5 text-[10px] leading-4 backdrop-blur-md focus:outline-none focus:ring-1 focus:ring-white/40 sm:right-16 sm:max-w-[112px] ${tone.borderClass} ${tone.textClass}`}
              style={{
                top: Math.max(8, band.centerY - 10),
                backgroundColor: `rgba(9, 9, 11, ${Math.max(0.74, 0.94 - band.alpha * 0.14)})`,
                borderColor: `rgba(${color}, ${Math.max(0.24, band.alpha * 0.58)})`,
                boxShadow: active ? `0 0 ${Math.round(10 + band.alpha * 14)}px rgba(${color}, ${band.alpha * 0.14})` : "none",
                opacity: active ? 1 : Math.max(0.5, band.alpha * 0.86),
              }}
              aria-label={`${formatLevelRange(band.level)} ${read.label} details`}
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
      {activeBand ? <ZoneHoverTooltip band={activeBand} /> : null}
    </div>
  );
}

function ZoneHoverTooltip({ band }: { band: ChartZoneBand }) {
  const read = levelReadFor(band.level, band.side);
  const tooltip = band.level.zoneTooltip;
  const tone = chartToneForLevel(band.level, band.side);
  const flowSize = tooltip?.inferredOiUsd ?? tooltip?.totalRecentFlowUsd ?? band.level.notionalUsd;
  const refreshed = tooltip?.refreshedAtMs ? formatTimeMs(tooltip.refreshedAtMs) : null;
  const sideLabel = tooltip?.roleLabel ?? (tooltip?.side === "bear" ? "Seller-initiated build" : tooltip?.side === "bull" ? "Buyer-initiated build" : zoneRoleLabel(band));
  const reason = tooltip?.reasonSelected ?? read.reason;

  return (
    <div
      className={`pointer-events-none absolute right-3 z-30 w-[min(320px,calc(100%-1.5rem))] -translate-y-1/2 rounded-xl border bg-zinc-950/95 p-3 text-left shadow-2xl shadow-black/45 backdrop-blur-md sm:right-16 ${
        tone.borderClass
      }`}
      style={{ top: `min(max(${Math.round(band.centerY)}px, 102px), calc(100% - 102px))` }}
      role="tooltip"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{sideLabel}</div>
          <div className="mt-1 font-mono text-sm font-semibold text-zinc-100">{formatLevelRange(band.level)}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono ${read.className}`}>{read.label}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-300">{shortTraderRead(band.level, band.side) || read.summary}</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
        {tooltip?.rank || band.level.flowRank ? <TooltipMetric label="Rank" value={`#${tooltip?.rank ?? band.level.flowRank}`} /> : null}
        <TooltipMetric label="Flow / OI" value={formatCompactUsd(flowSize)} />
        {tooltip?.totalRecentFlowUsd ? <TooltipMetric label="Recent flow" value={formatCompactUsd(tooltip.totalRecentFlowUsd)} /> : null}
        {tooltip?.buyNotionalUsd != null && tooltip?.sellNotionalUsd != null ? (
          <TooltipMetric label="Buy / sell" value={`${formatCompactUsd(tooltip.buyNotionalUsd)} / ${formatCompactUsd(tooltip.sellNotionalUsd)}`} />
        ) : null}
      </div>
      <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/55 px-2.5 py-2 text-[11px] leading-4 text-zinc-400">
        {reason}
      </div>
      <div className="mt-2 text-[10px] leading-4 text-zinc-500">
        {refreshed ? `Refreshed ${refreshed}. ` : null}{tooltip?.sourceCaveat ?? "Inferred zone, not exact exchange-wide positions."}
      </div>
    </div>
  );
}

function TooltipMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</div>
      <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-200">{value}</div>
    </div>
  );
}
