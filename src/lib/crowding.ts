import { getFundingRegime, type FundingRegime } from "./fundingRegime.ts";
import { getAssetCategory } from "./constants.ts";
import type { MarketAsset } from "../types/index.ts";

export type PositioningStressSide = "longs_crowded" | "shorts_crowded" | "two_sided" | "none";
export type PositioningStressSeverity = "low" | "medium" | "high" | "extreme";
export type PositioningStressStatus = "actionable_watch" | "watch_only" | "no_edge";
export type OiRegime = "long_build" | "short_build" | "deleveraging" | "stale_carry" | "neutral";

export type PositioningStressAlert = {
  asset: string;
  displayName: string;
  category: ReturnType<typeof getAssetCategory>;
  side: PositioningStressSide;
  severity: PositioningStressSeverity;
  status: PositioningStressStatus;
  score: number;
  label: string;
  decision: string;
  fundingApr: number;
  fundingPercentile: number | null;
  fundingMeanApr: number | null;
  openInterestUsd: number;
  oiChangePct: number | null;
  priceChange24h: number;
  volume24hUsd: number;
  volumeVsAvg: number | null;
  markPx: number;
  triggerLevel: number | null;
  invalidationLevel: number | null;
  oiRegime: OiRegime;
  components: {
    fundingStress: number;
    fundingPersistence: number;
    oiPressure: number;
    priceConfirmation: number;
    volumeConfirmation: number;
    categoryRisk: number;
  };
  evidence: string[];
  missingData: string[];
  updatedAt: number;
};

export type CrowdingDeskPayload = {
  generatedAt: number;
  alerts: PositioningStressAlert[];
  methodology: string;
};

export type FundingPoint = { time: number; rate: number };

const EXTREME_FUNDING_APR = 100;
const HIGH_FUNDING_APR = 50;
const ELEVATED_FUNDING_APR = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatPct(value: number): string {
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  if (Math.abs(value) >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function fundingPersistence(history: FundingPoint[] | undefined, currentApr: number): number {
  if (!history || history.length === 0) return 0;
  const sign = currentApr >= 0 ? 1 : -1;
  const recent = history.slice(-24);
  if (recent.length === 0) return 0;
  const elevated = recent.filter((point) => {
    const apr = point.rate * 8760 * 100;
    return Math.sign(apr || sign) === sign && Math.abs(apr) >= ELEVATED_FUNDING_APR;
  }).length;
  return clamp((elevated / recent.length) * 18, 0, 18);
}

function fundingStressScore(regime: FundingRegime): number {
  const absApr = Math.abs(regime.currentAPR);
  const aprScore =
    absApr >= EXTREME_FUNDING_APR
      ? 32
      : absApr >= HIGH_FUNDING_APR
        ? 24
        : absApr >= ELEVATED_FUNDING_APR
          ? 14
          : absApr >= 10
            ? 8
            : 0;
  const percentile = regime.percentile;
  const percentileScore =
    percentile == null
      ? 4
      : percentile >= 95 || percentile <= 5
        ? 16
        : percentile >= 80 || percentile <= 20
          ? 10
          : 0;
  return clamp(aprScore + percentileScore, 0, 42);
}

function inferOiRegime(asset: MarketAsset, side: PositioningStressSide): OiRegime {
  const oiChange = asset.oiChangePct ?? 0;
  const priceChange = asset.priceChange24h;
  if (oiChange <= -4) return "deleveraging";
  if (Math.abs(oiChange) < 1.2 && Math.abs(asset.fundingAPR) >= HIGH_FUNDING_APR) return "stale_carry";
  if (side === "longs_crowded" && oiChange > 2 && priceChange >= 0) return "long_build";
  if (side === "shorts_crowded" && oiChange > 2 && priceChange <= 0) return "short_build";
  return "neutral";
}

function oiPressureScore(asset: MarketAsset, side: PositioningStressSide): number {
  const oiChange = asset.oiChangePct ?? 0;
  if (oiChange <= -6) return 3;
  if (side === "longs_crowded") {
    if (oiChange > 6 && asset.priceChange24h <= 0) return 18;
    if (oiChange > 3) return 12;
    if (oiChange > 1) return 7;
  }
  if (side === "shorts_crowded") {
    if (oiChange > 6 && asset.priceChange24h >= 0) return 18;
    if (oiChange > 3) return 12;
    if (oiChange > 1) return 7;
  }
  return Math.abs(asset.fundingAPR) >= HIGH_FUNDING_APR ? 4 : 0;
}

function priceConfirmationScore(asset: MarketAsset, side: PositioningStressSide): number {
  const change = asset.priceChange24h;
  if (side === "longs_crowded") {
    if (change <= -6) return 22;
    if (change <= -2) return 16;
    if (change <= 1) return 9;
    if (change >= 8) return -8;
  }
  if (side === "shorts_crowded") {
    if (change >= 6) return 22;
    if (change >= 2) return 16;
    if (change >= -1) return 9;
    if (change <= -8) return -8;
  }
  return 0;
}

function categoryRiskScore(asset: MarketAsset): number {
  const category = getAssetCategory(asset.coin);
  if (asset.marketType === "hip3_perp" && category === "Equities") return 8;
  if (asset.marketType === "hip3_perp") return 5;
  return 0;
}

function volumeConfirmationScore(volumeVsAvg: number | null | undefined): number {
  if (volumeVsAvg == null || !Number.isFinite(volumeVsAvg)) return 0;
  if (volumeVsAvg >= 2) return 8;
  if (volumeVsAvg >= 1.3) return 5;
  if (volumeVsAvg < 0.7) return -3;
  return 0;
}

function severityFor(score: number): PositioningStressSeverity {
  if (score >= 78) return "extreme";
  if (score >= 62) return "high";
  if (score >= 46) return "medium";
  return "low";
}

function statusFor(score: number, priceScore: number, oiScore: number): PositioningStressStatus {
  if (score < 42) return "no_edge";
  if (priceScore >= 12 || oiScore >= 12) return "actionable_watch";
  return "watch_only";
}

function levelFor(asset: MarketAsset, side: PositioningStressSide, kind: "trigger" | "invalidation"): number | null {
  if (!Number.isFinite(asset.markPx) || asset.markPx <= 0) return null;
  const prev = Number.isFinite(asset.prevDayPx) && asset.prevDayPx > 0 ? asset.prevDayPx : asset.markPx;
  if (side === "longs_crowded") {
    return kind === "trigger"
      ? Math.min(asset.markPx, prev) * 0.99
      : Math.max(asset.markPx, prev) * 1.015;
  }
  if (side === "shorts_crowded") {
    return kind === "trigger"
      ? Math.max(asset.markPx, prev) * 1.01
      : Math.min(asset.markPx, prev) * 0.985;
  }
  return null;
}

function labelFor(side: PositioningStressSide, status: PositioningStressStatus): string {
  if (side === "longs_crowded") return status === "actionable_watch" ? "Crowded long unwind" : "Expensive long";
  if (side === "shorts_crowded") return status === "actionable_watch" ? "Crowded short squeeze" : "Expensive short";
  return "No crowd edge";
}

function decisionFor(asset: MarketAsset, side: PositioningStressSide, status: PositioningStressStatus): string {
  if (side === "longs_crowded") {
    if (status === "actionable_watch") return `Do not chase long. Watch for forced selling below ${formatUsd(levelFor(asset, side, "trigger") ?? asset.markPx)}.`;
    return "Long side is paying up. Treat longs as watch-only until price proves strength.";
  }
  if (side === "shorts_crowded") {
    if (status === "actionable_watch") return `Do not chase short. Watch for squeeze continuation above ${formatUsd(levelFor(asset, side, "trigger") ?? asset.markPx)}.`;
    return "Short side is paying up. Treat shorts as watch-only until price proves weakness.";
  }
  return "No clean positioning stress edge.";
}

export function buildPositioningStressAlert(args: {
  asset: MarketAsset;
  fundingHistory?: FundingPoint[];
  volumeVsAvg?: number | null;
  now?: number;
}): PositioningStressAlert {
  const { asset, fundingHistory, volumeVsAvg = null } = args;
  const now = args.now ?? Date.now();
  const regime = getFundingRegime(asset.fundingRate, fundingHistory);
  const absApr = Math.abs(regime.currentAPR);
  const side: PositioningStressSide =
    absApr < 8
      ? "none"
      : regime.currentAPR > 0
        ? "longs_crowded"
        : "shorts_crowded";
  const components = {
    fundingStress: fundingStressScore(regime),
    fundingPersistence: fundingPersistence(fundingHistory, regime.currentAPR),
    oiPressure: oiPressureScore(asset, side),
    priceConfirmation: priceConfirmationScore(asset, side),
    volumeConfirmation: volumeConfirmationScore(volumeVsAvg),
    categoryRisk: categoryRiskScore(asset),
  };
  const score = clamp(
    Object.values(components).reduce((sum, value) => sum + value, 0),
    0,
    100,
  );
  const status = statusFor(score, components.priceConfirmation, components.oiPressure);
  const oiRegime = inferOiRegime(asset, side);
  const severity = severityFor(score);
  const missingData = ["wallet cohort split unavailable in v1"];
  if (!fundingHistory || fundingHistory.length < 12) missingData.push("short funding history");
  if (asset.oiChangePct == null) missingData.push("OI change unavailable");
  if (volumeVsAvg == null) missingData.push("relative volume unavailable");

  const evidence = [
    `${side === "longs_crowded" ? "Longs" : side === "shorts_crowded" ? "Shorts" : "No side"} paying ${formatPct(regime.currentAPR)} APR.`,
    regime.percentile == null ? "Funding percentile unavailable." : `Funding sits in the ${regime.percentile.toFixed(0)}th percentile of recent history.`,
    `24h price move ${formatPct(asset.priceChange24h)}; OI ${asset.oiChangePct == null ? "n/a" : formatPct(asset.oiChangePct)}.`,
    `${formatUsd(asset.openInterest)} open interest, ${formatUsd(asset.dayVolume)} 24h volume.`,
  ];

  return {
    asset: asset.coin,
    displayName: asset.displayName,
    category: getAssetCategory(asset.coin),
    side,
    severity,
    status,
    score: roundScore(score),
    label: labelFor(side, status),
    decision: decisionFor(asset, side, status),
    fundingApr: regime.currentAPR,
    fundingPercentile: regime.percentile,
    fundingMeanApr: regime.meanAPR,
    openInterestUsd: asset.openInterest,
    oiChangePct: asset.oiChangePct,
    priceChange24h: asset.priceChange24h,
    volume24hUsd: asset.dayVolume,
    volumeVsAvg,
    markPx: asset.markPx,
    triggerLevel: levelFor(asset, side, "trigger"),
    invalidationLevel: levelFor(asset, side, "invalidation"),
    oiRegime,
    components,
    evidence,
    missingData,
    updatedAt: now,
  };
}

export function rankPositioningStressAlerts(alerts: PositioningStressAlert[], limit = 5): PositioningStressAlert[] {
  return [...alerts]
    .filter((alert) => alert.side !== "none" && alert.status !== "no_edge")
    .sort((a, b) => {
      const severityRank: Record<PositioningStressSeverity, number> = { extreme: 4, high: 3, medium: 2, low: 1 };
      const rankDelta = severityRank[b.severity] - severityRank[a.severity];
      if (rankDelta !== 0) return rankDelta;
      return b.score - a.score;
    })
    .slice(0, limit);
}
