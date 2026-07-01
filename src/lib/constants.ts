export const MAJOR_ASSETS = [
  "BTC",
  "ETH",
  "SOL",
  "HYPE",
  "ARB",
  "WIF",
  "kPEPE",
  "DOGE",
  "SUI",
  "LINK",
  "AVAX",
  "AAVE",
] as const;

const configuredMarketPollMs = Number(process.env.NEXT_PUBLIC_MARKET_POLL_MS);
const isDevelopmentRuntime = process.env.NODE_ENV === "development";

export const POLL_INTERVAL_MARKET =
  Number.isFinite(configuredMarketPollMs) && configuredMarketPollMs >= 30_000
    ? configuredMarketPollMs
    : isDevelopmentRuntime
      ? 30_000
      : 300_000;
export const POLL_INTERVAL_ALERT_OUTCOMES =
  isDevelopmentRuntime ? 120_000 : 15 * 60_000;
export const MARKET_ENRICHMENT_INTERVAL_MS =
  isDevelopmentRuntime ? 5 * 60_000 : 15 * 60_000;
export const POLL_INTERVAL_PORTFOLIO = 300_000; // 5m
export const WS_DEBOUNCE_MS = 1_000;
export const OI_SPIKE_THRESHOLD_PCT = 5;
export const MIN_OI_USD = 10_000_000; // $10M minimum OI filter

export const COLORS = {
  positive: "#22c55e",
  negative: "#ef4444",
  warning: "#f97316",
  oiSpike: "#eab308",
  accent: "#3b82f6",
  muted: "#71717a",
  text: "#fafafa",
} as const;

// HIP-3 builder-deployed perp dexes to merge into the main perps list.
// Each name is passed as the `dex` arg to Hyperliquid info endpoints
// (meta / metaAndAssetCtxs / allMids). `xyz` carries oil, metals, equities,
// FX and index markets. Add more dex names here to surface them.
export const HIP3_DEXS = ["xyz"] as const;

// Broad market buckets for the Markets filter. Hyperliquid perps are mostly
// crypto today, so unknown symbols intentionally default to Crypto.
export type AssetCategory = "Crypto" | "Equities" | "Commodities" | "FX / Rates";

// HIP-3 (builder dex) asset → category. Keyed by the asset part of
// "dex:ASSET" (e.g. BRENTOIL from "xyz:BRENTOIL"). Non-equity markets are
// listed explicitly; anything else on a HIP-3 dex defaults to Equities
// (the `xyz` dex is predominantly single-name equities).
export const HIP3_ASSET_CATEGORIES: Record<string, AssetCategory> = {
  // Energy / metals / agriculture
  BRENTOIL: "Commodities", CL: "Commodities", NATGAS: "Commodities", TTF: "Commodities", XLE: "Commodities",
  GOLD: "Commodities", SILVER: "Commodities", PLATINUM: "Commodities", PALLADIUM: "Commodities",
  COPPER: "Commodities", ALUMINIUM: "Commodities", URANIUM: "Commodities", URNM: "Commodities",
  // Agriculture / soft commodities
  CORN: "Commodities", WHEAT: "Commodities",
  // FX
  EUR: "FX / Rates", JPY: "FX / Rates", GBP: "FX / Rates", KRW: "FX / Rates", DXY: "FX / Rates",
  // Indices / ETFs
  SP500: "Equities", JP225: "Equities", KR200: "Equities", NIFTY: "Equities", IBOV: "Equities",
  VIX: "Equities", VOL: "Equities", XYZ100: "Equities", H100: "Equities", EWY: "Equities",
  EWJ: "Equities", EWZ: "Equities", EWT: "Equities", SMH: "Equities",
};

export const ALL_CATEGORIES: AssetCategory[] = [
  "Crypto",
  "Equities",
  "Commodities",
  "FX / Rates",
];

const EQUITY_SYMBOLS = new Set([
  "AAPL",
  "MSFT",
  "NVDA",
  "GOOGL",
  "GOOG",
  "AMZN",
  "META",
  "TSLA",
  "NFLX",
  "AMD",
  "AVGO",
  "MSTR",
  "COIN",
  "HOOD",
  "PLTR",
  "SPY",
  "QQQ",
  "IWM",
  "DIA",
  "SPX500",
  "NAS100",
  "US30",
  "RUSSELL",
]);

const COMMODITY_SYMBOLS = new Set([
  "XAU",
  "XAG",
  "GOLD",
  "SILVER",
  "PAXG",
  "USOIL",
  "UKOIL",
  "WTI",
  "BRENT",
  "NATGAS",
  "COPPER",
]);

const FX_RATE_SYMBOLS = new Set([
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCHF",
  "USDCAD",
  "AUDUSD",
  "NZDUSD",
  "DXY",
  "US10Y",
  "US02Y",
  "US2Y",
  "US30Y",
]);

function normalizeMarketSymbol(symbol: string): string {
  return symbol
    .toUpperCase()
    .replace(/^K(?=[A-Z])/, "")
    .replace(/[-_/ ]?(PERP|USD|USDC)$/i, "");
}

export function getAssetCategory(coin: string): AssetCategory {
  const colon = coin.indexOf(":");
  if (colon !== -1) {
    const asset = normalizeMarketSymbol(coin.slice(colon + 1));
    return HIP3_ASSET_CATEGORIES[asset] ?? "Equities";
  }
  const normalized = normalizeMarketSymbol(coin);
  if (EQUITY_SYMBOLS.has(normalized)) return "Equities";
  if (COMMODITY_SYMBOLS.has(normalized)) return "Commodities";
  if (FX_RATE_SYMBOLS.has(normalized)) return "FX / Rates";
  return "Crypto";
}


export const WHALE_MAJORS = ["BTC", "ETH", "SOL", "HYPE"] as const;
export const WHALE_MAJOR_NOTIONAL_USD = 1_000_000;
export const WHALE_ALT_NOTIONAL_USD = 500_000;
export const WHALE_DEPOSIT_ALERT_USD = 250_000;
export const WHALE_AGGRESSIVE_ADD_MIN_OPEN_USD = 500_000;
export const WHALE_AGGRESSIVE_ADD_MIN_DELTA_PCT = 20;
export const WHALE_HIGH_LEVERAGE = 10;
export const WHALE_RISK_LOSS_USD = -500_000;
export const WHALE_LIQUIDATION_DISTANCE_PCT = 10;
export const WHALE_EPISODE_WINDOW_MS = 15 * 60 * 1000;
export const WHALE_PROFILE_LOOKBACK_30D_MS = 30 * 24 * 60 * 60 * 1000;
export const WHALE_PROFILE_LOOKBACK_7D_MS = 7 * 24 * 60 * 60 * 1000;
export const WHALE_PROFILE_LOOKBACK_24H_MS = 24 * 60 * 60 * 1000;
