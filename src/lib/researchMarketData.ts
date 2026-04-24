import type { InfoClient } from "@nktkas/hyperliquid";
import { resolveSpotCoinForCandles } from "@/lib/spotMarkets";
import { isResearchStoreConfigured, listDailyPrices, upsertDailyPrices } from "@/lib/researchStore";
import type { DailyMarketPrice } from "@/types";

const MAX_RESEARCH_ASSETS = 12;

export function normalizeResearchAssets(rawAssets: string[]): string[] {
  const seen = new Set<string>();
  const assets: string[] = [];

  for (const raw of rawAssets) {
    const asset = raw.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9/_-]{0,23}$/.test(asset)) continue;
    const key = asset.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    assets.push(asset);
    if (assets.length >= MAX_RESEARCH_ASSETS) break;
  }

  return assets;
}

function parseCandle(asset: string, marketType: "perp" | "spot", candle: Record<string, unknown>): DailyMarketPrice | null {
  const rawTime = Number(candle.t ?? candle.T ?? candle.time ?? 0);
  const time = rawTime > 10_000_000_000 ? rawTime : rawTime * 1000;
  const open = Number(candle.o ?? candle.open);
  const high = Number(candle.h ?? candle.high);
  const low = Number(candle.l ?? candle.low);
  const close = Number(candle.c ?? candle.close);
  const volume = Number(candle.v ?? candle.vlm ?? candle.volume ?? 0);

  if (![time, open, high, low, close].every(Number.isFinite)) return null;
  if (time <= 0 || open <= 0 || high <= 0 || low <= 0 || close <= 0) return null;

  return {
    asset,
    marketType,
    day: new Date(time).toISOString().slice(0, 10),
    time,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0,
    source: "hyperliquid",
    updatedAt: Date.now(),
  };
}

export async function fetchDailyPricesFromHyperliquid(args: {
  info: InfoClient;
  assets: string[];
  days: number;
  marketType?: "perp" | "spot";
}): Promise<DailyMarketPrice[]> {
  const { info, assets, days, marketType = "perp" } = args;
  const now = Date.now();
  const startTime = now - Math.min(Math.max(days, 30), 365) * 24 * 60 * 60 * 1000;
  const prices: DailyMarketPrice[] = [];

  await Promise.allSettled(
    assets.map(async (asset) => {
      const resolvedCoin = marketType === "spot" ? await resolveSpotCoinForCandles(info, asset) : asset;
      const candles = await info.candleSnapshot({
        coin: resolvedCoin,
        interval: "1d",
        startTime,
        endTime: now,
      });

      for (const candle of Array.isArray(candles) ? candles : []) {
        const parsed = parseCandle(asset, marketType, candle as Record<string, unknown>);
        if (parsed) prices.push(parsed);
      }
    }),
  );

  return prices.sort((a, b) => a.asset.localeCompare(b.asset) || a.day.localeCompare(b.day));
}

export async function getResearchDailyPrices(args: {
  info: InfoClient;
  assets: string[];
  days: number;
  marketType?: "perp" | "spot";
}): Promise<{ configured: boolean; prices: DailyMarketPrice[]; stored: boolean }> {
  const assets = normalizeResearchAssets(args.assets);
  const days = Math.min(Math.max(args.days, 30), 365);
  if (assets.length === 0) {
    return { configured: isResearchStoreConfigured(), prices: [], stored: false };
  }

  const fetched = await fetchDailyPricesFromHyperliquid({
    info: args.info,
    assets,
    days,
    marketType: args.marketType ?? "perp",
  });

  let stored = false;
  if (isResearchStoreConfigured()) {
    try {
      stored = await upsertDailyPrices(fetched);
      if (!stored) {
        return { configured: isResearchStoreConfigured(), prices: fetched, stored: false };
      }
      const prices = await listDailyPrices({ assets, days, marketType: args.marketType ?? "perp" });
      return { configured: true, prices: prices.length > 0 ? prices : fetched, stored };
    } catch (error) {
      console.warn("[research] daily price store unavailable", error);
      return { configured: true, prices: fetched, stored: false };
    }
  }

  return { configured: false, prices: fetched, stored };
}
