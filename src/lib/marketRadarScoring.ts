export type RadarBetaStatus = "ready" | "fallback";

export interface RadarScoringAsset {
  coin: string;
  markPx: number;
  prevDayPx: number;
  fundingAPR: number;
  openInterestUsd: number;
  dayVolumeUsd: number;
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
  crossSectionalZ: number;
  btcBeta: number;
  betaStatus: RadarBetaStatus;
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
  participationZ: number;
  btcBeta: number;
  betaStatus: RadarBetaStatus;
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
    crossSectionalZ: Number(args.crossSectionalZ.toFixed(2)),
    btcBeta: Number(args.asset.btcBeta.toFixed(2)),
    betaStatus: args.asset.betaStatus,
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
      participationZ: clamp((volumeZ + oiZ) / 2, -3, 3),
      btcBeta,
      betaStatus,
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

  return base.map((asset) => {
    const btcResidualZ = robustZ(asset.btcResidualPct, btcResidualStats);
    const basketResidualZ = robustZ(asset.basketResidualPct, basketResidualStats);
    const strongScore =
      0.4 * btcResidualZ +
      0.3 * basketResidualZ +
      0.2 * asset.rawReturnZ +
      0.1 * asset.participationZ -
      fundingPenalty(asset, "strong");
    const weakScore =
      0.4 * -btcResidualZ +
      0.3 * -basketResidualZ +
      0.2 * -asset.rawReturnZ +
      0.1 * asset.participationZ -
      fundingPenalty(asset, "weak");
    const next = {
      ...asset,
      btcResidualZ,
      basketResidualZ,
      strongScore,
      weakScore,
    };
    return {
      ...next,
      strongDetails: buildDetails({ score: strongScore, asset: next, crossSectionalZ: btcResidualZ }),
      weakDetails: buildDetails({ score: weakScore, asset: next, crossSectionalZ: -btcResidualZ }),
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
