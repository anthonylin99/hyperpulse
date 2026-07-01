const STATS_BASE_URL = "https://stats-data.hyperliquid.xyz";
const HYPE_FUNDAMENTALS_CACHE_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_STATS_MS = 3 * DAY_MS;

export type HypeFundamentalRegime = "expanding" | "cooling" | "mixed" | "unknown";
export type HypeLevelBias = "support_bid" | "breakout_confirm" | "resistance_fade" | "mean_revert" | "neutral";
export type HypeFundingRegime = "longs_paying" | "shorts_paying" | "neutral";

export type HypeMetricPoint = {
  time: number;
  value: number;
};

export type HypeStatsSnapshot = {
  hypeVolume: HypeMetricPoint[];
  protocolVolume: HypeMetricPoint[];
  hypeOpenInterest: HypeMetricPoint[];
  hypeFunding: HypeMetricPoint[];
};

export type HypeLiveContext = {
  markPrice: number | null;
  prevDayPrice: number | null;
  priceChange24hPct: number | null;
  openInterestUsd: number | null;
  dayVolumeUsd: number | null;
  fundingRate: number | null;
  fundingApr: number | null;
};

export type HypeFundamentalsContext = {
  asset: "HYPE";
  source: "hyperliquid_public_stats";
  generatedAt: number;
  latestStatsAt: number | null;
  statsStale: boolean;
  regime: HypeFundamentalRegime;
  levelBias: HypeLevelBias;
  confidenceAdjustment: "raise" | "lower" | "neutral";
  decisionLabel: string;
  metrics: {
    markPrice: number | null;
    priceChange24hPct: number | null;
    volume7dUsd: number | null;
    volume30dUsd: number | null;
    volumeShare7dPct: number | null;
    volumeShare30dPct: number | null;
    volumeShareChangePct: number | null;
    openInterest7dChangePct: number | null;
    openInterest30dChangePct: number | null;
    funding7dAvgApr: number | null;
    funding30dAvgApr: number | null;
    liveFundingApr: number | null;
    liveOpenInterestUsd: number | null;
    liveDayVolumeUsd: number | null;
  };
  fundingRegime: HypeFundingRegime;
  evidence: string[];
  caveats: string[];
};

type StatsCacheEntry = {
  expiresAt: number;
  data: HypeStatsSnapshot;
};

let statsCache: StatsCacheEntry | null = null;

function parseNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTime(value: unknown): number | null {
  if (typeof value === "string" && /[T:-]/.test(value)) {
    const parsedDate = Date.parse(value);
    if (Number.isFinite(parsedDate)) return parsedDate;
  }
  const parsed = parseNumber(value);
  if (parsed == null) return null;
  return parsed > 10_000_000_000 ? parsed : parsed * 1000;
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

function sumRecent(points: HypeMetricPoint[], days: number): number | null {
  if (points.length === 0) return null;
  const latest = points.at(-1)?.time;
  if (latest == null) return null;
  const cutoff = latest - days * DAY_MS;
  const selected = points.filter((point) => point.time > cutoff && point.time <= latest);
  if (selected.length === 0) return null;
  return selected.reduce((sum, point) => sum + point.value, 0);
}

function avgRecent(points: HypeMetricPoint[], days: number): number | null {
  if (points.length === 0) return null;
  const latest = points.at(-1)?.time;
  if (latest == null) return null;
  const cutoff = latest - days * DAY_MS;
  const selected = points.filter((point) => point.time > cutoff && point.time <= latest);
  if (selected.length === 0) return null;
  return selected.reduce((sum, point) => sum + point.value, 0) / selected.length;
}

function valueDaysAgo(points: HypeMetricPoint[], days: number): number | null {
  if (points.length === 0) return null;
  const latest = points.at(-1)?.time;
  if (latest == null) return null;
  const target = latest - days * DAY_MS;
  let best: HypeMetricPoint | null = null;
  for (const point of points) {
    if (point.time <= target) best = point;
  }
  return best?.value ?? points[0]?.value ?? null;
}

function latestTime(...series: HypeMetricPoint[][]): number | null {
  let latest: number | null = null;
  for (const points of series) {
    const time = points.at(-1)?.time;
    if (time != null && (latest == null || time > latest)) latest = time;
  }
  return latest;
}

function formatPctEvidence(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function normalizeHypeStatsPoints(
  raw: unknown,
  valueKey: string,
  coinFilter?: string,
): HypeMetricPoint[] {
  const rows = Array.isArray((raw as { chart_data?: unknown }).chart_data)
    ? (raw as { chart_data: unknown[] }).chart_data
    : [];
  const points: HypeMetricPoint[] = [];
  for (const row of rows) {
    if (row == null || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (coinFilter && String(record.coin ?? "").toUpperCase() !== coinFilter) continue;
    const time = normalizeTime(record.time);
    const value = parseNumber(record[valueKey]);
    if (time == null || value == null) continue;
    points.push({ time, value });
  }
  return points.sort((a, b) => a.time - b.time);
}

async function fetchStatsJson(path: string): Promise<unknown> {
  const response = await fetch(`${STATS_BASE_URL}/${path}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid stats fetch failed for ${path}: ${response.status}`);
  }
  return response.json();
}

export async function getHypeStatsSnapshot(): Promise<HypeStatsSnapshot> {
  const now = Date.now();
  if (statsCache && statsCache.expiresAt > now) return statsCache.data;

  const [volumeByCoin, protocolVolume, openInterest, funding] = await Promise.all([
    fetchStatsJson("daily_usd_volume_by_coin"),
    fetchStatsJson("daily_usd_volume"),
    fetchStatsJson("open_interest"),
    fetchStatsJson("funding_rate"),
  ]);

  const data: HypeStatsSnapshot = {
    hypeVolume: normalizeHypeStatsPoints(volumeByCoin, "daily_usd_volume", "HYPE"),
    protocolVolume: normalizeHypeStatsPoints(protocolVolume, "daily_usd_volume"),
    hypeOpenInterest: normalizeHypeStatsPoints(openInterest, "open_interest", "HYPE"),
    hypeFunding: normalizeHypeStatsPoints(funding, "sum_funding", "HYPE"),
  };
  statsCache = { data, expiresAt: now + HYPE_FUNDAMENTALS_CACHE_MS };
  return data;
}

export async function getHypeLiveContext(): Promise<HypeLiveContext> {
  try {
    const { getInfoClient } = await import("@/lib/hyperliquid");
    const info = getInfoClient("mainnet");
    const [meta, contexts] = await info.metaAndAssetCtxs();
    const universe = Array.isArray(meta?.universe) ? meta.universe : [];
    const index = universe.findIndex((asset) => String(asset?.name ?? "").toUpperCase() === "HYPE");
    const ctx = index >= 0 && Array.isArray(contexts) ? contexts[index] as Record<string, unknown> : null;
    const markPrice = parseNumber(ctx?.markPx);
    const prevDayPrice = parseNumber(ctx?.prevDayPx);
    const fundingRate = parseNumber(ctx?.funding);
    const openInterestCoin = parseNumber(ctx?.openInterest);
    return {
      markPrice,
      prevDayPrice,
      priceChange24hPct: pctChange(markPrice, prevDayPrice),
      openInterestUsd: markPrice != null && openInterestCoin != null ? markPrice * openInterestCoin : null,
      dayVolumeUsd: parseNumber(ctx?.dayNtlVlm),
      fundingRate,
      fundingApr: fundingRate == null ? null : fundingRate * 24 * 365 * 100,
    };
  } catch {
    return {
      markPrice: null,
      prevDayPrice: null,
      priceChange24hPct: null,
      openInterestUsd: null,
      dayVolumeUsd: null,
      fundingRate: null,
      fundingApr: null,
    };
  }
}

export function deriveHypeFundamentals(args: {
  stats: HypeStatsSnapshot;
  live?: HypeLiveContext;
  now?: number;
}): HypeFundamentalsContext {
  const now = args.now ?? Date.now();
  const live = args.live ?? {
    markPrice: null,
    prevDayPrice: null,
    priceChange24hPct: null,
    openInterestUsd: null,
    dayVolumeUsd: null,
    fundingRate: null,
    fundingApr: null,
  };
  const latestStatsAt = latestTime(
    args.stats.hypeVolume,
    args.stats.protocolVolume,
    args.stats.hypeOpenInterest,
    args.stats.hypeFunding,
  );
  const volume7dUsd = sumRecent(args.stats.hypeVolume, 7);
  const volume30dUsd = sumRecent(args.stats.hypeVolume, 30);
  const protocolVolume7dUsd = sumRecent(args.stats.protocolVolume, 7);
  const protocolVolume30dUsd = sumRecent(args.stats.protocolVolume, 30);
  const volumeShare7dPct = volume7dUsd != null && protocolVolume7dUsd != null && protocolVolume7dUsd > 0
    ? (volume7dUsd / protocolVolume7dUsd) * 100
    : null;
  const volumeShare30dPct = volume30dUsd != null && protocolVolume30dUsd != null && protocolVolume30dUsd > 0
    ? (volume30dUsd / protocolVolume30dUsd) * 100
    : null;
  const volumeShareChangePct = pctChange(volumeShare7dPct, volumeShare30dPct);
  const latestOi = args.stats.hypeOpenInterest.at(-1)?.value ?? null;
  const openInterest7dChangePct = pctChange(latestOi, valueDaysAgo(args.stats.hypeOpenInterest, 7));
  const openInterest30dChangePct = pctChange(latestOi, valueDaysAgo(args.stats.hypeOpenInterest, 30));
  const funding7dAvgApr = avgRecent(args.stats.hypeFunding, 7);
  const funding30dAvgApr = avgRecent(args.stats.hypeFunding, 30);
  const statsStale = latestStatsAt == null || now - latestStatsAt > STALE_STATS_MS;

  let regime: HypeFundamentalRegime = "unknown";
  if (volumeShareChangePct != null || openInterest7dChangePct != null) {
    const expansionScore =
      (volumeShareChangePct != null && volumeShareChangePct > 5 ? 1 : 0) +
      (openInterest7dChangePct != null && openInterest7dChangePct > 5 ? 1 : 0) +
      (live.dayVolumeUsd != null && volume7dUsd != null && live.dayVolumeUsd > volume7dUsd / 7 ? 1 : 0);
    const coolingScore =
      (volumeShareChangePct != null && volumeShareChangePct < -5 ? 1 : 0) +
      (openInterest7dChangePct != null && openInterest7dChangePct < -5 ? 1 : 0) +
      (live.dayVolumeUsd != null && volume7dUsd != null && live.dayVolumeUsd < (volume7dUsd / 7) * 0.75 ? 1 : 0);
    if (expansionScore >= 2) regime = "expanding";
    else if (coolingScore >= 2) regime = "cooling";
    else regime = "mixed";
  }

  const effectiveFundingApr = live.fundingApr ?? funding7dAvgApr ?? funding30dAvgApr;
  const fundingRegime: HypeFundingRegime =
    effectiveFundingApr == null || Math.abs(effectiveFundingApr) < 5
      ? "neutral"
      : effectiveFundingApr > 0
        ? "longs_paying"
        : "shorts_paying";

  let levelBias: HypeLevelBias = "neutral";
  if (regime === "expanding" && fundingRegime !== "longs_paying") levelBias = "breakout_confirm";
  else if (regime === "expanding") levelBias = "support_bid";
  else if (regime === "cooling" && fundingRegime === "longs_paying") levelBias = "resistance_fade";
  else if (regime === "cooling") levelBias = "mean_revert";

  const confidenceAdjustment =
    regime === "expanding" && !statsStale
      ? "raise"
      : regime === "cooling" || statsStale
        ? "lower"
        : "neutral";

  const evidence = [
    `HYPE 7d protocol volume share ${formatPctEvidence(volumeShare7dPct)} vs 30d ${formatPctEvidence(volumeShare30dPct)}.`,
    `HYPE open interest change: 7d ${formatPctEvidence(openInterest7dChangePct)}, 30d ${formatPctEvidence(openInterest30dChangePct)}.`,
    `Funding pressure: live ${formatPctEvidence(live.fundingApr)} APR, 7d avg ${formatPctEvidence(funding7dAvgApr)} APR.`,
  ];
  if (statsStale) {
    evidence.push("Historical stats are stale or unavailable; live mark, OI, volume, and funding get more weight.");
  }

  const decisionLabel =
    levelBias === "breakout_confirm"
      ? "HYPE usage expanding, prefer confirmed breakouts"
      : levelBias === "support_bid"
        ? "HYPE usage expanding, support can matter"
        : levelBias === "resistance_fade"
          ? "HYPE usage cooling, rallies need proof"
          : levelBias === "mean_revert"
            ? "HYPE usage cooling, mean-revert watch"
            : "HYPE fundamentals mixed, levels stay in charge";

  return {
    asset: "HYPE",
    source: "hyperliquid_public_stats",
    generatedAt: now,
    latestStatsAt,
    statsStale,
    regime,
    levelBias,
    confidenceAdjustment,
    decisionLabel,
    metrics: {
      markPrice: live.markPrice,
      priceChange24hPct: live.priceChange24hPct,
      volume7dUsd,
      volume30dUsd,
      volumeShare7dPct,
      volumeShare30dPct,
      volumeShareChangePct,
      openInterest7dChangePct,
      openInterest30dChangePct,
      funding7dAvgApr,
      funding30dAvgApr,
      liveFundingApr: live.fundingApr,
      liveOpenInterestUsd: live.openInterestUsd,
      liveDayVolumeUsd: live.dayVolumeUsd,
    },
    fundingRegime,
    evidence,
    caveats: [
      "Public Hyperliquid stats plus live HYPE perp context.",
      "Volume, OI, and funding are proxies until revenue and buyback data have a reliable official feed.",
      "Fundamentals shape the read. Trigger and invalidation decide the trade.",
    ],
  };
}

export async function getHypeFundamentalsContext(): Promise<HypeFundamentalsContext> {
  const [stats, live] = await Promise.all([getHypeStatsSnapshot(), getHypeLiveContext()]);
  return deriveHypeFundamentals({ stats, live });
}
