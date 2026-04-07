import type {
  FactorContributor,
  FactorHolding,
  FactorPerformanceWindow,
  FactorSnapshot,
  FactorTradeCandidate,
  LiveFactorState,
  MarketAsset,
} from "@/types";

export interface ArtemisPricePoint {
  date: string;
  val: number;
}

export interface ArtemisPriceResponse {
  data: {
    symbols: Record<string, Record<string, ArtemisPricePoint[]>>;
  };
}

export type ArtemisPriceMap = Record<string, ArtemisPricePoint[]>;

const WINDOW_DAYS = [1, 7, 30] as const;

function daysBetween(dateString: string, now: Date = new Date()): number {
  const start = new Date(`${dateString}T00:00:00Z`).getTime();
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function normalizedWeights(holdings: FactorHolding[]): number[] {
  const sum = holdings.reduce((total, holding) => total + (holding.weight ?? 0), 0);
  if (sum > 0) {
    return holdings.map((holding) => (holding.weight ?? 0) / sum);
  }
  const equal = holdings.length > 0 ? 1 / holdings.length : 0;
  return holdings.map(() => equal);
}

function getSeries(prices: ArtemisPriceMap, symbol: string): ArtemisPricePoint[] {
  return prices[symbol.toUpperCase()] ?? prices[symbol.toLowerCase()] ?? [];
}

function getLatestValue(series: ArtemisPricePoint[]): number | null {
  return series.length > 0 ? series[series.length - 1].val : null;
}

function getValueAtOrBefore(series: ArtemisPricePoint[], targetDate: string): number | null {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index].date <= targetDate) {
      return series[index].val;
    }
  }
  return null;
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function computeReturn(series: ArtemisPricePoint[], days: number): number | null {
  const end = getLatestValue(series);
  const start = getValueAtOrBefore(series, isoDaysAgo(days));
  if (start == null || end == null || start <= 0) return null;
  return ((end - start) / start) * 100;
}

function computeWeightedLegReturn(
  holdings: FactorHolding[],
  prices: ArtemisPriceMap,
  days: number,
): number | null {
  if (holdings.length === 0) return 0;

  const weights = normalizedWeights(holdings);
  let weighted = 0;
  let usedWeight = 0;

  holdings.forEach((holding, index) => {
    const value = computeReturn(getSeries(prices, holding.symbol), days);
    if (value == null) return;
    weighted += value * weights[index];
    usedWeight += weights[index];
  });

  if (usedWeight === 0) return null;
  return weighted / usedWeight;
}

function computeCoverage(
  snapshot: FactorSnapshot,
  prices: ArtemisPriceMap,
  marketMap: Map<string, MarketAsset>,
) {
  const symbols = [...snapshot.longs, ...snapshot.shorts].map((holding) => holding.symbol);
  const uniqueSymbols = [...new Set(symbols)];
  const priceCovered = uniqueSymbols.filter((symbol) => getSeries(prices, symbol).length > 1);
  const marketCovered = uniqueSymbols.filter((symbol) => marketMap.has(symbol));

  return {
    basketCoverage: uniqueSymbols.length > 0 ? priceCovered.length / uniqueSymbols.length : 0,
    hyperliquidCoverage: uniqueSymbols.length > 0 ? marketCovered.length / uniqueSymbols.length : 0,
    mappedHyperliquidAssets: marketCovered,
    unmappedAssets: uniqueSymbols.filter((symbol) => !marketMap.has(symbol)),
  };
}

function confidenceFrom(
  snapshot: FactorSnapshot,
  basketCoverage: number,
  hyperliquidCoverage: number,
): "high" | "medium" | "low" {
  const age = daysBetween(snapshot.reportDate);
  if (basketCoverage >= 0.8 && hyperliquidCoverage >= 0.45 && age <= 45) return "high";
  if (basketCoverage >= 0.6 && age <= 75) return "medium";
  return "low";
}

function computeContributors(
  snapshot: FactorSnapshot,
  prices: ArtemisPriceMap,
  marketMap: Map<string, MarketAsset>,
): { topContributors: FactorContributor[]; topDetractors: FactorContributor[] } {
  const rows: FactorContributor[] = [];

  const collect = (holdings: FactorHolding[], role: "long" | "short") => {
    const weights = normalizedWeights(holdings);
    holdings.forEach((holding, index) => {
      const ret = computeReturn(getSeries(prices, holding.symbol), 30);
      if (ret == null) return;
      const asset = marketMap.get(holding.symbol);
      const contributionPct = role === "long" ? ret * weights[index] : -ret * weights[index];
      rows.push({
        symbol: holding.symbol,
        role,
        returnPct: ret,
        contributionPct,
        livePrice: asset?.markPx ?? null,
        liveChange24h: asset?.priceChange24h ?? null,
        signalLabel: asset?.signal.label,
      });
    });
  };

  collect(snapshot.longs, "long");
  collect(snapshot.shorts, "short");

  const sorted = [...rows].sort((a, b) => b.contributionPct - a.contributionPct);
  return {
    topContributors: sorted.slice(0, 4),
    topDetractors: [...sorted].reverse().slice(0, 4),
  };
}

function computeTradeCandidates(
  snapshot: FactorSnapshot,
  marketMap: Map<string, MarketAsset>,
): FactorTradeCandidate[] {
  const candidates: FactorTradeCandidate[] = [];

  const collect = (holdings: FactorHolding[], role: "long" | "short") => {
    holdings.forEach((holding) => {
      const asset = marketMap.get(holding.symbol);
      if (!asset) return;

      const directionalMove = role === "long" ? asset.priceChange24h : -asset.priceChange24h;
      const signalBoost =
        asset.signal.confidence === "high" ? 18 : asset.signal.confidence === "medium" ? 10 : 4;
      const confirmationBoost = directionalMove > 0 ? 14 : 0;
      const liquidityBoost = Math.min(asset.openInterest / 1_000_000_000, 8);
      const score = directionalMove + signalBoost + confirmationBoost + liquidityBoost;

      candidates.push({
        symbol: holding.symbol,
        role,
        thesis: `${snapshot.shortLabel} ${role === "long" ? "leader" : "short leg"} aligned with ${snapshot.narrativeTags.join(", ")}`,
        score,
        liveChange24h: asset.priceChange24h,
        fundingAPR: asset.fundingAPR,
        signalLabel: asset.signal.label,
        confidence: asset.signal.confidence ?? "low",
        trendStatus: directionalMove > 0 ? "trend-confirmed" : "watchlist-only",
      });
    });
  };

  collect(snapshot.longs, "long");
  collect(snapshot.shorts, "short");

  return candidates.sort((a, b) => b.score - a.score).slice(0, 4);
}

export function normalizeArtemisPriceResponse(payload: ArtemisPriceResponse): ArtemisPriceMap {
  const symbols = payload?.data?.symbols ?? {};
  const normalized: ArtemisPriceMap = {};

  Object.entries(symbols).forEach(([symbol, metrics]) => {
    const series = metrics.price ?? metrics.PRICE ?? [];
    if (!Array.isArray(series)) return;
    normalized[symbol.toUpperCase()] = series
      .map((point) => ({ date: point.date, val: Number(point.val) }))
      .filter((point) => point.date && Number.isFinite(point.val));
  });

  return normalized;
}

export function buildFactorStates(
  snapshots: FactorSnapshot[],
  prices: ArtemisPriceMap,
  marketAssets: MarketAsset[],
): LiveFactorState[] {
  const marketMap = new Map(marketAssets.map((asset) => [asset.coin, asset]));

  return snapshots
    .map((snapshot) => {
      const windows: FactorPerformanceWindow[] = WINDOW_DAYS.map((days) => {
        const longReturn = computeWeightedLegReturn(snapshot.longs, prices, days);
        const shortRaw = computeWeightedLegReturn(snapshot.shorts, prices, days);
        const shortReturn =
          snapshot.constructionType === "long-only"
            ? 0
            : shortRaw == null
              ? null
              : -shortRaw;
        const spreadReturn =
          snapshot.constructionType === "long-only"
            ? longReturn
            : longReturn != null && shortReturn != null
              ? longReturn + shortReturn
              : null;

        return { days, longReturn, shortReturn, spreadReturn };
      });

      const coverage = computeCoverage(snapshot, prices, marketMap);
      const contributors = computeContributors(snapshot, prices, marketMap);
      const tradeCandidates = computeTradeCandidates(snapshot, marketMap);
      const today = windows[0];

      return {
        snapshot,
        windows,
        longsReturnToday: today?.longReturn ?? null,
        shortsReturnToday: today?.shortReturn ?? null,
        spreadToday: today?.spreadReturn ?? null,
        mappedHyperliquidAssets: coverage.mappedHyperliquidAssets,
        unmappedAssets: coverage.unmappedAssets,
        basketCoverage: coverage.basketCoverage,
        hyperliquidCoverage: coverage.hyperliquidCoverage,
        confidence: confidenceFrom(snapshot, coverage.basketCoverage, coverage.hyperliquidCoverage),
        stalenessDays: daysBetween(snapshot.reportDate),
        topContributors: contributors.topContributors,
        topDetractors: contributors.topDetractors,
        tradeCandidates,
      };
    })
    .sort(
      (a, b) =>
        (b.windows.find((window) => window.days === 7)?.spreadReturn ?? -Infinity) -
        (a.windows.find((window) => window.days === 7)?.spreadReturn ?? -Infinity),
    );
}

export function factorLeaderText(factor: LiveFactorState | undefined): string {
  if (!factor) return "No live factor leadership yet";
  const spread = factor.windows.find((window) => window.days === 7)?.spreadReturn;
  const spreadText = spread == null ? "n/a" : `${spread >= 0 ? "+" : ""}${spread.toFixed(1)}% 7d`;
  return `${factor.snapshot.name} leading (${spreadText})`;
}
