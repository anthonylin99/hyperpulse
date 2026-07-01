import type {
  WalletLeaderboardRow,
  WhaleDirectionalBias,
  WhalePnlWindow,
  WhalePositionSlice,
} from "../types/whales";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export type WalletSource = "tracked" | "query" | "env";

export type RawPortfolioWindow = {
  accountValueHistory?: Array<[number, string | number]>;
  pnlHistory?: Array<[number, string | number]>;
  vlm?: string | number;
};

type RawPosition = {
  type?: string;
  position?: {
    coin?: string;
    szi?: string | number;
    entryPx?: string | number | null;
    positionValue?: string | number;
    unrealizedPnl?: string | number;
    liquidationPx?: string | number | null;
    leverage?: {
      type?: string;
      value?: number;
    };
  };
};

export type RawClearinghouseState = {
  marginSummary?: {
    accountValue?: string | number;
    totalNtlPos?: string | number;
  };
  assetPositions?: RawPosition[];
  time?: number;
};

export type RawSpotState = {
  balances?: Array<{
    coin?: string;
    token?: number;
    total?: string | number;
    hold?: string | number;
    entryNtl?: string | number;
  }>;
};

function parseNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNullableNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeWhaleAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return ADDRESS_REGEX.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function parseWhaleAddressList(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(",")) {
    const address = normalizeWhaleAddress(raw);
    if (!address || seen.has(address)) continue;
    seen.add(address);
    out.push(address);
  }
  return out;
}

function emptyPnlWindow(): WhalePnlWindow {
  return { pnlUsd: null, returnPct: null, volumeUsd: null };
}

function latestHistoryValue(history: Array<[number, string | number]> | undefined): number | null {
  if (!history || history.length === 0) return null;
  const [, value] = history[history.length - 1];
  const parsed = parseNullableNumber(value);
  return parsed == null || !Number.isFinite(parsed) ? null : parsed;
}

function firstHistoryTime(history: Array<[number, string | number]> | undefined): number | null {
  if (!history || history.length === 0) return null;
  const [time] = history[0];
  return Number.isFinite(Number(time)) ? Number(time) : null;
}

function pnlFromPortfolioWindow(raw: RawPortfolioWindow | undefined): WhalePnlWindow {
  if (!raw) return emptyPnlWindow();
  const pnlUsd = latestHistoryValue(raw.pnlHistory);
  const endingValue = latestHistoryValue(raw.accountValueHistory);
  const returnPct = pnlUsd != null && endingValue != null && endingValue > 0
    ? (pnlUsd / Math.max(endingValue - pnlUsd, 1)) * 100
    : null;
  return {
    pnlUsd,
    returnPct: returnPct != null && Number.isFinite(returnPct) ? returnPct : null,
    volumeUsd: parseNullableNumber(raw.vlm),
  };
}

function extractPortfolioWindows(raw: unknown): WalletLeaderboardRow["pnl"] {
  const windows = new Map<string, RawPortfolioWindow>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!Array.isArray(item) || item.length < 2) continue;
      windows.set(String(item[0]), item[1] as RawPortfolioWindow);
    }
  }
  return {
    day: pnlFromPortfolioWindow(windows.get("day") ?? windows.get("perpDay")),
    week: pnlFromPortfolioWindow(windows.get("week") ?? windows.get("perpWeek")),
    month: pnlFromPortfolioWindow(windows.get("month") ?? windows.get("perpMonth")),
    allTime: pnlFromPortfolioWindow(windows.get("allTime") ?? windows.get("perpAllTime")),
  };
}

function firstPortfolioTime(raw: unknown): number | null {
  if (!Array.isArray(raw)) return null;
  let oldest: number | null = null;
  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const data = item[1] as RawPortfolioWindow;
    const time = firstHistoryTime(data.accountValueHistory) ?? firstHistoryTime(data.pnlHistory);
    if (time != null && (oldest == null || time < oldest)) oldest = time;
  }
  return oldest;
}

function spotValueUsd(raw: RawSpotState | null | undefined): number {
  let value = 0;
  for (const balance of raw?.balances ?? []) {
    const coin = String(balance.coin ?? "").toUpperCase();
    if (coin === "USDC") {
      value += parseNumber(balance.total);
      continue;
    }
    value += parseNumber(balance.entryNtl);
  }
  return value;
}

export function directionalBiasFromExposure(args: {
  longNotionalUsd: number;
  shortNotionalUsd: number;
}): WhaleDirectionalBias {
  const total = args.longNotionalUsd + args.shortNotionalUsd;
  if (total <= 0) return "neutral";
  const netRatio = (args.longNotionalUsd - args.shortNotionalUsd) / total;
  if (netRatio >= 0.67) return "very_bullish";
  if (netRatio >= 0.22) return "bullish";
  if (netRatio <= -0.67) return "very_bearish";
  if (netRatio <= -0.22) return "bearish";
  return "neutral";
}

export function directionalLabel(bias: WhaleDirectionalBias): string {
  if (bias === "very_bullish") return "Very Bullish";
  if (bias === "bullish") return "Bullish";
  if (bias === "very_bearish") return "Very Bearish";
  if (bias === "bearish") return "Bearish";
  return "Neutral";
}

function normalizePositions(raw: RawClearinghouseState): {
  positions: WhalePositionSlice[];
  longNotionalUsd: number;
  shortNotionalUsd: number;
  unrealizedPnlUsd: number;
} {
  const positions: WhalePositionSlice[] = [];
  let longNotionalUsd = 0;
  let shortNotionalUsd = 0;
  let unrealizedPnlUsd = 0;

  for (const item of raw.assetPositions ?? []) {
    const position = item.position;
    if (!position) continue;
    const size = parseNumber(position.szi);
    const absSize = Math.abs(size);
    const notionalUsd = parseNumber(position.positionValue);
    if (absSize <= 0 || notionalUsd <= 0) continue;
    const side = size >= 0 ? "long" : "short";
    if (side === "long") longNotionalUsd += notionalUsd;
    else shortNotionalUsd += notionalUsd;
    const pnl = parseNumber(position.unrealizedPnl);
    unrealizedPnlUsd += pnl;
    positions.push({
      coin: String(position.coin ?? "UNKNOWN"),
      side,
      size,
      entryPx: parseNullableNumber(position.entryPx),
      notionalUsd,
      unrealizedPnlUsd: pnl,
      leverage: position.leverage?.value ?? null,
      liquidationPx: parseNullableNumber(position.liquidationPx),
    });
  }

  positions.sort((a, b) => b.notionalUsd - a.notionalUsd);
  return { positions, longNotionalUsd, shortNotionalUsd, unrealizedPnlUsd };
}

export function buildWalletLeaderboardRow(args: {
  walletAddress: string;
  source: WalletSource;
  firstSeenAt?: number;
  clearinghouseState: RawClearinghouseState;
  spotState?: RawSpotState | null;
  portfolio?: unknown;
  now?: number;
}): WalletLeaderboardRow {
  const now = args.now ?? Date.now();
  const accountValueUsd = parseNumber(args.clearinghouseState.marginSummary?.accountValue);
  const {
    positions,
    longNotionalUsd,
    shortNotionalUsd,
    unrealizedPnlUsd,
  } = normalizePositions(args.clearinghouseState);
  const notionalExposureUsd = longNotionalUsd + shortNotionalUsd;
  const effectiveLeverage = accountValueUsd > 0 ? notionalExposureUsd / accountValueUsd : null;
  const directionalBias = directionalBiasFromExposure({ longNotionalUsd, shortNotionalUsd });
  const portfolioFirstSeen = firstPortfolioTime(args.portfolio);
  const firstSeenAt = args.firstSeenAt ?? portfolioFirstSeen;

  return {
    rank: 0,
    walletAddress: args.walletAddress.toLowerCase(),
    ageDays: firstSeenAt != null ? Math.max(Math.floor((now - firstSeenAt) / DAY_MS), 0) : null,
    accountValueUsd,
    spotValueUsd: spotValueUsd(args.spotState),
    notionalExposureUsd,
    longNotionalUsd,
    shortNotionalUsd,
    effectiveLeverage,
    directionalBias,
    directionalLabel: directionalLabel(directionalBias),
    unrealizedPnlUsd,
    pnl: extractPortfolioWindows(args.portfolio),
    topPositions: positions.slice(0, 5),
    source: args.source,
    updatedAt: args.clearinghouseState.time ?? now,
    warnings: [],
  };
}
