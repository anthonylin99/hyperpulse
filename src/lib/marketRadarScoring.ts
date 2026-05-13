export type RadarBetaStatus = "ready" | "fallback";

export interface RadarScoringAsset {
  coin: string;
  markPx: number;
  prevDayPx: number;
  fundingAPR: number;
  openInterestUsd: number;
  dayVolumeUsd: number;
  return1hPct?: number | null;
  return4hPct?: number | null;
  fridayHigh?: number | null;
  fridayLow?: number | null;
  btcFridayHigh?: number | null;
  btcFridayLow?: number | null;
  btcMarkPx?: number | null;
}

export interface RadarBetaInfo {
  beta: number;
  status: RadarBetaStatus;
  samples?: number;
}

export interface MomentumEdgeScoreDetails {
  score: number;
  rawReturn24hPct: number;
  btcReturn24hPct: number;
  basketReturn24hPct: number;
  btcResidualPct: number;
  basketResidualPct: number;
  structureDivergenceScore: number;
  accelerationScore: number;
  crossSectionalZ: number;
  btcBeta: number;
  betaStatus: RadarBetaStatus;
  assetAboveFridayHigh: boolean;
  assetBelowFridayLow: boolean;
  btcAboveFridayHigh: boolean;
  btcBelowFridayLow: boolean;
  return1hPct: number | null;
  return4hPct: number | null;
  volumeConfirmation: boolean;
  oiConfirmation: boolean;
}

export interface MomentumEdgeAsset extends RadarScoringAsset {
  rawReturn24hPct: number;
  btcReturn24hPct: number;
  basketReturn24hPct: number;
  btcResidualPct: number;
  basketResidualPct: number;
  rawReturnZ: number;
  btcResidualZ: number;
  basketResidualZ: number;
  structureDivergenceScore: number;
  accelerationRaw: number;
  accelerationZ: number;
  participationZ: number;
  btcBeta: number;
  betaStatus: RadarBetaStatus;
  assetAboveFridayHigh: boolean;
  assetBelowFridayLow: boolean;
  btcAboveFridayHigh: boolean;
  btcBelowFridayLow: boolean;
  return1hPct: number | null;
  return4hPct: number | null;
  volumeConfirmation: boolean;
  oiConfirmation: boolean;
  strongScore: number;
  weakScore: number;
  strongDetails: MomentumEdgeScoreDetails;
  weakDetails: MomentumEdgeScoreDetails;
}

const DEFAULT_BTC_BETA = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function robustStats(values: number[]): { center: number; scale: number } {
  const clean = values.filter(Number.isFinite);
  if (clean.length === 0) return { center: 0, scale: 1 };
  const center = median(clean);
  const mad = median(clean.map((value) => Math.abs(value - center))) * 1.4826;
  const fallbackScale = standardDeviation(clean);
  return { center, scale: Math.max(mad, fallbackScale, 0.0001) };
}

function robustZ(value: number, stats: { center: number; scale: number }): number {
  return clamp((finite(value) - stats.center) / stats.scale, -5, 5);
}

function logReturnPct(markPx: number, prevDayPx: number): number {
  if (!Number.isFinite(markPx) || !Number.isFinite(prevDayPx) || markPx <= 0 || prevDayPx <= 0) return 0;
  return Math.log(markPx / prevDayPx) * 100;
}

function liquidityWeight(asset: RadarScoringAsset): number {
  return Math.sqrt(Math.max(asset.dayVolumeUsd, 0) + Math.max(asset.openInterestUsd, 0) * 0.35);
}

function weightedAverage(values: Array<{ value: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, item) => sum + Math.max(item.weight, 0), 0);
  if (totalWeight <= 0) return average(values.map((item) => item.value));
  return values.reduce((sum, item) => sum + item.value * Math.max(item.weight, 0), 0) / totalWeight;
}

function fundingPenalty(asset: RadarScoringAsset, direction: "strong" | "weak"): number {
  if (direction === "strong" && asset.fundingAPR > 60) return clamp((asset.fundingAPR - 60) / 35, 0, 1.5);
  if (direction === "weak" && asset.fundingAPR < -40) return clamp((Math.abs(asset.fundingAPR) - 40) / 35, 0, 1.2);
  return 0;
}

function isAbove(value: number, level?: number | null): boolean {
  return Number.isFinite(value) && Number.isFinite(level) && value > Number(level) * 1.001;
}

function isBelow(value: number, level?: number | null): boolean {
  return Number.isFinite(value) && Number.isFinite(level) && value < Number(level) * 0.999;
}

function distancePct(value: number, level?: number | null): number {
  if (!Number.isFinite(value) || !Number.isFinite(level) || Number(level) <= 0) return 0;
  return ((value - Number(level)) / Number(level)) * 100;
}

function structureDivergenceScore(asset: RadarScoringAsset, direction: "strong" | "weak"): number {
  const btcMarkPx = finite(asset.btcMarkPx ?? 0, 0);
  if (direction === "strong") {
    const assetAbove = isAbove(asset.markPx, asset.fridayHigh);
    const btcAbove = isAbove(btcMarkPx, asset.btcFridayHigh);
    const assetDistance = distancePct(asset.markPx, asset.fridayHigh);
    const btcDistance = distancePct(btcMarkPx, asset.btcFridayHigh);
    let score = 0;
    if (assetAbove) score += 0.7;
    if (assetAbove && !btcAbove) score += 1.1;
    score += clamp((assetDistance - btcDistance) / 3, -0.6, 0.8);
    return clamp(score, -1.2, 2.2);
  }

  const assetBelow = isBelow(asset.markPx, asset.fridayLow);
  const btcBelow = isBelow(btcMarkPx, asset.btcFridayLow);
  const assetDistance = -distancePct(asset.markPx, asset.fridayLow);
  const btcDistance = -distancePct(btcMarkPx, asset.btcFridayLow);
  let score = 0;
  if (assetBelow) score += 0.7;
  if (assetBelow && !btcBelow) score += 1.1;
  score += clamp((assetDistance - btcDistance) / 3, -0.6, 0.8);
  return clamp(score, -1.2, 2.2);
}

function accelerationRaw(asset: RadarScoringAsset, rawReturn24hPct: number): number {
  const return1h = finite(asset.return1hPct ?? 0);
  const return4h = finite(asset.return4hPct ?? 0);
  const oneHourVsFourHourPace = return1h - return4h / 4;
  const fourHourVsDailyPace = return4h - rawReturn24hPct / 6;
  return oneHourVsFourHourPace + fourHourVsDailyPace * 0.35;
}

function buildDetails(args: {
  score: number;
  asset: MomentumEdgeAsset;
  crossSectionalZ: number;
}): MomentumEdgeScoreDetails {
  return {
    score: Number(args.score.toFixed(2)),
    rawReturn24hPct: Number(args.asset.rawReturn24hPct.toFixed(2)),
    btcReturn24hPct: Number(args.asset.btcReturn24hPct.toFixed(2)),
    basketReturn24hPct: Number(args.asset.basketReturn24hPct.toFixed(2)),
    btcResidualPct: Number(args.asset.btcResidualPct.toFixed(2)),
    basketResidualPct: Number(args.asset.basketResidualPct.toFixed(2)),
    structureDivergenceScore: Number(args.asset.structureDivergenceScore.toFixed(2)),
    accelerationScore: Number(args.asset.accelerationZ.toFixed(2)),
    crossSectionalZ: Number(args.crossSectionalZ.toFixed(2)),
    btcBeta: Number(args.asset.btcBeta.toFixed(2)),
    betaStatus: args.asset.betaStatus,
    assetAboveFridayHigh: args.asset.assetAboveFridayHigh,
    assetBelowFridayLow: args.asset.assetBelowFridayLow,
    btcAboveFridayHigh: args.asset.btcAboveFridayHigh,
    btcBelowFridayLow: args.asset.btcBelowFridayLow,
    return1hPct: args.asset.return1hPct == null ? null : Number(args.asset.return1hPct.toFixed(2)),
    return4hPct: args.asset.return4hPct == null ? null : Number(args.asset.return4hPct.toFixed(2)),
    volumeConfirmation: args.asset.volumeConfirmation,
    oiConfirmation: args.asset.oiConfirmation,
  };
}

export function computeMomentumEdges(
  assets: RadarScoringAsset[],
  betaByCoin: Record<string, RadarBetaInfo | undefined> = {},
): MomentumEdgeAsset[] {
  const liquid = assets.filter((asset) => asset.markPx > 0 && asset.prevDayPx > 0);
  if (liquid.length === 0) return [];

  const rawReturns = new Map(liquid.map((asset) => [asset.coin, logReturnPct(asset.markPx, asset.prevDayPx)]));
  const btcReturn = rawReturns.get("BTC") ?? 0;
  const basketReturn = weightedAverage(liquid.map((asset) => ({ value: rawReturns.get(asset.coin) ?? 0, weight: liquidityWeight(asset) })));
  const volumeStats = robustStats(liquid.map((asset) => Math.log10(Math.max(asset.dayVolumeUsd, 1))));
  const oiStats = robustStats(liquid.map((asset) => Math.log10(Math.max(asset.openInterestUsd, 1))));
  const rawStats = robustStats([...rawReturns.values()]);

  const base = liquid.map((asset) => {
    const rawReturn24hPct = rawReturns.get(asset.coin) ?? 0;
    const betaInfo = asset.coin === "BTC" ? { beta: 1, status: "ready" as const } : betaByCoin[asset.coin];
    const btcBeta = clamp(finite(betaInfo?.beta ?? DEFAULT_BTC_BETA, DEFAULT_BTC_BETA), -1, 4);
    const betaStatus = betaInfo?.status ?? "fallback";
    const btcResidualPct = rawReturn24hPct - btcBeta * btcReturn;
    const basketResidualPct = rawReturn24hPct - basketReturn;
    const volumeZ = robustZ(Math.log10(Math.max(asset.dayVolumeUsd, 1)), volumeStats);
    const oiZ = robustZ(Math.log10(Math.max(asset.openInterestUsd, 1)), oiStats);
    const strongStructure = structureDivergenceScore(asset, "strong");
    const weakStructure = structureDivergenceScore(asset, "weak");
    const assetAboveFridayHigh = isAbove(asset.markPx, asset.fridayHigh);
    const assetBelowFridayLow = isBelow(asset.markPx, asset.fridayLow);
    const btcAboveFridayHigh = isAbove(finite(asset.btcMarkPx ?? 0, 0), asset.btcFridayHigh);
    const btcBelowFridayLow = isBelow(finite(asset.btcMarkPx ?? 0, 0), asset.btcFridayLow);
    return {
      ...asset,
      rawReturn24hPct,
      btcReturn24hPct: btcReturn,
      basketReturn24hPct: basketReturn,
      btcResidualPct,
      basketResidualPct,
      rawReturnZ: robustZ(rawReturn24hPct, rawStats),
      btcResidualZ: 0,
      basketResidualZ: 0,
      structureDivergenceScore: strongStructure,
      weakStructureDivergenceScore: weakStructure,
      accelerationRaw: accelerationRaw(asset, rawReturn24hPct),
      accelerationZ: 0,
      participationZ: clamp((volumeZ + oiZ) / 2, -3, 3),
      btcBeta,
      betaStatus,
      assetAboveFridayHigh,
      assetBelowFridayLow,
      btcAboveFridayHigh,
      btcBelowFridayLow,
      return1hPct: asset.return1hPct ?? null,
      return4hPct: asset.return4hPct ?? null,
      volumeConfirmation: volumeZ >= 0,
      oiConfirmation: oiZ >= 0,
      strongScore: 0,
      weakScore: 0,
      strongDetails: null as never,
      weakDetails: null as never,
    };
  });

  const btcResidualStats = robustStats(base.map((asset) => asset.btcResidualPct));
  const basketResidualStats = robustStats(base.map((asset) => asset.basketResidualPct));
  const accelerationStats = robustStats(base.map((asset) => asset.accelerationRaw));

  return base.map((asset) => {
    const btcResidualZ = robustZ(asset.btcResidualPct, btcResidualStats);
    const basketResidualZ = robustZ(asset.basketResidualPct, basketResidualStats);
    const accelerationZ = robustZ(asset.accelerationRaw, accelerationStats);
    const strongScore =
      0.3 * btcResidualZ +
      0.2 * basketResidualZ +
      0.15 * asset.rawReturnZ +
      0.2 * asset.structureDivergenceScore +
      0.1 * accelerationZ +
      0.05 * asset.participationZ -
      fundingPenalty(asset, "strong");
    const weakScore =
      0.3 * -btcResidualZ +
      0.2 * -basketResidualZ +
      0.15 * -asset.rawReturnZ +
      0.2 * asset.weakStructureDivergenceScore +
      0.1 * -accelerationZ +
      0.05 * asset.participationZ -
      fundingPenalty(asset, "weak");
    const next = {
      ...asset,
      btcResidualZ,
      basketResidualZ,
      accelerationZ,
      strongScore,
      weakScore,
    };
    return {
      ...next,
      strongDetails: buildDetails({ score: strongScore, asset: next, crossSectionalZ: btcResidualZ }),
      weakDetails: buildDetails({
        score: weakScore,
        asset: { ...next, structureDivergenceScore: next.weakStructureDivergenceScore },
        crossSectionalZ: -btcResidualZ,
      }),
    };
  });
}

export function selectMomentumEdges(args: {
  assets: MomentumEdgeAsset[];
  direction: "strong" | "weak";
  limit: number;
  threshold?: number;
}): MomentumEdgeAsset[] {
  const threshold = args.threshold ?? 0.75;
  return [...args.assets]
    .filter((asset) => {
      if (args.direction === "strong") {
        const beatsBtc = asset.coin === "BTC" ? asset.basketResidualPct > 0 : asset.btcResidualPct > 0;
        return asset.rawReturn24hPct > 0 && asset.basketResidualPct > 0 && beatsBtc && asset.strongScore >= threshold;
      }
      const lagsBtc = asset.coin === "BTC" ? asset.basketResidualPct < -0.25 : asset.btcResidualPct < -0.25;
      const lagsBasket = asset.basketResidualPct < -0.25;
      const hasDownsidePressure = asset.rawReturn24hPct < 0 || asset.btcResidualPct < -1 || asset.basketResidualPct < -1;
      return lagsBasket && lagsBtc && hasDownsidePressure && asset.weakScore >= threshold;
    })
    .sort((a, b) => (args.direction === "strong" ? b.strongScore - a.strongScore : b.weakScore - a.weakScore))
    .slice(0, args.limit);
}
