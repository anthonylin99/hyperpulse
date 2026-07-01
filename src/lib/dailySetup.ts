import type { InfoClient } from "@nktkas/hyperliquid";
import { socialAlignmentForSetup, type SocialAlignment, type SocialTake } from "@/lib/socialTakes";

type AssetContext = Record<string, string | number | undefined>;

export type DailySetupSide = "long" | "short" | "watch";
export type DailySetupStatus = "watch" | "no-trade";
export type SignalLabStatus = "waiting" | "triggered" | "invalidated" | "target_hit" | "expired";

export type DailySetup = {
  coin: string;
  side: DailySetupSide;
  title: string;
  status: DailySetupStatus;
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
  sentimentAlignment: SocialAlignment;
  decisionLabel: string;
  socialContext: {
    label: string;
    note: string;
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    caveat: string;
  };
  topTakes: SocialTake[];
};

export type DailySetupSnapshot = {
  id: string;
  generatedAt: number;
  setup: DailySetup;
};

export type SignalLabSnapshot = DailySetupSnapshot & {
  status: SignalLabStatus;
  statusLabel: string;
  statusNote: string;
  expiresAt: number;
};

const MIN_OI_USD = 10_000_000;
const MIN_VOLUME_USD = 5_000_000;
const MAX_CANDIDATES = 14;
const DAY_MS = 86_400_000;
const SETUP_CACHE_MS = 60_000;
const SOCIAL_CAVEAT =
  "Curated crowd read. Price trigger and invalidation rule the trade.";

let cachedDailySetup: { expiresAt: number; snapshot: DailySetupSnapshot } | null = null;
let inflightDailySetup: Promise<DailySetupSnapshot> | null = null;

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

function formatPct(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function round(value: number | null, digits = 4): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function dayId(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

function withSocialContext(candidate: Omit<DailySetup, "decisionLabel" | "sentimentAlignment" | "socialContext" | "topTakes">): DailySetup {
  const alignment = socialAlignmentForSetup({
    asset: candidate.coin,
    side: candidate.side,
    limit: 3,
  });
  const sideLabel = candidate.side === "watch" ? "Funding watch" : `Funding ${candidate.side} watch`;
  const decisionLabel =
    alignment.alignment === "none"
      ? `${sideLabel}, no social read`
      : `${sideLabel}, ${alignment.label.toLowerCase()}`;

  return {
    ...candidate,
    sentimentAlignment: alignment.alignment,
    decisionLabel,
    socialContext: {
      label: alignment.label,
      note: alignment.note,
      bullishCount: alignment.bullishCount,
      bearishCount: alignment.bearishCount,
      neutralCount: alignment.neutralCount,
      caveat: SOCIAL_CAVEAT,
    },
    topTakes: alignment.takes,
  };
}

function noTradeSetup(): DailySetup {
  return withSocialContext({
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
      "Stand down. Forcing it is the trade to avoid.",
    ],
    guardrails: [
      "Do not trade funding alone.",
      "Wait for reclaim or breakdown confirmation.",
    ],
  });
}

function pickCandidate(candidates: DailySetup[]): DailySetup {
  return candidates.sort((a, b) => b.score - a.score)[0] ?? noTradeSetup();
}

export function roundedDailySetup(setup: DailySetup): DailySetup {
  return {
    ...setup,
    markPx: round(setup.markPx) ?? 0,
    fundingApr: round(setup.fundingApr, 2) ?? 0,
    fundingZ7d: round(setup.fundingZ7d, 2),
    priceChange24h: round(setup.priceChange24h, 2) ?? 0,
    openInterestUsd: round(setup.openInterestUsd, 0) ?? 0,
    volume24hUsd: round(setup.volume24hUsd, 0) ?? 0,
    trigger: round(setup.trigger),
    invalidation: round(setup.invalidation),
    target: round(setup.target),
    score: round(setup.score, 2) ?? 0,
  };
}

export function signalLabStatusForSetup(setup: DailySetup, generatedAt: number, now = Date.now()): Pick<SignalLabSnapshot, "status" | "statusLabel" | "statusNote" | "expiresAt"> {
  const expiresAt = generatedAt + setup.maxHoldHours * 60 * 60 * 1000;
  if (setup.status === "no-trade" || setup.side === "watch") {
    return {
      status: "waiting",
      statusLabel: "No trade",
      statusNote: "The lab is standing down until a cleaner setup appears.",
      expiresAt,
    };
  }
  if (setup.trigger == null || setup.invalidation == null || setup.target == null) {
    return {
      status: "waiting",
      statusLabel: "Waiting",
      statusNote: "Trigger, target, or invalidation is unavailable.",
      expiresAt,
    };
  }
  if (now > expiresAt) {
    return {
      status: "expired",
      statusLabel: "Expired",
      statusNote: "The watch window elapsed before a decisive outcome.",
      expiresAt,
    };
  }
  if (setup.side === "short") {
    if (setup.markPx >= setup.invalidation) {
      return {
        status: "invalidated",
        statusLabel: "Invalidated",
        statusNote: "Price reclaimed invalidation. No averaging.",
        expiresAt,
      };
    }
    if (setup.markPx <= setup.target) {
      return {
        status: "target_hit",
        statusLabel: "Target hit",
        statusNote: "Price reached the paper target.",
        expiresAt,
      };
    }
    if (setup.markPx <= setup.trigger) {
      return {
        status: "triggered",
        statusLabel: "Triggered",
        statusNote: "Price broke the trigger. Track target vs invalidation.",
        expiresAt,
      };
    }
  }
  if (setup.side === "long") {
    if (setup.markPx <= setup.invalidation) {
      return {
        status: "invalidated",
        statusLabel: "Invalidated",
        statusNote: "Price lost invalidation. No averaging.",
        expiresAt,
      };
    }
    if (setup.markPx >= setup.target) {
      return {
        status: "target_hit",
        statusLabel: "Target hit",
        statusNote: "Price reached the paper target.",
        expiresAt,
      };
    }
    if (setup.markPx >= setup.trigger) {
      return {
        status: "triggered",
        statusLabel: "Triggered",
        statusNote: "Price reclaimed the trigger. Track target vs invalidation.",
        expiresAt,
      };
    }
  }
  return {
    status: "waiting",
    statusLabel: "Waiting",
    statusNote: "Funding is notable, but price has not confirmed the setup.",
    expiresAt,
  };
}

async function buildDailySetupSnapshotUncached(info: InfoClient, now = Date.now()): Promise<DailySetupSnapshot> {
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

  const candidates: DailySetup[] = [];

  for (const asset of fundingExtreme) {
    const [fundingRows, candles] = await Promise.all([
      info
        .fundingHistory({
          coin: asset.coin,
          startTime: now - 7 * DAY_MS,
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
      candidates.push(withSocialContext({
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
          "Funding/price trigger remains the authority.",
        ],
      }));
    }

    if (asset.fundingApr <= -10 && asset.priceChange24h >= 0.5) {
      const trigger = Math.min(high24, asset.markPx + range24 * 0.18);
      const invalidation = Math.max(low24, asset.markPx - range24 * 0.22);
      const risk = trigger - invalidation;
      const target = trigger + risk * 1.5;
      candidates.push(withSocialContext({
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
          "Funding/price trigger remains the authority.",
        ],
      }));
    }
  }

  const setup = roundedDailySetup(pickCandidate(candidates));
  return {
    id: `daily-setup-${dayId(now)}-${setup.coin.toLowerCase()}-${setup.side}`,
    generatedAt: now,
    setup,
  };
}

export async function buildDailySetupSnapshot(info: InfoClient, now = Date.now()): Promise<DailySetupSnapshot> {
  if (cachedDailySetup && cachedDailySetup.expiresAt > now) {
    return cachedDailySetup.snapshot;
  }
  if (inflightDailySetup) {
    return inflightDailySetup;
  }

  inflightDailySetup = buildDailySetupSnapshotUncached(info, now)
    .then((snapshot) => {
      cachedDailySetup = {
        expiresAt: Date.now() + SETUP_CACHE_MS,
        snapshot,
      };
      return snapshot;
    })
    .finally(() => {
      inflightDailySetup = null;
    });

  return inflightDailySetup;
}

export function buildSignalLabSnapshot(snapshot: DailySetupSnapshot, now = Date.now()): SignalLabSnapshot {
  const status = signalLabStatusForSetup(snapshot.setup, snapshot.generatedAt, now);
  return {
    ...snapshot,
    ...status,
  };
}
