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

export const POLL_INTERVAL_MARKET = 30_000; // 30s
export const POLL_INTERVAL_PORTFOLIO = 300_000; // 5m
export const WS_DEBOUNCE_MS = 1_000;
export const WHALE_THRESHOLD_USD = 500_000;
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

// Asset categories — Hyperliquid API doesn't provide categories,
// so we maintain a static map. Unlisted assets default to "Other".
export type AssetCategory = "L1" | "L2" | "DeFi" | "Meme" | "AI" | "Gaming" | "HL Native" | "Other";

export const ASSET_CATEGORIES: Record<string, AssetCategory> = {
  // Layer 1
  BTC: "L1", ETH: "L1", SOL: "L1", AVAX: "L1", BNB: "L1", ADA: "L1",
  DOT: "L1", NEAR: "L1", SUI: "L1", APT: "L1", TON: "L1", ATOM: "L1",
  TRX: "L1", XRP: "L1", LTC: "L1", BCH: "L1", ETC: "L1", XLM: "L1",
  FIL: "L1", HBAR: "L1", IOTA: "L1", ALGO: "L1", CELO: "L1", ICP: "L1",
  INJ: "L1", SEI: "L1", MINA: "L1", TAO: "L1", KAS: "L1", STX: "L1",
  BSV: "L1", NEO: "L1", ZEN: "L1", XMR: "L1", DASH: "L1", ZEC: "L1",
  S: "L1", BERA: "L1", MOVE: "L1", IP: "L1",

  // Layer 2 / Infrastructure
  ARB: "L2", OP: "L2", STRK: "L2", MANTA: "L2", BLAST: "L2", ZK: "L2",
  ZETA: "L2", POL: "L2", W: "L2", DYDX: "L2", IMX: "L2",
  LINK: "L2", PYTH: "L2", ZRO: "L2", LAYER: "L2", LINEA: "L2",
  INIT: "L2",

  // DeFi
  AAVE: "DeFi", UNI: "DeFi", CRV: "DeFi", COMP: "DeFi", SUSHI: "DeFi",
  PENDLE: "DeFi", GMX: "DeFi", SNX: "DeFi", LDO: "DeFi", RUNE: "DeFi",
  JUP: "DeFi", ONDO: "DeFi", ENS: "DeFi", CAKE: "DeFi", ETHFI: "DeFi",
  ENA: "DeFi", MNT: "DeFi", RSR: "DeFi", MORPHO: "DeFi", USUAL: "DeFi",
  AERO: "DeFi", EIGEN: "DeFi", KAITO: "DeFi", RESOLV: "DeFi", SKY: "DeFi",
  STABLE: "DeFi", STBL: "DeFi", PAXG: "DeFi",

  // Meme
  DOGE: "Meme", kPEPE: "Meme", kSHIB: "Meme", WIF: "Meme", kBONK: "Meme",
  POPCAT: "Meme", FARTCOIN: "Meme", TRUMP: "Meme", PNUT: "Meme",
  MOODENG: "Meme", BRETT: "Meme", MEW: "Meme", TURBO: "Meme",
  NOT: "Meme", BOME: "Meme", PEOPLE: "Meme", MEME: "Meme",
  CHILLGUY: "Meme", PENGU: "Meme", kFLOKI: "Meme", MELANIA: "Meme",
  VINE: "Meme", TST: "Meme", SPX: "Meme", kNEIRO: "Meme",
  APE: "Meme", kLUNC: "Meme", USTC: "Meme", GOAT: "Meme",
  GRASS: "Meme", DOOD: "Meme", PUMP: "Meme", YZY: "Meme",
  BABY: "Meme", ANIME: "Meme", MON: "Meme", MEGA: "Meme",

  // AI
  FET: "AI", RENDER: "AI", VIRTUAL: "AI", AIXBT: "AI", GRIFFAIN: "AI",
  ZEREBRO: "AI", IO: "AI", AR: "AI", WLD: "AI", BIO: "AI",
  PROMPT: "AI", SOPH: "AI", PROVE: "AI",

  // Gaming / NFT
  AXS: "Gaming", GALA: "Gaming", SAND: "Gaming", SUPER: "Gaming",
  YGG: "Gaming", BIGTIME: "Gaming", XAI: "Gaming", HMSTR: "Gaming",
  NXPC: "Gaming", GMT: "Gaming", BANANA: "Gaming", ACE: "Gaming",
  BLUR: "Gaming", ME: "Gaming",

  // Hyperliquid Native
  HYPE: "HL Native", PURR: "HL Native", HYPER: "HL Native",
  JEFF: "HL Native",
};

export const ALL_CATEGORIES: AssetCategory[] = [
  "L2", "AI", "Gaming", "HL Native",
];

export function getAssetCategory(coin: string): AssetCategory {
  return ASSET_CATEGORIES[coin] ?? "Other";
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
