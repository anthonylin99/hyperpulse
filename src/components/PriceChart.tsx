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
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import { withNetworkParam } from "@/lib/hyperliquid";
import { formatEasternChartTick, formatEasternDateTime } from "@/lib/time";
import { cn, formatCompactUsd, formatPct } from "@/lib/format";
import {
  reactionLevelsToSupportResistanceLevels,
  type ReactionLevelsPayload,
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
type ApiInterval = "5m" | "15m" | "1h" | "4h" | "1d";
type TimeframeRole = "primary" | "context";
type TimeframeDirection = "lower" | "higher" | "same";
type LevelStrengthGrade = "light" | "medium" | "strong";
type ChartLevel = SupportResistanceLevel & {
  timeframeLabel?: ApiInterval;
  timeframeRole?: TimeframeRole;
  timeframeDirection?: TimeframeDirection;
  timeframeConfluence?: ApiInterval[];
  strengthGrade?: LevelStrengthGrade;
};

const API_INTERVAL: Record<TradingInterval, ApiInterval> = {
  "5": "5m",
  "15": "15m",
  "60": "1h",
  "240": "4h",
  D: "1d",
};

const REACTION_WINDOW: Record<TradingInterval, ApiInterval> = {
  "5": "5m",
  "15": "15m",
  "60": "1h",
  "240": "4h",
  D: "1d",
};
const MASTER_REACTION_WINDOW: ApiInterval = "4h";

const INTERVAL_RANK: Record<ApiInterval, number> = {
  "5m": 0,
  "15m": 1,
  "1h": 2,
  "4h": 3,
  "1d": 4,
};

const CONTEXT_REACTION_WINDOWS: Record<TradingInterval, ApiInterval[]> = {
  "5": ["15m", "1h"],
  "15": ["5m", "1h"],
  "60": ["15m", "4h"],
  "240": ["1h", "1d"],
  D: ["4h", "1h"],
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

async function fetchChartContext(url: string): Promise<ChartContextResponse> {
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
        const payload = (await response.json()) as ChartContextResponse;
        if (!Array.isArray(payload.candles)) throw new Error("Price candle response was not usable.");
        return payload;
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

function recentAverageMove(candles: CandleDatum[], length = 20): number | null {
  const recent = candles.slice(-length);
  if (recent.length < 3) return null;
  const moves = recent
    .map((candle, index) => {
      const previousClose = recent[index - 1]?.close ?? candle.open;
      return Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose),
      );
    })
    .filter((move) => Number.isFinite(move) && move > 0);
  if (moves.length === 0) return null;
  return moves.reduce((sum, move) => sum + move, 0) / moves.length;
}

function maxConfluenceDistancePct(currentPrice: number | null, averageMove: number | null): number {
  if (!currentPrice || !Number.isFinite(currentPrice) || currentPrice <= 0 || !averageMove || averageMove <= 0) {
    return TECHNICAL_CONFLUENCE_WIDTH_PCT;
  }
  const averageMovePct = (averageMove / currentPrice) * 100;
  return Math.min(TECHNICAL_CONFLUENCE_WIDTH_PCT, averageMovePct * AVG_MOVE_CONFLUENCE_MULTIPLIER);
}

function maxDisplayZoneWidth(price: number, averageMove: number | null): number {
  const priceFloor = price * 0.0012;
  if (!averageMove || !Number.isFinite(averageMove) || averageMove <= 0) return priceFloor;
  return Math.max(priceFloor, averageMove * AVG_MOVE_ZONE_WIDTH_MULTIPLIER);
}

function capLevelDisplayZone(level: SupportResistanceLevel, averageMove: number | null): SupportResistanceLevel {
  const zoneLow = level.zoneLow ?? level.price;
  const zoneHigh = level.zoneHigh ?? level.price;
  if (!Number.isFinite(zoneLow) || !Number.isFinite(zoneHigh) || zoneHigh <= zoneLow) return level;

  const maxWidth = maxDisplayZoneWidth(level.price, averageMove);
  if (zoneHigh - zoneLow <= maxWidth) return level;

  const halfWidth = maxWidth / 2;
  return {
    ...level,
    zoneLow: level.price - halfWidth,
    zoneHigh: level.price + halfWidth,
    zoneTooltip: {
      ...level.zoneTooltip,
      reasonSelected: level.zoneTooltip?.reasonSelected
        ? `${level.zoneTooltip.reasonSelected}. Display range capped to recent average move.`
        : "Display range capped to recent average move.",
    },
  };
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

function chartRightScaleWidth(containerWidth: number): number {
  if (containerWidth < 420) return 54;
  if (containerWidth < 640) return 60;
  if (containerWidth < 900) return 68;
  return 76;
}

function chartRightOffsetPixels(containerWidth: number): number {
  if (containerWidth < 420) return 6;
  if (containerWidth < 640) return 10;
  if (containerWidth < 900) return 16;
  return 24;
}

function responsiveChartChrome(containerWidth: number) {
  return {
    rightPriceScale: {
      entireTextOnly: true,
      minimumWidth: chartRightScaleWidth(containerWidth),
    },
    timeScale: {
      rightOffsetPixels: chartRightOffsetPixels(containerWidth),
    },
  };
}

function formatTimeMs(timeMs: number | null | undefined): string {
  if (!timeMs || !Number.isFinite(timeMs)) return "n/a";
  return formatEasternDateTime(timeMs);
}

type LevelRead = {
  label: "Support" | "Rejection" | "Break" | "Pivot" | "Long imbalance" | "Short imbalance" | "Stress" | "Stacked";
  summary: string;
  reason: string;
  className: string;
};

const TECHNICAL_CONFLUENCE_WIDTH_PCT = 0.65;
const MIN_VISIBLE_REACTION_SPACING_PCT = 1.25;
const AVG_MOVE_LEVEL_SPACING_MULTIPLIER = 1.6;
const AVG_MOVE_CONFLUENCE_MULTIPLIER = 0.35;
const AVG_MOVE_ZONE_WIDTH_MULTIPLIER = 0.32;
const MIN_SOURCE_ONLY_PRIORITY = 78;
const MAX_PRIORITY_DROP_FROM_LEADER = 30;
const MIN_BOOK_FALLBACK_NOTIONAL_USD = 20_000_000;
const MIN_BOOK_FALLBACK_PRIORITY = 24;
const MAX_PRIMARY_REACTION_LEVELS = 5;
const MIN_LEVELS_PER_SIDE = 1;

function timeframeLabelFor(level: SupportResistanceLevel): ApiInterval | null {
  return (level as ChartLevel).timeframeLabel ?? null;
}

function timeframeRoleFor(level: SupportResistanceLevel): TimeframeRole {
  return (level as ChartLevel).timeframeRole ?? "primary";
}

function timeframeDirectionFor(level: SupportResistanceLevel): TimeframeDirection {
  return (level as ChartLevel).timeframeDirection ?? "same";
}

function contextWindowsFor(interval: TradingInterval): ApiInterval[] {
  return [...new Set([REACTION_WINDOW[interval], ...CONTEXT_REACTION_WINDOWS[interval]])].filter(
    (candidate) => candidate !== MASTER_REACTION_WINDOW,
  );
}

function directionForTimeframe(primary: ApiInterval, candidate: ApiInterval): TimeframeDirection {
  const primaryRank = INTERVAL_RANK[primary];
  const candidateRank = INTERVAL_RANK[candidate];
  if (candidateRank < primaryRank) return "lower";
  if (candidateRank > primaryRank) return "higher";
  return "same";
}

function tagLevelsForTimeframe(
  levels: SupportResistanceLevel[],
  timeframeLabel: ApiInterval,
  timeframeRole: TimeframeRole,
  primaryTimeframe: ApiInterval,
): ChartLevel[] {
  return levels.map((level) => ({
    ...level,
    id: `${level.id}-${timeframeLabel}-${timeframeRole}`,
    timeframeLabel,
    timeframeRole,
    timeframeDirection: directionForTimeframe(primaryTimeframe, timeframeLabel),
  }));
}

function orderBookShelvesToLevels(
  payload: ReactionLevelsPayload | null,
  timeframeLabel: ApiInterval,
  primaryTimeframe: ApiInterval,
): ChartLevel[] {
  const currentPrice = payload?.currentPrice;
  if (!payload || currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return [];

  const shelfGroups = [
    ...(payload.orderBook?.bidShelves ?? []).map((shelf) => ({ shelf, kind: "support" as const })),
    ...(payload.orderBook?.askShelves ?? []).map((shelf) => ({ shelf, kind: "resistance" as const })),
  ];

  return shelfGroups
    .filter(({ shelf, kind }) => {
      if (!Number.isFinite(shelf.price) || shelf.price <= 0) return false;
      if (kind === "support") return shelf.price < currentPrice;
      return shelf.price > currentPrice;
    })
    .map(({ shelf, kind }) => {
      const notionalTerm = clamp(Math.log10(Math.max(shelf.notionalUsd, 1)) - 5, 0, 5);
      const sampleTerm = clamp(Math.log10(Math.max(shelf.sampleCount, 1) + 1), 0, 2);
      const strength = Math.round(clamp(18 + notionalTerm * 5 + sampleTerm * 3, 18, 48));
      const sideLabel = kind === "support" ? "Bid shelf" : "Ask shelf";

      return {
        id: `live-book-${payload.coin}-${shelf.id}-${timeframeLabel}`,
        label: sideLabel,
        kind,
        source: "reaction_map",
        price: shelf.price,
        zoneLow: shelf.zoneLow,
        zoneHigh: shelf.zoneHigh,
        strength,
        distancePct: shelf.distancePct,
        updatedAtMs: payload.updatedAt,
        confidence: "low",
        status: "active",
        reason: `${sideLabel}: visible resting liquidity. It can move before price trades there.`,
        explanation: `${sideLabel}: visible resting liquidity. It can move before price trades there.`,
        evidence: [sideLabel, "Live order book", "Can pull"],
        notionalUsd: shelf.notionalUsd,
        pressureScore: strength,
        lfxScore: strength,
        depthAdjustedImpact: 0.35,
        volatilityReach: Number(clamp(1 / (1 + Math.abs(shelf.distancePct) / 5), 0.12, 1).toFixed(4)),
        distanceDecay: Number(clamp(Math.exp(-Math.abs(shelf.distancePct) / 7), 0.12, 1).toFixed(4)),
        zoneType: kind === "support" ? "absorption_support" : "absorption_resistance",
        coverage: "market_only",
        flowRank: undefined,
        flowRelative: 1,
        leverageBucket: "book",
        pressureSide: kind === "support" ? "long_liq" : "short_liq",
        pressureSource: "market_inferred",
        zoneTooltip: {
          roleLabel: sideLabel,
          sourceCaveat: "Live resting liquidity can move before price trades there.",
          refreshedAtMs: payload.updatedAt,
          ageMs: shelf.ageMs,
          windowMs: shelf.windowMs,
          reasonSelected: `${sideLabel} from visible order book liquidity.`,
        },
        timeframeLabel,
        timeframeRole: "primary",
        timeframeDirection: directionForTimeframe(primaryTimeframe, timeframeLabel),
        strengthGrade: "light",
      } satisfies ChartLevel;
    });
}

function isStressZone(level: SupportResistanceLevel): boolean {
  return level.leverageBucket === "stress";
}

function isDownsideReactionLevel(
  level: SupportResistanceLevel,
  currentPrice: number | null,
): boolean {
  if (level.exposureSide === "bull") return true;
  if (level.exposureSide === "bear") return false;
  if (level.kind !== "support") return false;
  return currentPrice == null || level.price < currentPrice;
}

function isUpsideReactionLevel(
  level: SupportResistanceLevel,
  currentPrice: number | null,
): boolean {
  if (level.exposureSide === "bear") return true;
  if (level.exposureSide === "bull") return false;
  if (level.kind !== "resistance") return false;
  return currentPrice == null || level.price > currentPrice;
}

function levelReadFor(level: SupportResistanceLevel, side: "downside" | "upside"): LevelRead {
  const isUpside = side === "upside";
  if (level.leverageBucket === "mixed") {
    const className =
      level.exposureSide === "bull" || level.zoneTooltip?.imbalanceType === "long_imbalance"
        ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-200"
        : level.exposureSide === "bear" || level.zoneTooltip?.imbalanceType === "short_imbalance"
          ? "border-red-400/35 bg-red-400/10 text-red-200"
          : "border-sky-400/35 bg-sky-400/10 text-sky-200";
    return {
      label: isUpside ? "Rejection" : "Support",
      summary: isUpside
        ? "Stacked reaction area above price. Buyers need clean acceptance through it."
        : "Stacked reaction area below price. Sellers need clean acceptance below it.",
      reason: "Strength blends technical context, inferred positioning, and visible order book depth when they overlap.",
      className,
    };
  }
  if (level.leverageBucket === "positioning") {
    const imbalanceType = level.zoneTooltip?.imbalanceType;
    if (imbalanceType === "pivot") {
      return {
        label: "Pivot",
        summary: "Buy and sell flow are nearly balanced here. Treat it as a decision zone, not a one-sided wall.",
        reason: "Net buy/sell imbalance is inside the pivot threshold, so confirmation matters more than direction.",
        className: "border-amber-400/35 bg-amber-400/10 text-amber-200",
      };
    }
    const likelyLong = imbalanceType === "long_imbalance" || level.flowSide === "forced_sell";
    return {
      label: isUpside ? "Rejection" : "Support",
      summary: likelyLong
        ? "Buyer build near this level. Watch whether buyers defend it or lose it."
        : "Seller build near this level. Watch rejection versus clean acceptance.",
      reason: "Ranked from public trade concentration, buy/sell imbalance, and positive OI change. This is not exact trader-position data.",
      className: likelyLong
        ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-200"
        : "border-red-400/35 bg-red-400/10 text-red-200",
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

  if (level.leverageBucket === "book") {
    return {
      label: isUpside ? "Rejection" : "Support",
      summary: isUpside
        ? "Visible ask shelf. Stronger if technical or positioning confirms it."
        : "Visible bid shelf. Stronger if technical or positioning confirms it.",
      reason: "Live order-book shelf. Resting orders can pull, so treat pure book levels as lighter-weight context.",
      className: isUpside
        ? "border-red-400/35 bg-red-400/10 text-red-200"
        : "border-emerald-400/35 bg-emerald-400/10 text-emerald-200",
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
  const timeframeTerm = timeframeRoleFor(level) === "context" ? 0.68 : 1;

  return clamp(scoreTerm * 0.48 + rankTerm * 0.3 + impactTerm * 0.22, 0.22, 1) * sourceTerm * timeframeTerm;
}

function hasTechnicalConfluence(level: SupportResistanceLevel): boolean {
  return level.evidence?.some((item) => item.startsWith("Technical:")) ?? false;
}

function hasBookSource(level: SupportResistanceLevel): boolean {
  return (
    level.leverageBucket === "book" ||
    level.leverageBucket === "mixed" ||
    (level.depthAdjustedImpact != null && level.depthAdjustedImpact > 0)
  );
}

function hasPositioningSource(level: SupportResistanceLevel): boolean {
  return (
    level.leverageBucket === "positioning" ||
    level.leverageBucket === "mixed" ||
    (level.inferredOiUsd ?? 0) > 0 ||
    (level.buyNotionalUsd ?? 0) > 0 ||
    (level.sellNotionalUsd ?? 0) > 0
  );
}

function reactionSourceCount(level: SupportResistanceLevel): number {
  const hasTechnical = hasTechnicalConfluence(level);
  const hasBook = hasBookSource(level);
  const hasPositioning = hasPositioningSource(level);
  const hasStress = level.leverageBucket === "stress" || level.coverage === "wallet_sample";
  return [hasTechnical, hasBook, hasPositioning, hasStress].filter(Boolean).length;
}

function levelStrengthGrade(level: SupportResistanceLevel, index: number): LevelStrengthGrade {
  const score = level.lfxScore ?? level.pressureScore ?? level.strength;
  const sourceCount = reactionSourceCount(level);
  const hasTimeframeConfluence = ((level as ChartLevel).timeframeConfluence ?? []).length > 0;
  const explicit = (level as ChartLevel).strengthGrade;

  if (explicit && sourceCount <= 1 && !hasTimeframeConfluence) return explicit;

  if (level.leverageBucket === "book" && sourceCount <= 1) return "light";
  if ((score >= 70 && sourceCount >= 2) || (sourceCount >= 3 && hasTimeframeConfluence)) return "strong";
  if (score >= 42 || sourceCount >= 2 || hasPositioningSource(level)) return "medium";
  return levelVisualStrength(level, index) >= 0.62 ? "medium" : "light";
}

function levelStrengthLabel(level: SupportResistanceLevel, index: number): "Light" | "Medium" | "Strong" {
  const grade = levelStrengthGrade(level, index);
  if (grade === "strong") return "Strong";
  if (grade === "medium") return "Medium";
  return "Light";
}

function levelLineWidth(level: SupportResistanceLevel, index: number): 1 | 2 | 3 | 4 {
  const grade = levelStrengthGrade(level, index);
  if (timeframeRoleFor(level) === "context") return grade === "light" ? 1 : 2;
  if (grade === "strong") return 4;
  if (grade === "medium") return 3;
  return 1;
}

function levelAlpha(level: SupportResistanceLevel, index: number): number {
  const grade = levelStrengthGrade(level, index);
  const base = grade === "strong" ? 0.9 : grade === "medium" ? 0.68 : 0.42;
  const strength = levelVisualStrength(level, index);
  return Number(clamp(base + strength * 0.12, 0.34, 0.96).toFixed(3));
}

function reactionDisplayPriority(level: SupportResistanceLevel, swingOnly = false): number {
  const score = level.lfxScore ?? level.pressureScore ?? level.strength;
  const distance = Math.abs(level.distancePct ?? 0);
  const distanceBonus = clamp(distance / (swingOnly ? 8 : 4), 0, 1) * (swingOnly ? 34 : 18);
  const nearPricePenalty = swingOnly && distance < 0.75 ? 42 : 0;
  const notionalBonus = level.notionalUsd == null ? 0 : clamp(Math.log10(level.notionalUsd + 1) - 6, 0, 4) * 4;
  const sourceCount = reactionSourceCount(level);
  const confluenceBonus = Math.max(sourceCount - 1, 0) * 28;
  const sourceOnlyPenalty = sourceCount <= 1 ? 18 : 0;
  const sourceBonus =
    level.leverageBucket === "stress"
      ? 10
      : level.leverageBucket === "mixed"
        ? 16
        : level.leverageBucket === "positioning"
          ? 8
          : 0;
  return score + distanceBonus + notionalBonus + confluenceBonus + sourceBonus - nearPricePenalty - sourceOnlyPenalty;
}

function minimumReactionSpacingPct(currentPrice: number | null, averageMove: number | null): number {
  if (!currentPrice || !Number.isFinite(currentPrice) || currentPrice <= 0 || !averageMove || averageMove <= 0) {
    return MIN_VISIBLE_REACTION_SPACING_PCT;
  }
  const averageMovePct = (averageMove / currentPrice) * 100;
  return Math.max(MIN_VISIBLE_REACTION_SPACING_PCT, averageMovePct * AVG_MOVE_LEVEL_SPACING_MULTIPLIER);
}

function deservesSourceOnlySlot(level: SupportResistanceLevel, leaderPriority: number): boolean {
  const score = level.lfxScore ?? level.pressureScore ?? level.strength;
  const priority = reactionDisplayPriority(level);
  const notional = level.notionalUsd ?? 0;
  if (level.leverageBucket === "book") {
    return (
      notional >= MIN_BOOK_FALLBACK_NOTIONAL_USD ||
      (priority >= MIN_BOOK_FALLBACK_PRIORITY && (level.confidence === "high" || notional > 0))
    );
  }
  return (
    priority >= MIN_SOURCE_ONLY_PRIORITY &&
    priority >= leaderPriority - MAX_PRIORITY_DROP_FROM_LEADER &&
    (score >= 70 || level.confidence === "high" || level.coverage === "wallet_sample")
  );
}

function selectVisibleReactionLevels<T extends SupportResistanceLevel>(
  levels: T[],
  limit = 5,
  currentPrice: number | null = null,
  averageMove: number | null = null,
): T[] {
  const ranked = [...levels].sort((a, b) => reactionDisplayPriority(b) - reactionDisplayPriority(a));
  const confluent = ranked.filter((level) => reactionSourceCount(level) >= 2);
  const leaderPriority = ranked[0] ? reactionDisplayPriority(ranked[0]) : 0;
  const fallback = ranked.filter(
    (level) => reactionSourceCount(level) < 2 && deservesSourceOnlySlot(level, leaderPriority),
  );
  const selected = new Map<string, T>();
  const minSpacingPct = minimumReactionSpacingPct(currentPrice, averageMove);
  const sideFor = (level: T): "downside" | "upside" =>
    isDownsideReactionLevel(level, currentPrice) ? "downside" : "upside";
  const canSelect = (candidate: T) => {
    const referencePrice =
      currentPrice && Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : candidate.price;
    return ![...selected.values()].some((level) => {
      if (sideFor(level) !== sideFor(candidate)) return false;
      const gapPct = Math.abs(((candidate.price - level.price) / referencePrice) * 100);
      return gapPct < minSpacingPct;
    });
  };
  const addCandidate = (candidate: T, force = false) => {
    if (selected.has(candidate.id)) return;
    if (!force && !canSelect(candidate)) return;
    if (selected.size >= limit) return;
    selected.set(candidate.id, candidate);
  };

  for (const level of confluent) {
    if (selected.size >= limit) break;
    addCandidate(level);
  }
  for (const level of fallback) {
    if (selected.size >= limit) break;
    addCandidate(level);
  }

  const ensureSide = (side: "downside" | "upside") => {
    if ([...selected.values()].some((level) => sideFor(level) === side)) return;
    const candidate = ranked.find((level) => sideFor(level) === side);
    if (!candidate) return;

    if (selected.size >= limit) {
      const removable = [...selected.values()]
        .filter((level) => sideFor(level) !== side)
        .sort((a, b) => reactionDisplayPriority(a) - reactionDisplayPriority(b))[0];
      if (removable) selected.delete(removable.id);
    }

    addCandidate(candidate, true);
  };

  for (let index = 0; index < MIN_LEVELS_PER_SIDE; index += 1) {
    ensureSide("downside");
    ensureSide("upside");
  }

  return [...selected.values()].sort((a, b) => a.price - b.price);
}

function timeframeConfluenceLabel(labels: ApiInterval[]): string {
  return [...new Set(labels)]
    .sort((a, b) => INTERVAL_RANK[a] - INTERVAL_RANK[b])
    .join("+");
}

function withTimeframeConfluence(
  primaryLevels: ChartLevel[],
  contextLevels: ChartLevel[],
  currentPrice: number | null,
  averageMove: number | null,
): ChartLevel[] {
  if (contextLevels.length === 0) return primaryLevels;

  return primaryLevels.map((level) => {
    const matchingTimeframes = contextLevels
      .filter((candidate) => levelOverlapsTechnical(level, candidate, currentPrice, averageMove))
      .map((candidate) => candidate.timeframeLabel)
      .filter((label): label is ApiInterval => label != null && label !== level.timeframeLabel);
    const uniqueTimeframes = [...new Set(matchingTimeframes)];
    if (uniqueTimeframes.length === 0) return level;

    const boostedScore = Math.min(100, (level.lfxScore ?? level.pressureScore ?? level.strength) + Math.min(18, uniqueTimeframes.length * 9));
    const evidence = [...(level.evidence ?? [])];
    const timeframeText = timeframeConfluenceLabel(uniqueTimeframes);
    const contextEvidence = `${timeframeText} context is nearby`;
    if (!evidence.includes(contextEvidence)) evidence.unshift(contextEvidence);

    return {
      ...level,
      strength: Math.max(level.strength, boostedScore),
      pressureScore: Math.max(level.pressureScore ?? 0, boostedScore),
      lfxScore: Math.max(level.lfxScore ?? 0, boostedScore),
      confidence: boostedScore >= 70 ? "high" : level.confidence,
      evidence,
      timeframeConfluence: uniqueTimeframes,
      zoneTooltip: {
        ...level.zoneTooltip,
        reasonSelected: level.zoneTooltip?.reasonSelected
          ? `${level.zoneTooltip.reasonSelected}. ${contextEvidence}.`
          : contextEvidence,
      },
    };
  });
}

function levelOverlapsTechnical(
  level: SupportResistanceLevel,
  technical: SupportResistanceLevel,
  currentPrice: number | null,
  averageMove: number | null = null,
): boolean {
  const referencePrice = currentPrice && Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : level.price;
  const levelLow = level.zoneLow ?? level.price;
  const levelHigh = level.zoneHigh ?? level.price;
  if (technical.price >= levelLow && technical.price <= levelHigh) return true;
  const distancePct = Math.abs(((technical.price - level.price) / referencePrice) * 100);
  return distancePct <= maxConfluenceDistancePct(currentPrice, averageMove);
}

function levelSitsNearDisplayedReaction(level: SupportResistanceLevel, technical: SupportResistanceLevel, currentPrice: number | null): boolean {
  const referencePrice = currentPrice && Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : level.price;
  const distancePct = Math.abs(((technical.price - level.price) / referencePrice) * 100);
  return distancePct < MIN_VISIBLE_REACTION_SPACING_PCT;
}

function confluenceLabelFor(level: SupportResistanceLevel): string {
  const hasBook = level.leverageBucket === "book" || level.leverageBucket === "mixed" || level.depthAdjustedImpact != null;
  const hasPositioning =
    level.leverageBucket === "positioning" ||
    level.leverageBucket === "mixed" ||
    (level.inferredOiUsd ?? 0) > 0 ||
    (level.buyNotionalUsd ?? 0) > 0 ||
    (level.sellNotionalUsd ?? 0) > 0;
  if (hasBook && hasPositioning) return "Technical + Book + Positioning";
  if (hasBook) return "Technical + Book";
  if (hasPositioning) return "Technical + Positioning";
  return "Technical confluence";
}

function withTechnicalConfluence<T extends SupportResistanceLevel>(
  levels: T[],
  technicalLevels: SupportResistanceLevel[],
  currentPrice: number | null,
  averageMove: number | null,
): T[] {
  if (technicalLevels.length === 0) return levels.map((level) => capLevelDisplayZone(level, averageMove) as T);

  return levels.map((level) => {
    const technical = technicalLevels.find((candidate) =>
      levelOverlapsTechnical(level, candidate, currentPrice, averageMove),
    );
    if (!technical) return capLevelDisplayZone(level, averageMove) as T;

    const confluenceLabel = confluenceLabelFor(level);
    const technicalEvidence = `Technical: ${pivotShortLabel(technical)} near ${formatLevelPrice(technical.price)}`;
    const evidence = [...(level.evidence ?? [])];
    if (!evidence.some((item) => item.startsWith("Technical:"))) evidence.unshift(technicalEvidence);
    const boostedScore = Math.min(100, (level.lfxScore ?? level.pressureScore ?? level.strength) + 14);

    return capLevelDisplayZone({
      ...level,
      label: confluenceLabel,
      strength: Math.max(level.strength, boostedScore),
      pressureScore: Math.max(level.pressureScore ?? 0, boostedScore),
      lfxScore: Math.max(level.lfxScore ?? 0, boostedScore),
      confidence: boostedScore >= 70 ? "high" : level.confidence,
      evidence,
      reason: evidence.join(" / "),
      explanation: evidence.join(" / "),
      zoneTooltip: {
        ...level.zoneTooltip,
        roleLabel: confluenceLabel,
        reasonSelected: `${confluenceLabel}: ${technicalEvidence.replace("Technical: ", "")}`,
        technicalConfirmedAtMs: technical.discoveredTimeMs ?? technical.updatedAtMs ?? technical.pivotTimeMs,
        technicalPrice: technical.price,
        technicalLabel: pivotShortLabel(technical),
      },
    }, averageMove) as T;
  });
}

type ChartZoneBand = {
  id: string;
  level: SupportResistanceLevel;
  side: "downside" | "upside";
  strengthGrade: LevelStrengthGrade;
  strengthLabel: "Light" | "Medium" | "Strong";
  top: number;
  height: number;
  centerY: number;
  labelY: number;
  alpha: number;
};

type CandleHoverReadout = {
  timeMs: number | null;
  open: number;
  high: number;
  low: number;
  close: number;
  changePct: number;
};

type ChartZoneTone = {
  rgb: string;
  textClass: string;
  borderClass: string;
};

type ChartPivotLine = {
  id: string;
  level: SupportResistanceLevel;
  y: number;
  labelY: number;
};

type ChartContextResponse = {
  currentPrice: number;
  candles: Array<Record<string, string | number>>;
  pivotLevels?: SupportResistanceLevel[];
  generatedAt: number;
};

function candleReadoutFromData(data: CandlestickData | null | undefined): CandleHoverReadout | null {
  if (!data) return null;
  const open = Number(data.open);
  const high = Number(data.high);
  const low = Number(data.low);
  const close = Number(data.close);
  if (![open, high, low, close].every(Number.isFinite) || open <= 0) return null;

  const timeMs = typeof data.time === "number" ? normalizeTime(data.time) : null;
  return {
    timeMs,
    open,
    high,
    low,
    close,
    changePct: ((close - open) / open) * 100,
  };
}

function candleReadoutFromRawCandle(candle: CandleDatum | null | undefined): CandleHoverReadout | null {
  if (!candle) return null;
  return candleReadoutFromData({
    time: toChartTime(candle.time),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  });
}

function formatCandleChangePct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function chartToneForLevel(level: SupportResistanceLevel, side: "downside" | "upside"): ChartZoneTone {
  const role = level.zoneTooltip?.role;
  if (level.leverageBucket === "positioning") {
    if (level.zoneTooltip?.imbalanceType === "pivot") {
      return { rgb: "251, 191, 36", textClass: "text-amber-200", borderClass: "border-amber-400/35" };
    }
    if (level.zoneTooltip?.imbalanceType === "long_imbalance") {
      return { rgb: "52, 211, 153", textClass: "text-emerald-200", borderClass: "border-emerald-400/35" };
    }
    if (level.zoneTooltip?.imbalanceType === "short_imbalance") {
      return { rgb: "248, 113, 113", textClass: "text-red-200", borderClass: "border-red-400/35" };
    }
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
    if (role === "active_test") {
      return { rgb: "236, 72, 153", textClass: "text-pink-200", borderClass: "border-pink-400/35" };
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

function isBreakoutPivot(level: SupportResistanceLevel): boolean {
  return level.label.toLowerCase().includes("breakout") || level.label.toLowerCase().includes("breakdown");
}

function pivotTone(level: SupportResistanceLevel): ChartZoneTone {
  if (isBreakoutPivot(level)) {
    return { rgb: "56, 189, 248", textClass: "text-sky-200", borderClass: "border-sky-400/35" };
  }
  return { rgb: "251, 191, 36", textClass: "text-amber-200", borderClass: "border-amber-400/35" };
}

function pivotLineTitle(level: SupportResistanceLevel): string {
  if (isBreakoutPivot(level)) return level.kind === "support" ? "BO retest" : "BD retest";
  return level.kind === "support" ? "Pivot low" : "Pivot high";
}

function pivotShortLabel(level: SupportResistanceLevel): string {
  if (isBreakoutPivot(level)) return level.kind === "support" ? "Breakout" : "Breakdown";
  return level.kind === "support" ? "Pivot low" : "Pivot high";
}

function hypeRegimeLabel(value: NonNullable<ReactionLevelsPayload["hypeFundamentals"]>["regime"]): string {
  if (value === "expanding") return "Usage expanding";
  if (value === "cooling") return "Usage cooling";
  if (value === "mixed") return "Mixed usage";
  return "Unknown";
}

function hypeBiasLabel(value: NonNullable<ReactionLevelsPayload["hypeFundamentals"]>["levelBias"]): string {
  if (value === "support_bid") return "Support bias";
  if (value === "breakout_confirm") return "Breakout confirm";
  if (value === "resistance_fade") return "Fade resistance";
  if (value === "mean_revert") return "Mean reversion";
  return "Neutral";
}

function hypeConfidenceClass(value: NonNullable<ReactionLevelsPayload["hypeFundamentals"]>["confidenceAdjustment"]): string {
  if (value === "raise") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (value === "lower") return "border-red-500/30 bg-red-500/10 text-red-200";
  return "border-zinc-700 bg-zinc-950/80 text-zinc-300";
}

function formatHypeMetric(value: number | null | undefined, kind: "usd" | "pct"): string {
  if (kind === "usd") return formatCompactUsd(value);
  return formatPct(value);
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
  const [contextReactionPayloads, setContextReactionPayloads] = useState<Partial<Record<ApiInterval, ReactionLevelsPayload>>>({});
  const [pivotLevels, setPivotLevels] = useState<SupportResistanceLevel[]>([]);
  const [reactionLoading, setReactionLoading] = useState(false);
  const [reactionUnavailable, setReactionUnavailable] = useState(false);
  const [interval, setInterval] = useState<TradingInterval>(DEFAULT_INTERVAL);
  const [candleRetryNonce, setCandleRetryNonce] = useState(0);
  const [zoneBands, setZoneBands] = useState<ChartZoneBand[]>([]);
  const [pivotLineMarkers, setPivotLineMarkers] = useState<ChartPivotLine[]>([]);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [hoveredPivotId, setHoveredPivotId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [hoverCandle, setHoverCandle] = useState<CandleHoverReadout | null>(null);

  useEffect(() => {
    setInterval(DEFAULT_INTERVAL);
  }, [coin, marketType]);

  const reactionSupported = marketType === "perp";
  const primaryReactionWindow = MASTER_REACTION_WINDOW;
  const selectedCandleWindow = API_INTERVAL[interval];
  const contextReactionWindows = useMemo(() => contextWindowsFor(interval), [interval]);
  const currentPrice = reactionPayload?.currentPrice ?? candles.at(-1)?.close ?? null;
  const averageMove = useMemo(() => recentAverageMove(candles), [candles]);
  const levels = useMemo(
    () => {
      if (!reactionSupported || !reactionPayload) return [];

      const reactionLevels = tagLevelsForTimeframe(
        reactionLevelsToSupportResistanceLevels(reactionPayload, "confluence"),
        primaryReactionWindow,
        "primary",
        primaryReactionWindow,
      );
      const liveBookLevels = orderBookShelvesToLevels(
        reactionPayload,
        primaryReactionWindow,
        primaryReactionWindow,
      );

      return [...reactionLevels, ...liveBookLevels];
    },
    [primaryReactionWindow, reactionPayload, reactionSupported],
  );
  const contextReactionLevels = useMemo(
    () =>
      contextReactionWindows.flatMap((windowLabel) => {
        const payload = contextReactionPayloads[windowLabel];
        if (!payload) return [];
        return tagLevelsForTimeframe(
          reactionLevelsToSupportResistanceLevels(payload, "confluence"),
          windowLabel,
          "context",
          primaryReactionWindow,
        );
      }),
    [contextReactionPayloads, contextReactionWindows, primaryReactionWindow],
  );
  const levelsWithTechnical = useMemo(
    () => withTechnicalConfluence(levels, pivotLevels, currentPrice, averageMove),
    [averageMove, currentPrice, levels, pivotLevels],
  );
  const baseReactionLevels = useMemo(
    () => selectVisibleReactionLevels(levelsWithTechnical, MAX_PRIMARY_REACTION_LEVELS, currentPrice, averageMove),
    [averageMove, currentPrice, levelsWithTechnical],
  );
  const visibleReactionLevels = useMemo(
    () => withTimeframeConfluence(baseReactionLevels, contextReactionLevels, currentPrice, averageMove),
    [averageMove, baseReactionLevels, contextReactionLevels, currentPrice],
  );
  const timeframeConfluenceCount = visibleReactionLevels.filter(
    (level) => ((level as ChartLevel).timeframeConfluence ?? []).length > 0,
  ).length;
  const visiblePivotLevels = useMemo(
    () =>
      reactionSupported
        ? []
        : pivotLevels.filter(
            (pivot) =>
              !visibleReactionLevels.some(
                (level) =>
                  levelOverlapsTechnical(level, pivot, currentPrice, averageMove) ||
                  levelSitsNearDisplayedReaction(level, pivot, currentPrice),
              ),
          ),
    [averageMove, currentPrice, pivotLevels, reactionSupported, visibleReactionLevels],
  );
  const combinedMapWarming = reactionSupported && reactionPayload != null && levels.length === 0;
  const showReactionProgress = reactionLoading || combinedMapWarming;
  const lastCandleTimeMs = candles.at(-1)?.time ? normalizeTime(candles.at(-1)!.time) : null;
  const dataThroughTimeMs = lastCandleTimeMs != null ? lastCandleTimeMs + INTERVAL_MS[interval] : null;
  const latestLevelTimeMs = reactionPayload?.updatedAt ?? null;
  const visibleDownsideFlows = useMemo(
    () => visibleReactionLevels.filter((level) => isDownsideReactionLevel(level, currentPrice)),
    [currentPrice, visibleReactionLevels],
  );
  const visibleUpsideFlows = useMemo(
    () => visibleReactionLevels.filter((level) => isUpsideReactionLevel(level, currentPrice)),
    [currentPrice, visibleReactionLevels],
  );
  const highlightedZoneId = hoveredZoneId ?? selectedZoneId;
  const activeCandleReadout = hoverCandle ?? candleReadoutFromRawCandle(candles.at(-1));
  const hypeFundamentals = reactionPayload?.hypeFundamentals ?? null;

  useEffect(() => {
    if (selectedZoneId && !zoneBands.some((band) => band.id === selectedZoneId)) {
      setSelectedZoneId(null);
    }
  }, [selectedZoneId, zoneBands]);

  useEffect(() => {
    const clearZoneSelection = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-zone-trigger='true']")) return;
      setHoveredZoneId(null);
      setSelectedZoneId(null);
    };

    document.addEventListener("pointerdown", clearZoneSelection);
    return () => document.removeEventListener("pointerdown", clearZoneSelection);
  }, []);

  useEffect(() => {
    const frame = chartFrameRef.current;
    if (!frame) return;

    const keepWheelOnChart = (event: WheelEvent) => {
      event.preventDefault();
    };

    frame.addEventListener("wheel", keepWheelOnChart, { capture: true, passive: false });
    return () => {
      frame.removeEventListener("wheel", keepWheelOnChart, true);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchCandles() {
      setLoading(true);
      setError(null);
      try {
        const chartContext = await fetchChartContext(
          withNetworkParam(
            `/api/market/chart-context?coin=${encodeURIComponent(coin)}&marketType=${marketType}&interval=${API_INTERVAL[interval]}`,
          ),
        );
        const nextCandles = chartContext.candles
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
        if (!cancelled) {
          setCandles(nextCandles);
          setPivotLevels(Array.isArray(chartContext.pivotLevels) ? chartContext.pivotLevels : []);
        }
      } catch (err) {
        if (!cancelled) {
          setCandles([]);
          setPivotLevels([]);
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
          window: primaryReactionWindow,
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
  }, [coin, primaryReactionWindow, reactionSupported]);

  useEffect(() => {
    let cancelled = false;

    async function fetchContextReactionLevels() {
      setContextReactionPayloads({});
      if (!reactionSupported || contextReactionWindows.length === 0) return;

      const entries = await Promise.all(
        contextReactionWindows.map(async (windowLabel) => {
          try {
            const params = new URLSearchParams({
              coin,
              window: windowLabel,
            });
            const response = await fetch(withNetworkParam(`/api/market/reaction-levels?${params.toString()}`));
            if (!response.ok) return null;
            const payload = (await response.json()) as ReactionLevelsPayload;
            return [windowLabel, payload] as const;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;
      setContextReactionPayloads(
        Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => entry != null)),
      );
    }

    fetchContextReactionLevels();
    return () => {
      cancelled = true;
    };
  }, [coin, contextReactionWindows, reactionSupported]);

  useEffect(() => {
    const container = chartContainerRef.current;
    const data = toCandlestickData(candles);
    if (!container || data.length === 0) return;
    const precision = pricePrecision(candles.at(-1)?.close);
    const chartChrome = responsiveChartChrome(container.clientWidth);

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
        ...chartChrome.rightPriceScale,
        scaleMargins: { top: 0.08, bottom: 0.12 },
      },
      timeScale: {
        borderColor: "#27272a",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        ...chartChrome.timeScale,
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
    const renderPivotLine = (level: SupportResistanceLevel) => {
      const tone = pivotTone(level);
      const alpha = level.confidence === "high" ? 0.95 : level.confidence === "medium" ? 0.78 : 0.6;
      const color = `rgba(${tone.rgb}, ${alpha})`;

      candleSeries.createPriceLine({
        price: level.price,
        color,
        lineWidth: level.confidence === "high" ? 2 : 1,
        lineStyle: isBreakoutPivot(level) ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: true,
        title: pivotLineTitle(level),
      });
    };
    let zoneFrame: number | null = null;
    const renderZoneBands = () => {
      const nextBands: ChartZoneBand[] = [];
      const nextPivotLines: ChartPivotLine[] = [];
      const chartHeight = container.clientHeight;
      if (chartHeight <= 0) {
        setZoneBands([]);
        setPivotLineMarkers([]);
        return;
      }

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
        const rawTop = Math.min(yLow, yHigh);
        const rawBottom = Math.max(yLow, yHigh);
        if (rawBottom < 0 || rawTop > chartHeight) return;

        const top = clamp(rawTop, 0, chartHeight);
        const bottom = clamp(rawBottom, 0, chartHeight);
        const height = Math.max(4, bottom - top);
        const labelY = clamp(yCenter - 10, 8, Math.max(8, chartHeight - 26));

        nextBands.push({
          id: level.id,
          level,
          side,
          strengthGrade: levelStrengthGrade(level, index),
          strengthLabel: levelStrengthLabel(level, index),
          top,
          height,
          centerY: yCenter,
          labelY,
          alpha,
        });
      });
      visiblePivotLevels.forEach((level) => {
        const y = candleSeries.priceToCoordinate(level.price);
        if (y == null || y < 0 || y > chartHeight) return;
        nextPivotLines.push({
          id: level.id,
          level,
          y,
          labelY: clamp(y - 10, 8, Math.max(8, chartHeight - 26)),
        });
      });
      setZoneBands(nextBands);
      setPivotLineMarkers(nextPivotLines);
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
    visiblePivotLevels.forEach(renderPivotLine);

    chart.timeScale().fitContent();
    renderZoneBands();
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      const nextChartChrome = responsiveChartChrome(container.clientWidth);
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
        rightPriceScale: nextChartChrome.rightPriceScale,
        timeScale: nextChartChrome.timeScale,
      });
      scheduleZoneBandRender();
    });
    resizeObserver.observe(container);
    const handleCrosshairMove = (param: MouseEventParams) => {
      scheduleZoneBandRender();
      if (!param.point || !param.time) {
        setHoverCandle(null);
        return;
      }

      const dataItem = param.seriesData.get(candleSeries);
      const nextHover =
        dataItem && "open" in dataItem && "high" in dataItem && "low" in dataItem && "close" in dataItem
          ? candleReadoutFromData(dataItem as CandlestickData)
          : null;
      setHoverCandle(nextHover);
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleZoneBandRender);
    chart.timeScale().subscribeVisibleTimeRangeChange(scheduleZoneBandRender);
    chart.subscribeCrosshairMove(handleCrosshairMove);
    const handleChartWheel = (event: WheelEvent) => {
      event.preventDefault();
      scheduleZoneBandRender();
    };
    container.addEventListener("wheel", handleChartWheel, { passive: false });
    container.addEventListener("pointermove", scheduleZoneBandRender);
    container.addEventListener("pointerup", scheduleZoneBandRender);

    return () => {
      resizeObserver.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleZoneBandRender);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(scheduleZoneBandRender);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      container.removeEventListener("wheel", handleChartWheel);
      container.removeEventListener("pointermove", scheduleZoneBandRender);
      container.removeEventListener("pointerup", scheduleZoneBandRender);
      if (zoneFrame != null) window.cancelAnimationFrame(zoneFrame);
      setZoneBands([]);
      setPivotLineMarkers([]);
      setHoveredZoneId(null);
      setHoveredPivotId(null);
      setHoverCandle(null);
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, currentPrice, interval, visiblePivotLevels, visibleDownsideFlows, visibleUpsideFlows]);

  const levelSourceNote =
    combinedMapWarming
      ? "Reaction Map is still ranking positioning levels."
      : latestLevelTimeMs != null
      ? `Reaction Map - refreshed ${formatTimeMs(latestLevelTimeMs)}`
      : dataThroughTimeMs != null
        ? `Reaction Map - candles through ${formatTimeMs(dataThroughTimeMs)}`
        : "Reaction Map";
  const levelAvailabilityMessage = combinedMapWarming
    ? "Positioning levels need a few clean public-stream buckets before they appear."
    : reactionSupported
      ? "Reaction Map is warming up. It needs recent public stream buckets before it can rank levels."
      : "Reaction Map is limited to major liquid perps so smaller names do not show noisy pressure bands.";
  const compactStatus = reactionUnavailable || (reactionSupported && levels.length === 0)
    ? levelAvailabilityMessage
    : levelSourceNote;

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-zinc-800 bg-[#0d1016]">
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
                  {primaryReactionWindow} map
                </div>
              ) : null}
              {marketType === "perp" && selectedCandleWindow !== primaryReactionWindow ? (
                <div className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] text-sky-200">
                  {selectedCandleWindow} reaction
                </div>
              ) : null}
              {marketType === "perp" && timeframeConfluenceCount > 0 ? (
                <div className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] text-sky-200">
                  {timeframeConfluenceCount} MTF overlap
                </div>
              ) : null}
              {marketType === "perp" && visiblePivotLevels.length > 0 ? (
                <div className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-200">
                  {visiblePivotLevels.length} pivot lines
                </div>
              ) : null}
              {currentPrice != null && (
                <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                  {formatLevelPrice(currentPrice)}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap justify-start gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500 lg:justify-end">
            {marketType === "perp" ? (
              <div className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 tracking-normal text-sky-200">
                Combined
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
          className="relative isolate h-[360px] min-w-0 overflow-hidden overscroll-contain rounded-[18px] border border-zinc-800 bg-zinc-950 md:h-[430px] xl:h-[460px]"
        >
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[18px] px-6 text-center text-sm text-zinc-500">
              <div>Loading price candles...</div>
              {reactionPayload ? (
                <div className="text-[11px] text-zinc-600">Reaction zones are ready.</div>
              ) : null}
            </div>
          ) : error || candles.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[18px] px-6 text-center text-sm text-zinc-500">
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
              <div className="absolute inset-0 z-0 min-w-0 overflow-hidden rounded-[18px]">
                <div ref={chartContainerRef} className="absolute inset-0" />
              </div>
              {activeCandleReadout ? <CandleHoverLegend coin={coin} readout={activeCandleReadout} /> : null}
              <FlowZoneOverlay
                bands={zoneBands}
                highlightedZoneId={highlightedZoneId}
                tooltipZoneId={hoveredZoneId ?? selectedZoneId}
                onHover={setHoveredZoneId}
                onSelect={setSelectedZoneId}
              />
              <PivotLineOverlay
                lines={pivotLineMarkers}
                hoveredPivotId={hoveredPivotId}
                onHover={setHoveredPivotId}
              />
            </>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] leading-5 text-zinc-500">
          <span>{compactStatus}</span>
          <span className="text-zinc-600">Hover a band or pivot line for context.</span>
        </div>
        {showReactionProgress ? (
          <div className="mt-2 overflow-hidden rounded-full border border-zinc-800 bg-zinc-950" aria-label="Reaction Map levels loading">
            <div className="h-1.5 w-1/2 animate-pulse rounded-full bg-sky-400/70" />
          </div>
        ) : null}
        {hypeFundamentals ? (
          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <SectionEyebrow>HYPE Fundamentals</SectionEyebrow>
                <div className="mt-1 text-sm font-semibold text-zinc-100">{hypeFundamentals.decisionLabel}</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">
                  Public stats plus live perp context. Price trigger still rules.
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 md:justify-end">
                <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-300">
                  {hypeRegimeLabel(hypeFundamentals.regime)}
                </span>
                <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 font-mono text-[11px] text-sky-200">
                  {hypeBiasLabel(hypeFundamentals.levelBias)}
                </span>
                <span className={cn("rounded-full border px-2 py-1 font-mono text-[11px]", hypeConfidenceClass(hypeFundamentals.confidenceAdjustment))}>
                  Read {hypeFundamentals.confidenceAdjustment}
                </span>
                {hypeFundamentals.statsStale ? (
                  <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 font-mono text-[11px] text-amber-200">
                    History stale
                  </span>
                ) : null}
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <HypeFundamentalMetric
                label="7d volume"
                value={formatHypeMetric(hypeFundamentals.metrics.volume7dUsd, "usd")}
                sub={`Share ${formatHypeMetric(hypeFundamentals.metrics.volumeShare7dPct, "pct")}`}
              />
              <HypeFundamentalMetric
                label="Live day volume"
                value={formatHypeMetric(hypeFundamentals.metrics.liveDayVolumeUsd, "usd")}
                sub={`30d share ${formatHypeMetric(hypeFundamentals.metrics.volumeShare30dPct, "pct")}`}
              />
              <HypeFundamentalMetric
                label="Live OI"
                value={formatHypeMetric(hypeFundamentals.metrics.liveOpenInterestUsd, "usd")}
                sub={`7d OI ${formatHypeMetric(hypeFundamentals.metrics.openInterest7dChangePct, "pct")}`}
              />
              <HypeFundamentalMetric
                label="Funding"
                value={formatHypeMetric(hypeFundamentals.metrics.funding7dAvgApr, "pct")}
                sub={`Live APR ${formatHypeMetric(hypeFundamentals.metrics.liveFundingApr, "pct")}`}
              />
            </div>
            <div className="mt-3 grid gap-2 text-xs leading-5 text-zinc-500 md:grid-cols-3">
              {hypeFundamentals.evidence.slice(0, 3).map((item) => (
                <div key={item} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-2">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] leading-5 text-zinc-600">
              {hypeFundamentals.caveats[1]}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HypeFundamentalMetric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-[#0d1016] p-2">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-zinc-100">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-zinc-500">{sub}</div>
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

function timeframeChipText(level: SupportResistanceLevel): string | null {
  const label = timeframeLabelFor(level);
  if (!label) return null;
  const confluence = (level as ChartLevel).timeframeConfluence ?? [];
  if (timeframeRoleFor(level) === "primary" && confluence.length > 0) {
    return `${label}+`;
  }
  return label;
}

function timeframeTooltipLabel(level: SupportResistanceLevel): string | null {
  const label = timeframeLabelFor(level);
  if (!label) return null;
  if (timeframeRoleFor(level) === "context") {
    return timeframeDirectionFor(level) === "lower" ? `${label} early context` : `${label} major context`;
  }
  const confluence = (level as ChartLevel).timeframeConfluence ?? [];
  if (confluence.length > 0) return `${label} plus ${timeframeConfluenceLabel(confluence)} context`;
  return `${label} primary`;
}

function levelSourceLabel(level: SupportResistanceLevel): string {
  const hasBook = hasBookSource(level);
  const hasPositioning = hasPositioningSource(level);
  const hasTechnical = hasTechnicalConfluence(level);
  const hasTimeframe = ((level as ChartLevel).timeframeConfluence ?? []).length > 0;

  if (hasBook && hasPositioning && hasTechnical) return "Book + positioning + technical";
  if (hasBook && hasPositioning) return "Book + positioning";
  if (hasPositioning && hasTechnical) return "Positioning + technical";
  if (hasBook && hasTechnical) return "Book + technical";
  if (hasTimeframe && hasPositioning) return "Positioning + timeframe";
  if (hasPositioning) return "Positioning";
  if (hasBook) return "Book shelf";
  if (hasTechnical) return "Technical overlap";
  return "Reaction zone";
}

function strengthReadLabel(band: ChartZoneBand): string {
  const side = band.side === "upside" ? "resistance" : "support";
  return `${band.strengthLabel} ${side}`;
}

function strengthDecisionText(band: ChartZoneBand): string {
  if (band.strengthGrade === "strong") {
    return band.side === "upside"
      ? "Stacked level. Buyers need a clean hold through it."
      : "Stacked level. Sellers need a clean hold through it.";
  }
  if (band.strengthGrade === "medium") {
    return band.side === "upside"
      ? "Worth watching. Look for rejection or clean acceptance."
      : "Worth watching. Look for defense or clean acceptance below.";
  }
  if (band.level.leverageBucket === "book") {
    return "Visible shelf. Respect it only if it stays when tested.";
  }
  return "Light read. Need trigger first.";
}

function levelCaveatText(level: SupportResistanceLevel): string | null {
  const hasBook = hasBookSource(level);
  const hasPositioning = hasPositioningSource(level);
  if (hasBook && hasPositioning) return "Orders can pull; positioning is inferred.";
  if (hasBook) return "Visible orders can pull.";
  if (hasPositioning) return "Positioning is inferred.";
  return null;
}

function isTechnicalConfirmationDelayed(level: SupportResistanceLevel): boolean {
  const firstSeenAtMs = level.zoneTooltip?.firstSeenAtMs;
  const technicalConfirmedAtMs = level.zoneTooltip?.technicalConfirmedAtMs;
  if (!firstSeenAtMs || !technicalConfirmedAtMs) return false;
  return technicalConfirmedAtMs > firstSeenAtMs + 60_000;
}

function levelOriginRead(level: SupportResistanceLevel): string | null {
  if (isTechnicalConfirmationDelayed(level)) return "Positioning was already there; technical confirmation came later.";
  if (level.zoneTooltip?.carriedForward) return "Carried forward from earlier positioning evidence.";
  if (level.zoneTooltip?.firstSeenAtMs) return "Fresh positioning evidence.";
  if (level.leverageBucket === "book") return "Live book shelf.";
  return null;
}

function levelTimingRows(level: SupportResistanceLevel): Array<{ label: string; value: string }> {
  const tooltip = level.zoneTooltip;
  if (!tooltip) return [];

  const rows: Array<{ label: string; value: string }> = [];
  if (tooltip.firstSeenAtMs) rows.push({ label: "First seen", value: formatTimeMs(tooltip.firstSeenAtMs) });
  if (tooltip.lastEvidenceAtMs) rows.push({ label: "Last evidence", value: formatTimeMs(tooltip.lastEvidenceAtMs) });
  if (tooltip.technicalConfirmedAtMs) {
    const technicalPrice = tooltip.technicalPrice ? ` near ${formatLevelPrice(tooltip.technicalPrice)}` : "";
    rows.push({
      label: "Tech confirm",
      value: `${formatTimeMs(tooltip.technicalConfirmedAtMs)}${technicalPrice}`,
    });
  }
  if (tooltip.carriedForward) rows.push({ label: "State", value: "Carried forward" });

  return rows;
}

function CandleHoverLegend({ coin, readout }: { coin: string; readout: CandleHoverReadout }) {
  const positive = readout.changePct >= 0;
  const changeClass = positive ? "text-emerald-300" : "text-red-300";
  const timestamp = readout.timeMs ? formatEasternChartTick(readout.timeMs / 1000, "datetime") : null;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-[70] flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-zinc-800/90 bg-zinc-950/85 px-2.5 py-1.5 font-mono text-[11px] leading-4 text-zinc-300 shadow-lg shadow-black/30 backdrop-blur-md">
      <span className="font-semibold text-zinc-100">{coin}</span>
      <span>O {formatLevelPrice(readout.open)}</span>
      <span>H {formatLevelPrice(readout.high)}</span>
      <span>L {formatLevelPrice(readout.low)}</span>
      <span>C {formatLevelPrice(readout.close)}</span>
      <span className={changeClass}>{formatCandleChangePct(readout.changePct)}</span>
      {timestamp ? <span className="hidden text-zinc-500 md:inline">{timestamp}</span> : null}
    </div>
  );
}

function PivotLineOverlay({
  lines,
  hoveredPivotId,
  onHover,
}: {
  lines: ChartPivotLine[];
  hoveredPivotId: string | null;
  onHover: (id: string | null) => void;
}) {
  const hoveredLine = lines.find((line) => line.id === hoveredPivotId) ?? null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[65]">
      {lines.map((line) => {
        const tone = pivotTone(line.level);
        const active = hoveredPivotId === line.id;
        return (
          <button
            key={line.id}
            type="button"
            className={`pointer-events-auto absolute left-2 max-w-[calc(100%-5rem)] truncate rounded-full border bg-zinc-950/85 px-2 py-0.5 text-[10px] leading-4 shadow-lg shadow-black/25 backdrop-blur-md transition focus:outline-none focus:ring-1 focus:ring-white/40 md:left-3 ${tone.borderClass} ${tone.textClass}`}
            style={{
              top: line.labelY,
              opacity: active ? 1 : 0.82,
              transform: active ? "translateX(2px)" : "none",
            }}
            aria-label={`${pivotShortLabel(line.level)} ${formatLevelPrice(line.level.price)}`}
            onMouseEnter={() => onHover(line.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(line.id)}
            onBlur={() => onHover(null)}
          >
            {pivotShortLabel(line.level)} {formatLevelPrice(line.level.price)}
          </button>
        );
      })}
      {hoveredLine ? <PivotLineTooltip line={hoveredLine} /> : null}
    </div>
  );
}

function PivotLineTooltip({ line }: { line: ChartPivotLine }) {
  const tone = pivotTone(line.level);
  const timestamp = line.level.pivotTimeMs ? formatTimeMs(line.level.pivotTimeMs) : null;
  const evidence = line.level.evidence ?? [];

  return (
    <div
      className={`pointer-events-none absolute left-3 z-[95] w-[min(320px,calc(100%-1.5rem))] rounded-xl border bg-zinc-950/95 p-3 text-left shadow-2xl shadow-black/45 backdrop-blur-md md:left-36 ${tone.borderClass}`}
      style={{ top: `min(max(${Math.round(line.y - 58)}px, 84px), calc(100% - 132px))` }}
      role="tooltip"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-[10px] uppercase tracking-[0.16em] ${tone.textClass}`}>
            {pivotShortLabel(line.level)}
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-zinc-100">
            {formatLevelPrice(line.level.price)}
          </div>
        </div>
        {line.level.distancePct != null ? (
          <div className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
            {line.level.distancePct > 0 ? "+" : ""}
            {line.level.distancePct.toFixed(Math.abs(line.level.distancePct) < 1 ? 2 : 1)}%
          </div>
        ) : null}
      </div>
      <div className="mt-2 text-xs leading-5 text-zinc-400">
        {line.level.reason ?? "Closed-candle liquidity line."}
      </div>
      {timestamp ? <div className="mt-2 text-[11px] text-zinc-500">Formed {timestamp}</div> : null}
      {evidence.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {evidence.slice(0, 3).map((item) => (
            <span key={item} className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400">
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FlowZoneOverlay({
  bands,
  highlightedZoneId,
  tooltipZoneId,
  onHover,
  onSelect,
}: {
  bands: ChartZoneBand[];
  highlightedZoneId: string | null;
  tooltipZoneId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const tooltipBand = bands.find((band) => band.id === tooltipZoneId) ?? null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[60]">
      {bands.map((band) => {
        const tone = chartToneForLevel(band.level, band.side);
        const color = tone.rgb;
        const timeframeChip = timeframeChipText(band.level);
        const gradeBandBoost = band.strengthGrade === "strong" ? 0.022 : band.strengthGrade === "medium" ? 0.012 : 0;
        const idleBandAlpha = band.alpha * 0.045 + gradeBandBoost;
        const idleBorderAlpha = band.alpha * (band.strengthGrade === "strong" ? 0.34 : band.strengthGrade === "medium" ? 0.28 : 0.18);
        const active = highlightedZoneId === band.id;
        return (
          <div key={band.id}>
            <button
              type="button"
              data-zone-trigger="true"
              className={`pointer-events-auto absolute left-0 right-[64px] cursor-crosshair border-y border-transparent bg-transparent transition focus:outline-none focus:ring-1 focus:ring-white/40 sm:right-[76px] ${
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
              aria-label={`${formatLevelRange(band.level)} ${strengthReadLabel(band)} ${levelSourceLabel(band.level)}`}
              onClick={() => {
                onHover(band.id);
                onSelect(band.id);
              }}
              onMouseEnter={() => onHover(band.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(band.id)}
              onBlur={() => onHover(null)}
            />

            <button
              type="button"
              data-zone-trigger="true"
              className={`pointer-events-auto absolute right-16 flex max-w-[calc(100%_-_5rem)] cursor-crosshair items-center gap-1 truncate rounded-full border bg-zinc-950/80 px-2 py-0.5 text-[10px] leading-4 backdrop-blur-md focus:outline-none focus:ring-1 focus:ring-white/40 sm:right-20 sm:max-w-[132px] ${tone.borderClass} ${tone.textClass}`}
              style={{
                top: band.labelY,
                backgroundColor: `rgba(9, 9, 11, ${Math.max(0.74, 0.94 - band.alpha * 0.14)})`,
                borderColor: `rgba(${color}, ${Math.max(0.24, band.alpha * 0.58)})`,
                boxShadow: active ? `0 0 ${Math.round(10 + band.alpha * 14)}px rgba(${color}, ${band.alpha * 0.14})` : "none",
                opacity: active ? 1 : Math.max(0.5, band.alpha * 0.86),
              }}
              aria-label={`${formatLevelRange(band.level)} ${strengthReadLabel(band)} details`}
              onMouseEnter={() => onHover(band.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(band.id)}
              onBlur={() => onHover(null)}
              onClick={() => {
                onHover(band.id);
                onSelect(band.id);
              }}
            >
              <span className="shrink-0 text-zinc-500">{band.strengthLabel}</span>
              {timeframeChip ? <span className="shrink-0 text-zinc-600">{timeframeChip}</span> : null}
              <span className="truncate">{formatLevelPrice(band.level.price)}</span>
            </button>
          </div>
        );
      })}
      {tooltipBand ? <ZoneHoverTooltip band={tooltipBand} /> : null}
    </div>
  );
}

function ZoneHoverTooltip({ band }: { band: ChartZoneBand }) {
  const read = levelReadFor(band.level, band.side);
  const tooltip = band.level.zoneTooltip;
  const tone = chartToneForLevel(band.level, band.side);
  const sideLabel = tooltip?.roleLabel ?? (tooltip?.side === "bear" ? "Seller-initiated build" : tooltip?.side === "bull" ? "Buyer-initiated build" : zoneRoleLabel(band));
  const timeframeLabel = timeframeTooltipLabel(band.level);
  const sourceLabel = levelSourceLabel(band.level);
  const caveat = levelCaveatText(band.level);
  const originRead = levelOriginRead(band.level);
  const timingRows = levelTimingRows(band.level);

  return (
    <div
      data-zone-tooltip="true"
      className={`pointer-events-none absolute right-3 z-[90] w-[min(340px,calc(100%-1.5rem))] -translate-y-1/2 rounded-xl border bg-zinc-950/95 p-3 text-left shadow-2xl shadow-black/45 backdrop-blur-md sm:right-20 ${
        tone.borderClass
      }`}
      style={{ top: `min(max(${Math.round(band.centerY)}px, 118px), calc(100% - 156px))` }}
      role="tooltip"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            {timeframeLabel ? (
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-normal text-zinc-400">
                {timeframeLabel}
              </span>
            ) : null}
            <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{sourceLabel}</span>
          </div>
          <div className="mt-1 font-mono text-sm font-semibold text-zinc-100">{formatLevelRange(band.level)}</div>
          <div className="mt-1 text-[11px] text-zinc-500">{sideLabel}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono ${read.className}`}>{strengthReadLabel(band)}</span>
          <span className="font-mono text-[10px] text-zinc-500">{read.label}</span>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-300">{strengthDecisionText(band)}</p>
      {originRead ? <p className="mt-1 text-[11px] leading-4 text-amber-200/90">{originRead}</p> : null}
      {timingRows.length > 0 ? (
        <div className="mt-2 grid gap-1 rounded-lg border border-zinc-800/80 bg-zinc-900/45 p-2 text-[10px] leading-4">
          {timingRows.map((row) => (
            <div key={`${row.label}-${row.value}`} className="grid grid-cols-[82px_minmax(0,1fr)] gap-2">
              <span className="text-zinc-500">{row.label}</span>
              <span className="truncate font-mono text-zinc-300">{row.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {caveat ? <p className="mt-1 text-[11px] leading-4 text-zinc-500">{caveat}</p> : null}
    </div>
  );
}
