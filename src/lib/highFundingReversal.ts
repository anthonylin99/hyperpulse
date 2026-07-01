import type { HighFundingReversalCandidate, HighFundingReversalReport } from "@/types";

export const HIGH_FUNDING_REVERSAL_UNIVERSE = ["BTC", "ETH", "SOL", "HYPE", "AAVE", "BNB", "TAO", "ONDO"];

export const HIGH_FUNDING_REVERSAL_RULE = {
  side: "short" as const,
  fundingZ7dMin: 1,
  fundingAprMin: 25,
  return24hMin: 0.5,
  takeProfitPct: 0.8,
  stopLossPct: 2,
  timeStopHours: 8,
  cooldownHours: 4,
};

export const HIGH_FUNDING_REVERSAL_MEMO_EVIDENCE = {
  fullSampleTrades: 115,
  fullSampleWinRatePct: 71.3,
  fullSampleAvgNetBps: 3.1,
  fullSampleProfitFactor: 1.07,
  shortSideTrades: 23,
  shortSideWinRatePct: 82.6,
  shortSideAvgNetBps: 19.5,
  shortSideProfitFactor: 1.53,
};

export const HIGH_FUNDING_REVERSAL_PASS_GATES = [
  "45 calendar days and at least 50 frozen-rule signals.",
  "Average net return > +5 bps per paper trade.",
  "Profit factor >= 1.25 with max drawdown <= 5%.",
  "Median round-trip cost <= 18 bps.",
  "No single asset contributes more than 40% of paper P&L.",
];

export const HIGH_FUNDING_REVERSAL_CAVEATS = [
  "Research proposal only: the full-sample edge was thin and train-period expectancy was negative.",
  "The strongest historical result was concentrated in May 2026, so regime dependence is a real risk.",
  "The setup fades crowded long funding after a rally; it is not a general short signal.",
  "No live capital until the frozen rule passes forward validation.",
];

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function formatPct(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function fundingZScore7d(fundingRates: number[]): number | null {
  const clean = fundingRates.filter(Number.isFinite).slice(-24 * 7);
  if (clean.length < 48) return null;
  const current = clean[clean.length - 1];
  const prior = clean.slice(0, -1);
  const stdev = standardDeviation(prior);
  if (stdev <= 0) return null;
  return (current - average(prior)) / stdev;
}

export function evaluateHighFundingReversalCandidate(args: {
  asset: string;
  markPx: number | null;
  prevDayPx: number | null;
  fundingApr: number | null;
  fundingRates: number[];
}): HighFundingReversalCandidate {
  const asset = args.asset.toUpperCase();
  const fundingZ7d = fundingZScore7d(args.fundingRates);
  const markPx = args.markPx;
  const prevDayPx = args.prevDayPx;
  const return24hPct =
    markPx != null && prevDayPx != null && markPx > 0 && prevDayPx > 0
      ? ((markPx - prevDayPx) / prevDayPx) * 100
      : null;

  const base = {
    asset,
    markPx,
    return24hPct,
    fundingApr: args.fundingApr,
    fundingZ7d,
    fundingSampleSize: args.fundingRates.filter(Number.isFinite).length,
    targetPrice: markPx == null ? null : markPx * (1 - HIGH_FUNDING_REVERSAL_RULE.takeProfitPct / 100),
    stopPrice: markPx == null ? null : markPx * (1 + HIGH_FUNDING_REVERSAL_RULE.stopLossPct / 100),
    timeStopHours: HIGH_FUNDING_REVERSAL_RULE.timeStopHours,
  };

  if (markPx == null || args.fundingApr == null || return24hPct == null) {
    return {
      ...base,
      status: "market_unavailable",
      reason: "Missing mark, previous-day price, or funding context.",
    };
  }

  if (fundingZ7d == null) {
    return {
      ...base,
      status: "funding_history_thin",
      reason: "Needs enough 7d funding history to compute the frozen z-score.",
    };
  }

  if (fundingZ7d <= HIGH_FUNDING_REVERSAL_RULE.fundingZ7dMin || args.fundingApr <= HIGH_FUNDING_REVERSAL_RULE.fundingAprMin) {
    return {
      ...base,
      status: "funding_not_extreme",
      reason: `Funding not extreme enough: ${formatPct(args.fundingApr)} APR, z ${fundingZ7d.toFixed(2)}.`,
    };
  }

  if (return24hPct <= HIGH_FUNDING_REVERSAL_RULE.return24hMin) {
    return {
      ...base,
      status: "price_not_extended",
      reason: `Price has not rallied enough for the fade setup: 24h ${formatPct(return24hPct)}.`,
    };
  }

  return {
    ...base,
    status: "eligible",
    reason: `Shadow short candidate: funding ${formatPct(args.fundingApr)} APR, z ${fundingZ7d.toFixed(2)}, 24h ${formatPct(return24hPct)}.`,
  };
}

export function buildHighFundingReversalReport(candidates: HighFundingReversalCandidate[]): HighFundingReversalReport {
  const generatedAt = Date.now();
  const ordered = [...candidates].sort((a, b) => {
    if (a.status === "eligible" && b.status !== "eligible") return -1;
    if (b.status === "eligible" && a.status !== "eligible") return 1;
    return (b.fundingZ7d ?? -Infinity) - (a.fundingZ7d ?? -Infinity);
  });

  return {
    id: `high-funding-reversal-${new Date(generatedAt).toISOString().slice(0, 10)}`,
    generatedAt,
    title: "High-Funding Short Reversal",
    status: "shadow_only",
    universe: HIGH_FUNDING_REVERSAL_UNIVERSE,
    candidates: ordered,
    eligible: ordered.filter((candidate) => candidate.status === "eligible"),
    rule: HIGH_FUNDING_REVERSAL_RULE,
    memoEvidence: HIGH_FUNDING_REVERSAL_MEMO_EVIDENCE,
    passGates: HIGH_FUNDING_REVERSAL_PASS_GATES,
    caveats: HIGH_FUNDING_REVERSAL_CAVEATS,
  };
}
