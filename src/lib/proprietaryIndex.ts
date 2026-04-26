import type { MarketAsset } from "@/types";

export interface HyperPulseVixResult {
  score: number; // 0..100 (0 fear, 100 greed)
  label: "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed";
  trendScore: number; // -100..100 (bearish to bullish)
  trendLabel: "Bearish" | "Neutral" | "Bullish";
  trendConfidence: "low" | "medium" | "high";
  trendInputs: {
    momentum24h: number;
    momentum48h: number;
    oiChange: number;
    fundingAPR: number;
  };
  trendWeights: {
    momentum24h: number;
    momentum48h: number;
    oiChange: number;
    fundingContrarian: number;
  };
  trendWindowHours: number;
  volatilityBreadthPct: number;
  fundingRegimeScore: number;
  breadthScore: number;
  volatilityScore: number; // fear-oriented before inversion
  maScore: number;
  upCount: number;
  oiUpCount: number;
  assetCount: number;
  longSignals: number;
  shortSignals: number;
  medianFundingApr: number;
  avgAbs24hMove: number;
  avgAbsOiMove: number;
  // Public composition metadata for UI disclosure.
  weights: {
    fundingRegime: number;
    breadth: number;
    volatility: number;
  };
  fundingSubWeights: {
    directionApr: number;
    signalBias: number;
    maRegime: number;
  };
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

function toGreedBand(
  score: number
): HyperPulseVixResult["label"] {
  if (score < 20) return "Extreme Fear";
  if (score < 40) return "Fear";
  if (score <= 60) return "Neutral";
  if (score <= 80) return "Greed";
  return "Extreme Greed";
}

function toTrendLabel(score: number): HyperPulseVixResult["trendLabel"] {
  if (Math.abs(score) < 12) return "Neutral";
  return score > 0 ? "Bullish" : "Bearish";
}

function toTrendConfidence(score: number): HyperPulseVixResult["trendConfidence"] {
  const abs = Math.abs(score);
  if (abs >= 45) return "high";
  if (abs >= 25) return "medium";
  return "low";
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function movingAverage(values: number[], window: number): number {
  if (values.length === 0) return 0;
  const start = Math.max(0, values.length - window);
  return avg(values.slice(start));
}

export function computeHyperPulseVix(args: {
  assets: MarketAsset[];
  fundingHistories: Record<string, { time: number; rate: number }[]>;
  btcCandles?: Array<{ time: number; close: number }>;
}): HyperPulseVixResult {
  const { assets, fundingHistories, btcCandles = [] } = args;

  if (assets.length === 0) {
    return {
      score: 50,
      label: "Neutral",
      trendScore: 0,
      trendLabel: "Neutral",
      trendConfidence: "low",
      trendInputs: {
        momentum24h: 0,
        momentum48h: 0,
        oiChange: 0,
        fundingAPR: 0,
      },
      trendWeights: {
        momentum24h: 0.4,
        momentum48h: 0.3,
        oiChange: 0.1,
        fundingContrarian: 0.2,
      },
      trendWindowHours: 24,
      volatilityBreadthPct: 0,
      fundingRegimeScore: 50,
      breadthScore: 50,
      volatilityScore: 50,
      maScore: 50,
      upCount: 0,
      oiUpCount: 0,
      assetCount: 0,
      longSignals: 0,
      shortSignals: 0,
      medianFundingApr: 0,
      avgAbs24hMove: 0,
      avgAbsOiMove: 0,
      weights: { fundingRegime: 0.4, breadth: 0.35, volatility: 0.25 },
      fundingSubWeights: {
        directionApr: 0.45,
        signalBias: 0.35,
        maRegime: 0.2,
      },
    };
  }

  // Funding regime
  const fundingApr = assets.map((a) => a.fundingAPR);
  const medFundingApr = median(fundingApr);
  const fundingDirectionGreed = clamp(50 + medFundingApr * 1.4);

  const longSignals = assets.filter(
    (a) => a.signal.type === "crowded-long" || a.signal.type === "extreme-longs"
  ).length;
  const shortSignals = assets.filter((a) => a.signal.type === "crowded-short").length;
  const signalBiasGreed = clamp(
    50 + ((longSignals - shortSignals) / Math.max(assets.length, 1)) * 100
  );

  // MA regime from funding history (24h MA vs 7d MA annualized APR)
  const maDiffs: number[] = [];
  for (const history of Object.values(fundingHistories)) {
    if (!history || history.length < 24) continue;
    const aprSeries = history.map((h) => h.rate * 8760 * 100);
    const ma24h = movingAverage(aprSeries, 24);
    const ma7d = movingAverage(aprSeries, 24 * 7);
    maDiffs.push(ma24h - ma7d);
  }
  const maDiff = avg(maDiffs);
  const maScore = clamp(50 + maDiff * 1.2);

  const fundingRegimeScore =
    fundingDirectionGreed * 0.45 + signalBiasGreed * 0.35 + maScore * 0.2;

  // Breadth
  const upCount = assets.filter((a) => a.priceChange24h > 0).length;
  const oiUpCount = assets.filter((a) => (a.oiChangePct ?? 0) > 0).length;
  const breadthScore = clamp(
    ((upCount / assets.length) * 100) * 0.7 +
      ((oiUpCount / assets.length) * 100) * 0.3
  );

  // Volatility breadth (fear-oriented first, then invert to greed)
  const abs24h = assets.map((a) => Math.abs(a.priceChange24h));
  const absOi = assets
    .map((a) => Math.abs(a.oiChangePct ?? 0))
    .filter((v) => Number.isFinite(v));

  const avgAbs24h = avg(abs24h);
  const avgAbsOi = avg(absOi);
  const volBreadthPct =
    (assets.filter((a) => Math.abs(a.priceChange24h) >= 6).length / assets.length) *
    100;

  const volatilityFearScore = clamp(
    (avgAbs24h / 12) * 55 + (volBreadthPct / 100) * 35 + (avgAbsOi / 8) * 10
  );
  const volatilityGreedScore = 100 - volatilityFearScore;

  const score = clamp(
    fundingRegimeScore * 0.4 + breadthScore * 0.35 + volatilityGreedScore * 0.25
  );

  const btc = assets.find((a) => a.coin === "BTC");
  const btcOiChange = btc?.oiChangePct ?? 0;
  const btcFundingAPR = btc?.fundingAPR ?? 0;
  const btc24h = btc?.priceChange24h ?? 0;

  let btc48h = btc24h;
  if (btcCandles.length >= 2) {
    const sorted = [...btcCandles].sort((a, b) => a.time - b.time);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first?.close && last?.close) {
      btc48h = ((last.close - first.close) / first.close) * 100;
    }
  }

  const fundingContrarian = clamp(-btcFundingAPR * 0.9, -35, 35);
  const momentum24hScore = clamp(btc24h * 4, -50, 50);
  const momentum48hScore = clamp(btc48h * 2.5, -40, 40);
  const oiScore = clamp(btcOiChange * 2, -30, 30);

  const trendWeights = {
    momentum24h: 0.4,
    momentum48h: 0.3,
    oiChange: 0.1,
    fundingContrarian: 0.2,
  };

  const trendScore = clamp(
    momentum24hScore * trendWeights.momentum24h +
      momentum48hScore * trendWeights.momentum48h +
      oiScore * trendWeights.oiChange +
      fundingContrarian * trendWeights.fundingContrarian,
    -100,
    100
  );

  return {
    score: Math.round(score),
    label: toGreedBand(score),
    trendScore: Math.round(trendScore),
    trendLabel: toTrendLabel(trendScore),
    trendConfidence: toTrendConfidence(trendScore),
    trendInputs: {
      momentum24h: Number(btc24h.toFixed(2)),
      momentum48h: Number(btc48h.toFixed(2)),
      oiChange: Number(btcOiChange.toFixed(2)),
      fundingAPR: Number(btcFundingAPR.toFixed(2)),
    },
    trendWeights,
    trendWindowHours: 24,
    volatilityBreadthPct: Math.round(volBreadthPct),
    fundingRegimeScore: Math.round(fundingRegimeScore),
    breadthScore: Math.round(breadthScore),
    volatilityScore: Math.round(volatilityFearScore),
    maScore: Math.round(maScore),
    upCount,
    oiUpCount,
    assetCount: assets.length,
    longSignals,
    shortSignals,
    medianFundingApr: Number(medFundingApr.toFixed(2)),
    avgAbs24hMove: Number(avgAbs24h.toFixed(2)),
    avgAbsOiMove: Number(avgAbsOi.toFixed(2)),
    weights: { fundingRegime: 0.4, breadth: 0.35, volatility: 0.25 },
    fundingSubWeights: {
      directionApr: 0.45,
      signalBias: 0.35,
      maRegime: 0.2,
    },
  };
}
