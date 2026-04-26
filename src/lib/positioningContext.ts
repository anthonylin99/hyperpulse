import type { MarketAsset } from "@/types";
import type { FundingRegime } from "@/lib/fundingRegime";

export interface OrderbookLevel {
  px: number;
  sz: number;
  n?: number;
}

export interface OrderbookSnapshot {
  bestBid: number | null;
  bestAsk: number | null;
  spreadBps: number | null;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

export interface PositioningContext {
  label: "Crowded long risk" | "Crowded short risk" | "Leverage elevated" | "Balanced tape";
  confidence: "low" | "medium" | "high";
  crowdingScore: number;
  squeezeSide: "Downside risk" | "Upside squeeze risk" | "Two-way" | "None";
  riskNote: string;
  volumeOiRatio: number | null;
  topBookImbalancePct: number | null;
  bidDepthUsd: number | null;
  askDepthUsd: number | null;
  bullets: string[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function compactUsd(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function depthUsd(levels: OrderbookLevel[] | undefined, limit = 5) {
  if (!levels || levels.length === 0) return null;
  const value = levels
    .slice(0, limit)
    .reduce((sum, level) => sum + level.px * level.sz, 0);
  return Number.isFinite(value) ? value : null;
}

function confidenceFrom(score: number, hasHistory: boolean): PositioningContext["confidence"] {
  if (!hasHistory) return score >= 65 ? "medium" : "low";
  if (score >= 72) return "high";
  if (score >= 48) return "medium";
  return "low";
}

export function computePositioningContext({
  asset,
  fundingRegime,
  orderbook,
}: {
  asset: MarketAsset;
  fundingRegime: FundingRegime;
  orderbook?: OrderbookSnapshot | null;
}): PositioningContext {
  const fundingPercentile = fundingRegime.percentile;
  const hasHistory = fundingPercentile != null;
  const oiDelta = asset.oiChangePct;
  const oiTurnover =
    asset.openInterest > 0 && Number.isFinite(asset.dayVolume)
      ? asset.dayVolume / asset.openInterest
      : null;

  const fundingAbs = Math.abs(asset.fundingAPR);
  const fundingPressure = clamp(fundingAbs / 35, 0, 1) * 35;
  const percentilePressure =
    fundingPercentile == null ? 10 : (Math.abs(fundingPercentile - 50) / 50) * 28;
  const oiPressure = oiDelta == null ? 0 : clamp(Math.abs(oiDelta) / 3, 0, 1) * 12;
  const leveragePressure = clamp((asset.maxLeverage - 20) / 80, 0, 1) * 15;
  const turnoverPressure = oiTurnover == null ? 0 : clamp(oiTurnover / 2, 0, 1) * 10;
  const crowdingScore = Math.round(
    clamp(fundingPressure + percentilePressure + oiPressure + leveragePressure + turnoverPressure, 0, 100),
  );

  const signalType = asset.signal.type;
  const longFunding = asset.fundingAPR > 8 || (fundingPercentile != null && fundingPercentile >= 80);
  const shortFunding = asset.fundingAPR < -8 || (fundingPercentile != null && fundingPercentile <= 20);
  const longSignal = signalType === "crowded-long" || signalType === "extreme-longs";
  const shortSignal = signalType === "crowded-short";
  const weakConfirmation = Math.abs(asset.priceChange24h) < 1.25;

  let label: PositioningContext["label"] = "Balanced tape";
  let squeezeSide: PositioningContext["squeezeSide"] = "None";

  if ((longFunding || longSignal) && crowdingScore >= 45) {
    label = "Crowded long risk";
    squeezeSide = "Downside risk";
  } else if ((shortFunding || shortSignal) && crowdingScore >= 45) {
    label = "Crowded short risk";
    squeezeSide = "Upside squeeze risk";
  } else if (crowdingScore >= 55 || (asset.maxLeverage >= 50 && fundingAbs >= 5)) {
    label = "Leverage elevated";
    squeezeSide = "Two-way";
  }

  const bidDepthUsd = depthUsd(orderbook?.bids);
  const askDepthUsd = depthUsd(orderbook?.asks);
  const totalDepth = (bidDepthUsd ?? 0) + (askDepthUsd ?? 0);
  const topBookImbalancePct =
    bidDepthUsd != null && askDepthUsd != null && totalDepth > 0
      ? ((bidDepthUsd - askDepthUsd) / totalDepth) * 100
      : null;

  const bullets: string[] = [];
  if (fundingPercentile != null) {
    bullets.push(`Funding is in the ${fundingPercentile.toFixed(0)}th percentile vs recent history.`);
  } else {
    bullets.push("Funding history is thin, so the read leans on current APR and live market context.");
  }
  if (oiDelta != null) {
    bullets.push(`Latest OI tick is ${signed(oiDelta)}; treat it as live confirmation, not a 4h trend.`);
  }
  if (oiTurnover != null) {
    bullets.push(`24h volume is ${oiTurnover.toFixed(1)}x current OI, a proxy for tape activity.`);
  }
  if (topBookImbalancePct != null) {
    const lean = topBookImbalancePct >= 0 ? "bid" : "ask";
    bullets.push(`Top book leans ${lean} by ${Math.abs(topBookImbalancePct).toFixed(0)}% across visible levels.`);
  }
  if (weakConfirmation && label !== "Balanced tape") {
    bullets.push("Price is not strongly confirming, so crowded positioning can become fragile.");
  }

  const riskNote =
    label === "Crowded long risk"
      ? "Funding and tape context suggest longs are paying up. Treat this as downside fragility, not a short signal."
      : label === "Crowded short risk"
        ? "Negative funding suggests shorts are crowded. Treat this as squeeze risk, not a guaranteed long setup."
        : label === "Leverage elevated"
          ? "Leverage inputs are elevated, but side is not clean. Watch for forced moves both ways."
          : "No clear leverage imbalance from current Hyperliquid inputs.";

  return {
    label,
    confidence: confidenceFrom(crowdingScore, hasHistory),
    crowdingScore,
    squeezeSide,
    riskNote,
    volumeOiRatio: oiTurnover,
    topBookImbalancePct,
    bidDepthUsd,
    askDepthUsd,
    bullets: bullets.slice(0, 4),
  };
}

export function formatPositioningDepth(value: number | null): string {
  return value == null ? "n/a" : compactUsd(value);
}
