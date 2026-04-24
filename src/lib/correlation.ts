import type { CorrelationMatrixEntry, DailyMarketPrice } from "@/types";

export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;

  const n = xs.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let index = 0; index < n; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  if (denomX === 0 || denomY === 0) return null;
  return numerator / Math.sqrt(denomX * denomY);
}

export function buildDailyReturnMap(prices: DailyMarketPrice[]): Map<string, number> {
  const sorted = [...prices].sort((a, b) => a.day.localeCompare(b.day));
  const returns = new Map<string, number>();

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous.close <= 0 || current.close <= 0) continue;
    returns.set(current.day, (current.close - previous.close) / previous.close);
  }

  return returns;
}

export function computeCorrelationMatrix(args: {
  assets: string[];
  pricesByAsset: Record<string, DailyMarketPrice[]>;
  minSamples?: number;
}): CorrelationMatrixEntry[] {
  const { assets, pricesByAsset, minSamples = 30 } = args;
  const returnsByAsset = new Map<string, Map<string, number>>();

  for (const asset of assets) {
    returnsByAsset.set(asset, buildDailyReturnMap(pricesByAsset[asset] ?? []));
  }

  const matrix: CorrelationMatrixEntry[] = [];

  for (const assetA of assets) {
    for (const assetB of assets) {
      if (assetA === assetB) {
        matrix.push({
          assetA,
          assetB,
          correlation: 1,
          samples: returnsByAsset.get(assetA)?.size ?? 0,
        });
        continue;
      }

      const returnsA = returnsByAsset.get(assetA) ?? new Map<string, number>();
      const returnsB = returnsByAsset.get(assetB) ?? new Map<string, number>();
      const xs: number[] = [];
      const ys: number[] = [];

      for (const [day, returnA] of returnsA.entries()) {
        const returnB = returnsB.get(day);
        if (returnB == null) continue;
        xs.push(returnA);
        ys.push(returnB);
      }

      matrix.push({
        assetA,
        assetB,
        correlation: xs.length >= minSamples ? pearsonCorrelation(xs, ys) : null,
        samples: xs.length,
      });
    }
  }

  return matrix;
}
