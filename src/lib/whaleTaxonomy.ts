import type { SpotCategory, WhaleAssetClass, WhaleMarketType, WhaleRiskBucket } from "@/types";

export type WhaleAssetDescriptor = {
  symbol: string;
  displayCoin: string;
  marketType: WhaleMarketType;
  assetClass: WhaleAssetClass;
  riskBucket: WhaleRiskBucket;
  hedgeProxyFor: WhaleRiskBucket[];
};

export type WhaleSpotMarketContext = WhaleAssetDescriptor & {
  marketKey: string;
  pair: string;
  markPx: number;
  midPx: number;
  prevDayPx: number;
  category: SpotCategory;
};

const STOCK_SYMBOLS = new Set([
  "AAPL",
  "AMZN",
  "GOOGL",
  "META",
  "MSFT",
  "NFLX",
  "NVDA",
  "QQQ",
  "SPY",
  "TSLA",
  "USPYX",
]);

const OIL_SYMBOLS = new Set(["BRENT", "BRENTOIL", "WTI", "USO", "XBR", "XTI"]);
const METAL_SYMBOLS = new Set(["PAXG", "XAU", "XAUT0", "GLD", "SLV", "XAG"]);
const AI_SYMBOLS = new Set(["TAO", "NEAR", "RENDER", "FET", "AIXBT", "WLD", "IO"]);
const DEFI_SYMBOLS = new Set(["AAVE", "CRV", "GMX", "JUP", "MORPHO", "ONDO", "PENDLE", "UNI", "CAKE"]);
const MEME_SYMBOLS = new Set(["DOGE", "WIF", "POPCAT", "FARTCOIN", "TRUMP", "BRETT", "MEW", "kPEPE", "PENGU"]);
const CRYPTO_BETA_SYMBOLS = new Set(["BTC", "ETH", "SOL", "HYPE", "BNB", "XRP", "ADA", "SUI", "AVAX", "LINK", "TRX"]);
const EQUITY_BROAD_SYMBOLS = new Set(["SPY", "QQQ", "USPYX"]);
const QUALIFIED_HIP3_SYMBOLS = new Set([
  ...STOCK_SYMBOLS,
  ...OIL_SYMBOLS,
  ...METAL_SYMBOLS,
]);

function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/\/USDC$/, "");
}

export function inferSpotCategory(symbol: string): SpotCategory {
  const normalized = normalizeSymbol(symbol);
  if (STOCK_SYMBOLS.has(normalized)) return "Stocks";
  if (OIL_SYMBOLS.has(normalized) || METAL_SYMBOLS.has(normalized)) return "Commodities";
  if (/USD|USDC/.test(normalized)) return "Other";
  if (/^[A-Z0-9]{2,16}$/.test(normalized)) return "Crypto";
  return "Other";
}

export function classifyWhaleAsset(
  rawSymbol: string,
  marketType: WhaleMarketType,
  spotCategory?: SpotCategory,
): WhaleAssetDescriptor {
  const symbol = normalizeSymbol(rawSymbol);

  if (marketType === "hip3_spot") {
    const category = spotCategory ?? inferSpotCategory(symbol);

    if (OIL_SYMBOLS.has(symbol)) {
      return {
        symbol,
        displayCoin: symbol,
        marketType,
        assetClass: "Oil",
        riskBucket: "energy",
        hedgeProxyFor: ["energy"],
      };
    }

    if (METAL_SYMBOLS.has(symbol)) {
      return {
        symbol,
        displayCoin: symbol,
        marketType,
        assetClass: "Commodity",
        riskBucket: "metals",
        hedgeProxyFor: ["metals", "commodities_other"],
      };
    }

    if (category === "Stocks") {
      return {
        symbol,
        displayCoin: symbol,
        marketType,
        assetClass: "Stock",
        riskBucket: EQUITY_BROAD_SYMBOLS.has(symbol) ? "equities_broad" : "equities_growth",
        hedgeProxyFor: ["equities_growth", "equities_broad"],
      };
    }

    if (category === "Commodities") {
      return {
        symbol,
        displayCoin: symbol,
        marketType,
        assetClass: "Commodity",
        riskBucket: "commodities_other",
        hedgeProxyFor: ["commodities_other"],
      };
    }

    return {
      symbol,
      displayCoin: symbol,
      marketType,
      assetClass: category === "Crypto" ? "Crypto" : "Other HIP-3",
      riskBucket: category === "Crypto" ? "crypto_beta" : "fx_rates_other",
      hedgeProxyFor: category === "Crypto" ? ["crypto_beta"] : ["fx_rates_other"],
    };
  }

  if (AI_SYMBOLS.has(symbol)) {
    return {
      symbol,
      displayCoin: symbol,
      marketType,
      assetClass: "Crypto",
      riskBucket: "crypto_ai",
      hedgeProxyFor: ["crypto_ai", "crypto_beta"],
    };
  }

  if (DEFI_SYMBOLS.has(symbol)) {
    return {
      symbol,
      displayCoin: symbol,
      marketType,
      assetClass: "Crypto",
      riskBucket: "crypto_defi",
      hedgeProxyFor: ["crypto_defi", "crypto_beta"],
    };
  }

  if (MEME_SYMBOLS.has(symbol)) {
    return {
      symbol,
      displayCoin: symbol,
      marketType,
      assetClass: "Crypto",
      riskBucket: "crypto_meme",
      hedgeProxyFor: ["crypto_meme", "crypto_beta"],
    };
  }

  return {
    symbol,
    displayCoin: symbol,
    marketType,
    assetClass: "Crypto",
    riskBucket: CRYPTO_BETA_SYMBOLS.has(symbol) ? "crypto_beta" : "crypto_beta",
    hedgeProxyFor: ["crypto_beta"],
  };
}

export function isMajorWhaleAsset(symbol: string): boolean {
  return CRYPTO_BETA_SYMBOLS.has(normalizeSymbol(symbol));
}

export function isQualifiedHip3Symbol(symbol: string): boolean {
  return QUALIFIED_HIP3_SYMBOLS.has(normalizeSymbol(symbol));
}

function parseNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildSpotMarketMap(
  meta: {
    universe: Array<{ index: number; tokens: number[] }>;
    tokens: Array<{ index: number; name: string; fullName?: string }>;
  },
  assetCtxs: Array<{ markPx: string; midPx: string | null; prevDayPx: string }> = [],
): Record<string, WhaleSpotMarketContext> {
  const tokenByIndex = new Map(meta.tokens.map((token) => [token.index, token]));
  const contexts: Record<string, WhaleSpotMarketContext> = {};

  for (const entry of meta.universe) {
    if (!Array.isArray(entry.tokens) || entry.tokens.length < 2) continue;
    const base = tokenByIndex.get(entry.tokens[0]);
    const quote = tokenByIndex.get(entry.tokens[1]);
    if (!base || !quote) continue;

    const symbol = normalizeSymbol(base.name);
    const category = inferSpotCategory(symbol);
    const descriptor = classifyWhaleAsset(symbol, "hip3_spot", category);
    const ctx = assetCtxs[entry.index];
    const marketKey = symbol === "PURR" ? `${symbol}/USDC` : `@${entry.index}`;

    contexts[marketKey] = {
      ...descriptor,
      marketKey,
      pair: `${symbol}/${quote.name}`,
      markPx: parseNumber(ctx?.markPx),
      midPx: parseNumber(ctx?.midPx),
      prevDayPx: parseNumber(ctx?.prevDayPx),
      category,
    };

    contexts[symbol] = contexts[marketKey];
  }

  return contexts;
}
