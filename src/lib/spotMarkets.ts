import type { InfoClient } from "@nktkas/hyperliquid";
import { buildSpotMarketMap } from "@/lib/whaleTaxonomy";

const SPOT_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedSpotSymbols:
  | { expiresAt: number; marketKeysBySymbol: Record<string, string> }
  | null = null;

function normalizeSpotLookup(coin: string): string {
  return coin.trim().toUpperCase().replace(/\/USDC$/, "");
}

export async function resolveSpotCoinForCandles(
  info: InfoClient,
  coin: string,
): Promise<string> {
  const raw = coin.trim();
  if (!raw) {
    throw new Error("Spot symbol is required.");
  }

  if (raw.startsWith("@")) {
    return raw;
  }

  if (raw.includes("/")) {
    return raw.toUpperCase();
  }

  const now = Date.now();
  if (!cachedSpotSymbols || cachedSpotSymbols.expiresAt <= now) {
    const [meta, assetCtxs] = (await info.spotMetaAndAssetCtxs()) as unknown as [
      { universe: Array<{ index: number; tokens: number[] }>; tokens: Array<{ index: number; name: string; fullName?: string }> },
      Array<{ markPx: string; midPx: string | null; prevDayPx: string }>,
    ];

    const spotMarketMap = buildSpotMarketMap(meta, assetCtxs);
    const marketKeysBySymbol = Object.fromEntries(
      Object.values(spotMarketMap).map((market) => [normalizeSpotLookup(market.symbol), market.marketKey]),
    );

    cachedSpotSymbols = {
      expiresAt: now + SPOT_CACHE_TTL_MS,
      marketKeysBySymbol,
    };
  }

  const lookup = normalizeSpotLookup(raw);
  const marketKey = cachedSpotSymbols.marketKeysBySymbol[lookup];
  if (!marketKey) {
    throw new Error(`Unsupported HIP-3 spot symbol: ${coin}`);
  }

  return marketKey;
}
