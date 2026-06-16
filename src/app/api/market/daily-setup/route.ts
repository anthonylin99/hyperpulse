import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";

export const dynamic = "force-dynamic";

type AssetContext = Record<string, string | number | undefined>;

type Candidate = {
  coin: string;
  side: "long" | "short" | "watch";
  title: string;
  status: "watch" | "no-trade";
  markPx: number;
  fundingApr: number;
  fundingZ7d: number | null;
  priceChange24h: number;
  openInterestUsd: number;
  volume24hUsd: number;
  trigger: number | null;
  invalidation: number | null;
  target: number | null;
  maxHoldHours: number;
  score: number;
  rationale: string[];
  guardrails: string[];
};

const MIN_OI_USD = 10_000_000;
const MIN_VOLUME_USD = 5_000_000;
const MAX_CANDIDATES = 14;

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pctChange(current: number, previous: number): number {
  if (current <= 0 || previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function round(value: number | null, digits = 4): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function formatPct(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function pickCandidate(candidates: Candidate[]): Candidate {
  return candidates.sort((a, b) => b.score - a.score)[0] ?? {
    coin: "MARKET",
    side: "watch",
    title: "No A-grade funding setup",
    status: "no-trade",
    markPx: 0,
    fundingApr: 0,
    fundingZ7d: null,
    priceChange24h: 0,
    openInterestUsd: 0,
    volume24hUsd: 0,
    trigger: null,
    invalidation: null,
    target: null,
    maxHoldHours: 48,
    score: 0,
    rationale: [
      "No liquid market has both extreme funding and clean enough price confirmation.",
      "Stand down beats forcing a trade.",
    ],
    guardrails: [
      "Do not trade funding alone.",
      "Wait for reclaim or breakdown confirmation.",
    ],
  };
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-market-daily-setup",
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const now = Date.now();
  const info = getInfoClient(resolveNetworkFromRequest(new URL(request.url)));

  try {
    const [meta, assetCtxs] = (await info.metaAndAssetCtxs()) as unknown as [
      { universe?: Array<{ name: string; isDelisted?: boolean }> },
      AssetContext[],
    ];

    const liquid = (meta.universe ?? [])
      .map((asset, index) => {
        const ctx = assetCtxs[index];
        const markPx = asNumber(ctx?.markPx);
        const prevDayPx = asNumber(ctx?.prevDayPx);
        const fundingApr = asNumber(ctx?.funding) * 8760 * 100;
        const openInterestUsd = asNumber(ctx?.openInterest) * markPx;
        const volume24hUsd = asNumber(ctx?.dayNtlVlm);
        return {
          coin: asset.name,
          isDelisted: asset.isDelisted,
          markPx,
          prevDayPx,
          fundingApr,
          priceChange24h: pctChange(markPx, prevDayPx),
          openInterestUsd,
          volume24hUsd,
        };
      })
      .filter(
        (asset) =>
          !asset.isDelisted &&
          asset.markPx > 0 &&
          asset.openInterestUsd >= MIN_OI_USD &&
          asset.volume24hUsd >= MIN_VOLUME_USD,
      );

    const fundingExtreme = liquid
      .filter((asset) => Math.abs(asset.fundingApr) >= 10 || asset.coin === "BTC" || asset.coin === "ETH" || asset.coin === "SOL" || asset.coin === "HYPE")
      .sort((a, b) => Math.abs(b.fundingApr) - Math.abs(a.fundingApr))
      .slice(0, MAX_CANDIDATES);

    const candidates: Candidate[] = [];

    for (const asset of fundingExtreme) {
      const [fundingRows, candles] = await Promise.all([
        info
          .fundingHistory({
            coin: asset.coin,
            startTime: now - 7 * 24 * 60 * 60 * 1000,
            endTime: now,
          })
          .catch(() => []),
        info
          .candleSnapshot({
            coin: asset.coin,
            interval: "1h",
            startTime: now - 72 * 60 * 60 * 1000,
            endTime: now,
          })
          .catch(() => []),
      ]);

      const fundingAprSeries = (fundingRows as Array<Record<string, unknown>>)
        .map((row) => asNumber(row.fundingRate) * 8760 * 100)
        .filter(Number.isFinite);
      const mean = average(fundingAprSeries);
      const sigma = stdDev(fundingAprSeries);
      const fundingZ7d = sigma > 0 ? (asset.fundingApr - mean) / sigma : null;
      const normalizedCandles = (candles as Array<Record<string, unknown>>)
        .map((candle) => ({
          high: asNumber(candle.h),
          low: asNumber(candle.l),
          close: asNumber(candle.c),
        }))
        .filter((candle) => candle.high > 0 && candle.low > 0 && candle.close > 0);

      const last24 = normalizedCandles.slice(-24);
      if (last24.length < 12) continue;

      const high24 = Math.max(...last24.map((candle) => candle.high));
      const low24 = Math.min(...last24.map((candle) => candle.low));
      const range24 = Math.max(high24 - low24, asset.markPx * 0.01);
      const fundingZScore = fundingZ7d ?? 0;

      if (asset.fundingApr >= 20 && asset.priceChange24h >= 4) {
        const trigger = Math.max(low24, asset.markPx - range24 * 0.18);
        const invalidation = Math.min(high24, asset.markPx + range24 * 0.18);
        const risk = invalidation - trigger;
        const target = trigger - risk * 1.5;
        candidates.push({
          coin: asset.coin,
          side: "short",
          title: `${asset.coin} crowded-long fade watch`,
          status: "watch",
          markPx: asset.markPx,
          fundingApr: asset.fundingApr,
          fundingZ7d,
          priceChange24h: asset.priceChange24h,
          openInterestUsd: asset.openInterestUsd,
          volume24hUsd: asset.volume24hUsd,
          trigger,
          invalidation,
          target,
          maxHoldHours: 48,
          score: asset.fundingApr / 8 + asset.priceChange24h / 5 + Math.max(fundingZScore, 0),
          rationale: [
            `Positive funding is high at ${formatPct(asset.fundingApr)}, meaning longs are paying shorts.`,
            `Price is already up ${formatPct(asset.priceChange24h)} over 24h, so this is a fade only after a breakdown.`,
            "Do not short strength blindly; wait for the trigger.",
          ],
          guardrails: [
            "No averaging if price reclaims invalidation.",
            "Funding is context, not permission to fight momentum.",
            "Max hold 48h unless the move is already paying.",
          ],
        });
      }

      if (asset.fundingApr <= -10 && asset.priceChange24h >= 0.5) {
        const trigger = Math.min(high24, asset.markPx + range24 * 0.18);
        const invalidation = Math.max(low24, asset.markPx - range24 * 0.22);
        const risk = trigger - invalidation;
        const target = trigger + risk * 1.5;
        candidates.push({
          coin: asset.coin,
          side: "long",
          title: `${asset.coin} crowded-short squeeze watch`,
          status: "watch",
          markPx: asset.markPx,
          fundingApr: asset.fundingApr,
          fundingZ7d,
          priceChange24h: asset.priceChange24h,
          openInterestUsd: asset.openInterestUsd,
          volume24hUsd: asset.volume24hUsd,
          trigger,
          invalidation,
          target,
          maxHoldHours: 48,
          score: Math.abs(asset.fundingApr) / 8 + Math.max(asset.priceChange24h, 0) / 4 + Math.max(-fundingZScore, 0),
          rationale: [
            `Negative funding is ${formatPct(asset.fundingApr)}, so shorts are paying longs.`,
            "This only matters if price reclaims; otherwise it is just a downtrend with cheap funding.",
            "Wait for market confirmation before treating it as a squeeze.",
          ],
          guardrails: [
            "No adding below invalidation.",
            "If reclaim fails, the funding signal failed.",
            "Max hold 48h unless momentum confirms.",
          ],
        });
      }
    }

    const setup = pickCandidate(candidates);
    return jsonSuccess(
      {
        generatedAt: now,
        setup: {
          ...setup,
          markPx: round(setup.markPx),
          fundingApr: round(setup.fundingApr, 2),
          fundingZ7d: round(setup.fundingZ7d, 2),
          priceChange24h: round(setup.priceChange24h, 2),
          openInterestUsd: round(setup.openInterestUsd, 0),
          volume24hUsd: round(setup.volume24hUsd, 0),
          trigger: round(setup.trigger),
          invalidation: round(setup.invalidation),
          target: round(setup.target),
          score: round(setup.score, 2),
        },
      },
      { cache: "public-market" },
    );
  } catch (error) {
    logServerError("api/market/daily-setup", error);
    return jsonError("Unable to build daily setup right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
