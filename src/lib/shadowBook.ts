"use client";

export const SHADOW_BOOK_STORAGE_KEY = "hyperpulse.shadowBook.v1";
export const SHADOW_BOOK_MOMENTUM_STRATEGY_KEY = "hyperpulse.shadowBook.momentumStrategy.v1";

export type ShadowTradeSide = "long" | "short";
export type ShadowTradeSource = "manual" | "momentum_alert" | "market_setup" | "momentum_strategy";
export type ShadowTradeStatus = "open" | "closed";

export interface ShadowMomentumStrategyState {
  enabled: boolean;
  dailyCap: 1 | 2;
  marginUsd: number;
  lastRunAt: number | null;
  takenSignalIds: string[];
}

export interface ShadowTrade {
  id: string;
  createdAt: number;
  asset: string;
  side: ShadowTradeSide;
  entryPrice: number;
  marginUsd: number;
  leverage: number;
  notionalUsd: number;
  stopPrice: number | null;
  targetPrice: number | null;
  source: ShadowTradeSource;
  sourceId?: string | null;
  status: ShadowTradeStatus;
  observedHighPrice: number;
  observedLowPrice: number;
  closedAt?: number | null;
  exitPrice?: number | null;
}

export type ShadowTradeDraft = {
  asset: string;
  side: ShadowTradeSide;
  entryPrice: number;
  marginUsd?: number;
  leverage?: number;
  stopPrice?: number | null;
  targetPrice?: number | null;
  source?: ShadowTradeSource;
  sourceId?: string | null;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function safeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeOptionalPrice(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeTrade(raw: Partial<ShadowTrade>): ShadowTrade | null {
  const asset = String(raw.asset ?? "").trim().toUpperCase();
  const entryPrice = safeNumber(raw.entryPrice, 0);
  if (!asset || entryPrice <= 0) return null;

  const side = raw.side === "short" ? "short" : "long";
  const marginUsd = Math.max(1, safeNumber(raw.marginUsd, 100));
  const leverage = Math.max(1, safeNumber(raw.leverage, 3));
  const notionalUsd = Math.max(marginUsd, safeNumber(raw.notionalUsd, marginUsd * leverage));
  const status = raw.status === "closed" ? "closed" : "open";
  const observedHighPrice = Math.max(entryPrice, safeNumber(raw.observedHighPrice, entryPrice));
  const observedLowPrice = Math.min(entryPrice, safeNumber(raw.observedLowPrice, entryPrice));

  return {
    id: String(raw.id ?? newShadowTradeId()),
    createdAt: safeNumber(raw.createdAt, Date.now()),
    asset,
    side,
    entryPrice,
    marginUsd,
    leverage,
    notionalUsd,
    stopPrice: safeOptionalPrice(raw.stopPrice),
    targetPrice: safeOptionalPrice(raw.targetPrice),
    source: raw.source === "momentum_alert" || raw.source === "market_setup" || raw.source === "momentum_strategy" ? raw.source : "manual",
    sourceId: raw.sourceId == null ? null : String(raw.sourceId),
    status,
    observedHighPrice,
    observedLowPrice,
    closedAt: raw.closedAt == null ? null : safeNumber(raw.closedAt, 0),
    exitPrice: safeOptionalPrice(raw.exitPrice),
  };
}

export function loadShadowTrades(): ShadowTrade[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(SHADOW_BOOK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeTrade(item as Partial<ShadowTrade>))
      .filter((trade): trade is ShadowTrade => trade != null);
  } catch {
    return [];
  }
}

export function saveShadowTrades(trades: ShadowTrade[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(SHADOW_BOOK_STORAGE_KEY, JSON.stringify(trades));
}

export function loadShadowMomentumStrategy(): ShadowMomentumStrategyState {
  if (!isBrowser()) {
    return {
      enabled: false,
      dailyCap: 2,
      marginUsd: 100,
      lastRunAt: null,
      takenSignalIds: [],
    };
  }
  try {
    const raw = window.localStorage.getItem(SHADOW_BOOK_MOMENTUM_STRATEGY_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<ShadowMomentumStrategyState> : {};
    const dailyCap = Number(parsed.dailyCap) === 1 ? 1 : 2;
    const marginUsd = Math.max(1, Number(parsed.marginUsd ?? 100));
    return {
      enabled: parsed.enabled === true,
      dailyCap,
      marginUsd,
      lastRunAt: Number.isFinite(Number(parsed.lastRunAt)) ? Number(parsed.lastRunAt) : null,
      takenSignalIds: Array.isArray(parsed.takenSignalIds) ? parsed.takenSignalIds.map(String).slice(0, 100) : [],
    };
  } catch {
    return {
      enabled: false,
      dailyCap: 2,
      marginUsd: 100,
      lastRunAt: null,
      takenSignalIds: [],
    };
  }
}

export function saveShadowMomentumStrategy(state: ShadowMomentumStrategyState): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(SHADOW_BOOK_MOMENTUM_STRATEGY_KEY, JSON.stringify(state));
}

export function newShadowTradeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `shadow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createShadowTrade(draft: ShadowTradeDraft): ShadowTrade {
  const marginUsd = Math.max(1, safeNumber(draft.marginUsd, 100));
  const leverage = Math.max(1, safeNumber(draft.leverage, 3));
  const entryPrice = Math.max(0, safeNumber(draft.entryPrice, 0));
  const asset = draft.asset.trim().toUpperCase();
  if (!asset || entryPrice <= 0) {
    throw new Error("A valid asset and entry price are required.");
  }

  return {
    id: newShadowTradeId(),
    createdAt: Date.now(),
    asset,
    side: draft.side,
    entryPrice,
    marginUsd,
    leverage,
    notionalUsd: marginUsd * leverage,
    stopPrice: safeOptionalPrice(draft.stopPrice),
    targetPrice: safeOptionalPrice(draft.targetPrice),
    source: draft.source ?? "manual",
    sourceId: draft.sourceId ?? null,
    status: "open",
    observedHighPrice: entryPrice,
    observedLowPrice: entryPrice,
    closedAt: null,
    exitPrice: null,
  };
}

export function closeShadowTrade(trade: ShadowTrade, exitPrice: number): ShadowTrade {
  return {
    ...trade,
    status: "closed",
    closedAt: Date.now(),
    exitPrice,
    observedHighPrice: Math.max(trade.observedHighPrice, exitPrice),
    observedLowPrice: Math.min(trade.observedLowPrice, exitPrice),
  };
}

export function updateObservedPrice(trade: ShadowTrade, markPrice: number): ShadowTrade {
  if (trade.status !== "open" || !Number.isFinite(markPrice) || markPrice <= 0) return trade;
  const observedHighPrice = Math.max(trade.observedHighPrice, markPrice);
  const observedLowPrice = Math.min(trade.observedLowPrice, markPrice);
  if (observedHighPrice === trade.observedHighPrice && observedLowPrice === trade.observedLowPrice) return trade;
  return { ...trade, observedHighPrice, observedLowPrice };
}

export function calculateShadowTradeStats(trade: ShadowTrade, currentPrice?: number | null) {
  const markPrice = trade.status === "closed"
    ? trade.exitPrice ?? currentPrice ?? trade.entryPrice
    : currentPrice ?? trade.entryPrice;
  const rawReturn = trade.side === "long"
    ? (markPrice - trade.entryPrice) / trade.entryPrice
    : (trade.entryPrice - markPrice) / trade.entryPrice;
  const leveredReturnPct = rawReturn * trade.leverage * 100;
  const pnlUsd = trade.marginUsd * rawReturn * trade.leverage;

  const favorableRaw = trade.side === "long"
    ? (trade.observedHighPrice - trade.entryPrice) / trade.entryPrice
    : (trade.entryPrice - trade.observedLowPrice) / trade.entryPrice;
  const adverseRaw = trade.side === "long"
    ? (trade.observedLowPrice - trade.entryPrice) / trade.entryPrice
    : (trade.entryPrice - trade.observedHighPrice) / trade.entryPrice;

  const stopHit = trade.stopPrice != null
    ? trade.side === "long"
      ? markPrice <= trade.stopPrice
      : markPrice >= trade.stopPrice
    : false;
  const targetHit = trade.targetPrice != null
    ? trade.side === "long"
      ? markPrice >= trade.targetPrice
      : markPrice <= trade.targetPrice
    : false;

  return {
    markPrice,
    rawReturnPct: rawReturn * 100,
    leveredReturnPct,
    pnlUsd,
    mfePct: favorableRaw * trade.leverage * 100,
    maePct: adverseRaw * trade.leverage * 100,
    stopHit,
    targetHit,
  };
}
