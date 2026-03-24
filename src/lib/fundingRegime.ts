export interface FundingRegime {
  currentAPR: number;
  meanAPR: number | null;
  percentile: number | null;
  label: string;
  tone: "green" | "red" | "gray";
}

function percentileRank(sortedValues: number[], value: number): number {
  if (sortedValues.length === 0) return 50;
  let count = 0;
  for (const v of sortedValues) {
    if (v <= value) count += 1;
  }
  return (count / sortedValues.length) * 100;
}

export function getFundingRegime(
  currentFundingRate: number,
  history?: { time: number; rate: number }[]
): FundingRegime {
  const currentAPR = currentFundingRate * 8760 * 100;
  if (!history || history.length < 12) {
    return {
      currentAPR,
      meanAPR: null,
      percentile: null,
      label: "Insufficient history",
      tone: "gray",
    };
  }

  const historyApr = history.map((p) => p.rate * 8760 * 100);
  const meanAPR = historyApr.reduce((sum, v) => sum + v, 0) / historyApr.length;
  const sorted = [...historyApr].sort((a, b) => a - b);
  const percentile = percentileRank(sorted, currentAPR);

  if (percentile >= 95) {
    return {
      currentAPR,
      meanAPR,
      percentile,
      label: "Extremely high vs history",
      tone: "red",
    };
  }
  if (percentile >= 80) {
    return {
      currentAPR,
      meanAPR,
      percentile,
      label: "High vs history",
      tone: "red",
    };
  }
  if (percentile <= 5) {
    return {
      currentAPR,
      meanAPR,
      percentile,
      label: "Extremely low vs history",
      tone: "green",
    };
  }
  if (percentile <= 20) {
    return {
      currentAPR,
      meanAPR,
      percentile,
      label: "Low vs history",
      tone: "green",
    };
  }
  return {
    currentAPR,
    meanAPR,
    percentile,
    label: "Near historical normal",
    tone: "gray",
  };
}
