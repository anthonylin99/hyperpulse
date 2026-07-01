import { Pool } from "pg";
import { getInfoClient } from "@/lib/hyperliquid";
import { getPooledDatabaseUrl } from "@/lib/databaseEnv";
import type { SentimentAsset, SentimentConfidence, SentimentReport, SentimentSide } from "@/types";

const DATABASE_URL = getPooledDatabaseUrl();
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://hyperpulsehl.com";
const DAY_MS = 86_400_000;
const LOOKBACK_MS = 6 * 60 * 60 * 1000;
const SNAPSHOT_BACKOFF_MS = 5 * 60 * 1000;
const SNAPSHOT_REFRESH_MS = Number(process.env.SENTIMENT_SNAPSHOT_REFRESH_MS ?? 60 * 60 * 1000);
const DEFAULT_ASSETS = ["BTC", "ETH", "SOL", "HYPE", "ZEC", "TON", "SUI", "DOGE"];

let pool: Pool | null = null;
let disabledUntil = 0;

type ReactionRow = {
  asset: string;
  mark_px: number | string | null;
  funding_apr: number | string | null;
  open_interest_usd: number | string | null;
  open_interest_delta_usd: number | string | null;
  last_context_at: number | string | null;
  buy_notional_usd: number | string | null;
  sell_notional_usd: number | string | null;
  trade_count: number | string | null;
  bull_zone_usd: number | string | null;
  bear_zone_usd: number | string | null;
  bull_score: number | string | null;
  bear_score: number | string | null;
  last_zone_at: number | string | null;
};

function getPool(): Pool | null {
  if (disabledUntil > Date.now() || !DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  return pool;
}

function markStoreUnavailable(error: unknown) {
  disabledUntil = Date.now() + SNAPSHOT_BACKOFF_MS;
  console.warn("[sentiment-report-store] unavailable", error);
}

function parseList(value: string | undefined, fallback: string[]) {
  if (!value) return fallback;
  const parsed = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function compactUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatPct(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(digits)}%`;
}

function reportDates(now = Date.now()) {
  const end = new Date(now);
  const start = new Date(now - 6 * DAY_MS);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  const idFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/New_York" });
  return {
    startId: idFmt.format(start),
    endId: idFmt.format(end),
    label: `Week of ${fmt.format(start)}–${fmt.format(end)}`,
  };
}

function confidenceFrom(score: number, evidenceCount: number): SentimentConfidence {
  if (score >= 68 && evidenceCount >= 3) return "high";
  if (score >= 45 && evidenceCount >= 2) return "medium";
  return "low";
}

function buildReason(args: {
  side: SentimentSide;
  netFlowUsd: number | null;
  oiChangeUsd: number | null;
  fundingApr: number | null;
  zoneUsd: number | null;
}) {
  const parts: string[] = [];
  if (args.netFlowUsd != null && Math.abs(args.netFlowUsd) > 0) {
    parts.push(`${args.netFlowUsd > 0 ? "buy" : "sell"} flow ${compactUsd(args.netFlowUsd)}`);
  }
  if (args.oiChangeUsd != null && Math.abs(args.oiChangeUsd) > 0) {
    parts.push(`OI ${args.oiChangeUsd > 0 ? "+" : ""}${compactUsd(args.oiChangeUsd)}`);
  }
  if (args.zoneUsd != null && args.zoneUsd > 0) {
    parts.push(`${args.side === "long" ? "bull" : "bear"} zone ${compactUsd(args.zoneUsd)}`);
  }
  if (args.fundingApr != null && Math.abs(args.fundingApr) > 15) {
    parts.push(`funding ${args.fundingApr > 0 ? "long-paid" : "short-paid"} ${args.fundingApr.toFixed(0)}% APR`);
  }
  return parts.slice(0, 3).join(" · ") || "Low-confidence public-flow proxy";
}

function scoreAsset(row: ReactionRow): SentimentAsset {
  const symbol = String(row.asset).toUpperCase();
  const markPx = asNumber(row.mark_px);
  const fundingApr = asNumber(row.funding_apr);
  const openInterestUsd = asNumber(row.open_interest_usd);
  const oiChangeUsd = asNumber(row.open_interest_delta_usd);
  const buyNotionalUsd = asNumber(row.buy_notional_usd) ?? 0;
  const sellNotionalUsd = asNumber(row.sell_notional_usd) ?? 0;
  const bullZoneUsd = asNumber(row.bull_zone_usd) ?? 0;
  const bearZoneUsd = asNumber(row.bear_zone_usd) ?? 0;
  const bullScore = asNumber(row.bull_score) ?? 0;
  const bearScore = asNumber(row.bear_score) ?? 0;
  const volumeProxy = buyNotionalUsd + sellNotionalUsd;
  const netTakerFlowUsd = buyNotionalUsd - sellNotionalUsd;
  const volumeVsBaseline = openInterestUsd && openInterestUsd > 0 ? clamp((volumeProxy / openInterestUsd) * 24, 0, 12) : null;

  const flowDenominator = Math.max(volumeProxy, 1);
  const flowSkew = clamp(netTakerFlowUsd / flowDenominator, -1, 1);
  const oiScore = openInterestUsd && openInterestUsd > 0 && oiChangeUsd != null ? clamp(oiChangeUsd / (openInterestUsd * 0.015), -1, 1) : 0;
  const zoneDenominator = Math.max(bullZoneUsd + bearZoneUsd, 1);
  const zoneSkew = clamp((bullZoneUsd - bearZoneUsd) / zoneDenominator, -1, 1);
  const fundingSkew = fundingApr == null ? 0 : clamp(fundingApr / 80, -1, 1);
  const participation = volumeVsBaseline == null ? 0 : clamp((volumeVsBaseline - 0.5) / 3, -0.4, 1);

  const rawTilt = 0.42 * flowSkew + 0.24 * zoneSkew + 0.18 * oiScore + 0.10 * fundingSkew + 0.06 * participation;
  const side: SentimentSide = rawTilt >= 0 ? "long" : "short";
  const magnitude = Math.abs(rawTilt);
  const score = Math.round(clamp(50 + magnitude * 50 + Math.max(bullScore, bearScore) * 0.08, 0, 99));
  const evidenceCount = [
    Math.abs(flowSkew) >= 0.08,
    Math.abs(zoneSkew) >= 0.15,
    Math.abs(oiScore) >= 0.15,
    participation > 0.1,
  ].filter(Boolean).length;
  const confidence = confidenceFrom(score, evidenceCount);
  const zoneUsd = side === "long" ? bullZoneUsd : bearZoneUsd;

  return {
    symbol,
    side,
    score,
    displayPct: clamp(50 + magnitude * 47, 50, 98),
    confidence,
    marketHref: `/markets?asset=${encodeURIComponent(symbol)}`,
    markPx,
    openInterestUsd,
    oiChangeUsd,
    buyNotionalUsd,
    sellNotionalUsd,
    netTakerFlowUsd,
    fundingApr,
    volumeProxy,
    volumeVsBaseline,
    reactionZoneUsd: zoneUsd,
    reason: buildReason({ side, netFlowUsd: netTakerFlowUsd, oiChangeUsd, fundingApr, zoneUsd }),
  };
}

async function ensureSnapshotTable(client: Pool) {
  await client.query(`
    create table if not exists sentiment_report_snapshots (
      report_id text primary key,
      period_start text not null,
      period_end text not null,
      generated_at bigint not null,
      universe text not null,
      payload jsonb not null default '{}'::jsonb
    );
  `);
  await client.query(`create index if not exists sentiment_report_snapshots_generated_idx on sentiment_report_snapshots (generated_at desc);`);
}

async function readReactionRows(client: Pool, assets: string[]): Promise<ReactionRow[]> {
  const cutoff = Date.now() - LOOKBACK_MS;
  const result = await client.query(
    `
    with asset_list as (
      select unnest($1::text[]) as asset
    ),
    latest_context as (
      select distinct on (asset)
        asset, mark_px, funding_apr, open_interest_usd, captured_at as last_context_at
      from reaction_context_snapshots
      where asset = any($1::text[])
        and bucket_ms >= $2
      order by asset, bucket_ms desc
    ),
    context_agg as (
      select
        asset,
        sum(coalesce(open_interest_delta_usd, 0)) as open_interest_delta_usd
      from reaction_context_snapshots
      where asset = any($1::text[])
        and bucket_ms >= $2
      group by asset
    ),
    trade_agg as (
      select
        asset,
        sum(coalesce(buy_notional_usd, 0)) as buy_notional_usd,
        sum(coalesce(sell_notional_usd, 0)) as sell_notional_usd,
        sum(coalesce(trade_count, 0)) as trade_count
      from reaction_trade_buckets
      where asset = any($1::text[])
        and bucket_ms >= $2
      group by asset
    ),
    zone_agg as (
      select
        asset,
        sum(case when side = 'bull' then coalesce(inferred_oi_notional_usd, trade_notional_usd, 0) else 0 end) as bull_zone_usd,
        sum(case when side = 'bear' then coalesce(inferred_oi_notional_usd, trade_notional_usd, 0) else 0 end) as bear_zone_usd,
        max(case when side = 'bull' then coalesce(score, 0) else 0 end) as bull_score,
        max(case when side = 'bear' then coalesce(score, 0) else 0 end) as bear_score,
        max(coalesce(last_seen_at, refreshed_at, generated_at, 0)) as last_zone_at
      from reaction_exposure_zones_current
      where asset = any($1::text[])
        and window_ms in (900000, 3600000)
        and (
          status = 'active'
          or coalesce(last_seen_at, refreshed_at, generated_at, 0) >= $2
        )
      group by asset
    )
    select
      asset_list.asset,
      latest_context.mark_px,
      latest_context.funding_apr,
      latest_context.open_interest_usd,
      context_agg.open_interest_delta_usd,
      latest_context.last_context_at,
      trade_agg.buy_notional_usd,
      trade_agg.sell_notional_usd,
      trade_agg.trade_count,
      zone_agg.bull_zone_usd,
      zone_agg.bear_zone_usd,
      zone_agg.bull_score,
      zone_agg.bear_score,
      zone_agg.last_zone_at
    from asset_list
    left join latest_context using (asset)
    left join context_agg using (asset)
    left join trade_agg using (asset)
    left join zone_agg using (asset)
    `,
    [assets, cutoff],
  );
  return result.rows as ReactionRow[];
}

async function fallbackRows(assets: string[]): Promise<ReactionRow[]> {
  const info = getInfoClient("mainnet");
  const [meta, ctxs] = await info.metaAndAssetCtxs();
  const universe = Array.isArray(meta?.universe) ? meta.universe : [];
  return assets
    .map((asset) => {
      const index = universe.findIndex((item: { name?: string }) => String(item?.name ?? "").toUpperCase() === asset);
      const ctx = index >= 0 ? ctxs[index] : null;
      const markPx = asNumber((ctx as Record<string, unknown> | null)?.markPx);
      const openInterestCoin = asNumber((ctx as Record<string, unknown> | null)?.openInterest);
      const fundingRate = asNumber((ctx as Record<string, unknown> | null)?.funding);
      const dayVolume = asNumber((ctx as Record<string, unknown> | null)?.dayNtlVlm);
      return {
        asset,
        mark_px: markPx,
        funding_apr: fundingRate == null ? null : fundingRate * 8760 * 100,
        open_interest_usd: markPx != null && openInterestCoin != null ? markPx * openInterestCoin : null,
        open_interest_delta_usd: 0,
        last_context_at: Date.now(),
        buy_notional_usd: fundingRate != null && fundingRate > 0 ? dayVolume ?? 0 : 0,
        sell_notional_usd: fundingRate != null && fundingRate < 0 ? dayVolume ?? 0 : 0,
        trade_count: 0,
        bull_zone_usd: 0,
        bear_zone_usd: 0,
        bull_score: 0,
        bear_score: 0,
        last_zone_at: null,
      };
    })
    .filter((row) => row.mark_px != null);
}

function aggregateReport(args: { assets: SentimentAsset[]; source: SentimentReport["coverage"]["source"]; lastEvidenceAt: number | null }): SentimentReport {
  const dates = reportDates();
  const ranked = [...args.assets].sort((a, b) => b.score - a.score);
  const topLongs = ranked.filter((asset) => asset.side === "long").slice(0, 3);
  const topShorts = ranked.filter((asset) => asset.side === "short").slice(0, 3);
  const weighted = args.assets.reduce(
    (acc, asset) => {
      const weight = Math.max(asset.openInterestUsd ?? 0, 1) * (asset.confidence === "high" ? 1 : asset.confidence === "medium" ? 0.72 : 0.45);
      acc.total += weight;
      acc.long += asset.side === "long" ? weight * (asset.displayPct / 100) : weight * ((100 - asset.displayPct) / 100);
      return acc;
    },
    { total: 0, long: 0 },
  );
  const totalLongPct = weighted.total > 0 ? clamp((weighted.long / weighted.total) * 100, 1, 99) : 50;
  const totalShortPct = 100 - totalLongPct;
  const confidenceScore = args.assets.reduce((sum, asset) => sum + (asset.confidence === "high" ? 1 : asset.confidence === "medium" ? 0.66 : 0.33), 0) / Math.max(args.assets.length, 1);
  const confidence: SentimentConfidence = confidenceScore >= 0.72 ? "high" : confidenceScore >= 0.48 ? "medium" : "low";
  const longNames = topLongs.map((asset) => asset.symbol).join(", ") || "none";
  const shortNames = topShorts.map((asset) => asset.symbol).join(", ") || "none";
  const longPhrase = longNames === "none" ? "no clean single-asset long cluster" : longNames;
  const shortPhrase = shortNames === "none" ? "no clean single-asset short cluster" : shortNames;
  const summary =
    totalLongPct >= 54
      ? `Inferred Hyperliquid public flow leans long: strongest long tilt is in ${longPhrase}, while short pressure shows ${shortPhrase}.`
      : totalShortPct >= 54
        ? `Inferred Hyperliquid public flow leans short: strongest short tilt is in ${shortPhrase}, while long pressure shows ${longPhrase}.`
        : `Inferred Hyperliquid public flow is balanced: long tilt is led by ${longPhrase}, while short pressure is led by ${shortPhrase}.`;
  const report: SentimentReport = {
    id: `sentiment-${dates.endId}`,
    generatedAt: Date.now(),
    periodStart: dates.startId,
    periodEnd: dates.endId,
    periodLabel: dates.label,
    title: "HyperPulse Inferred Retail Sentiment Index",
    summary,
    totalLongPct,
    totalShortPct,
    netTiltPct: totalLongPct - totalShortPct,
    confidence,
    topLongs,
    topShorts,
    assets: ranked,
    telegramSummary: [
      "HyperPulse Retail Sentiment",
      `${dates.label}`,
      "",
      `Tilt: ${formatPct(totalLongPct)} inferred long / ${formatPct(totalShortPct)} inferred short`,
      `Longs: ${longNames === "none" ? "no clean cluster" : longNames}`,
      `Shorts: ${shortNames === "none" ? "no clean cluster" : shortNames}`,
      "",
      "Public-flow proxy, not exact account positioning.",
      `${APP_URL.replace(/\/$/, "")}/docs/sentiment`,
    ],
    methodology: [
      "Long tilt combines positive taker flow, rising OI, bullish Reaction Map zones, funding context, and volume participation.",
      "Short tilt combines negative taker flow, rising OI, bearish Reaction Map zones, funding context, and volume participation.",
      "Aggregate tilt is OI-weighted and confidence-weighted across the tracked Hyperliquid perp set.",
      "This is an inferred public-flow proxy, not exact account-level long/short truth.",
    ],
    coverage: {
      trackedAssets: args.assets.map((asset) => asset.symbol),
      trackedAssetCount: args.assets.length,
      source: args.source,
      stale: args.lastEvidenceAt == null || Date.now() - args.lastEvidenceAt > 2 * LOOKBACK_MS,
      lastEvidenceAt: args.lastEvidenceAt,
      note: "Hyperliquid public streams only. No paid provider, no private wallet data, and no exact exchange account ratios.",
    },
  };
  return report;
}

async function persistSnapshot(report: SentimentReport) {
  const client = getPool();
  if (!client) return;
  try {
    await ensureSnapshotTable(client);
    const existing = await client.query(`select generated_at from sentiment_report_snapshots where report_id = $1 limit 1`, [report.id]);
    const existingGeneratedAt = asNumber(existing.rows[0]?.generated_at);
    if (existingGeneratedAt != null && Date.now() - existingGeneratedAt < SNAPSHOT_REFRESH_MS) {
      return;
    }
    await client.query(
      `
      insert into sentiment_report_snapshots (report_id, period_start, period_end, generated_at, universe, payload)
      values ($1,$2,$3,$4,'hyperliquid_public_flow',$5::jsonb)
      on conflict (report_id) do update set
        generated_at = excluded.generated_at,
        payload = excluded.payload || jsonb_strip_nulls(jsonb_build_object(
          'telegramSentAt', sentiment_report_snapshots.payload->'telegramSentAt',
          'telegramMessageId', sentiment_report_snapshots.payload->'telegramMessageId'
        ))
      `,
      [report.id, report.periodStart, report.periodEnd, report.generatedAt, JSON.stringify(report)],
    );
  } catch (error) {
    markStoreUnavailable(error);
  }
}

export async function buildHyperpulseSentimentReport(): Promise<SentimentReport> {
  const assets = parseList(process.env.SENTIMENT_REPORT_ASSETS, DEFAULT_ASSETS);
  const client = getPool();
  let rows: ReactionRow[] = [];
  let source: SentimentReport["coverage"]["source"] = "reaction_map";

  if (client) {
    try {
      rows = await readReactionRows(client, assets);
    } catch (error) {
      markStoreUnavailable(error);
      rows = [];
    }
  }

  const evidenceRows = rows.filter((row) => asNumber(row.last_context_at) != null || asNumber(row.last_zone_at) != null);
  if (evidenceRows.length < Math.min(3, assets.length)) {
    rows = await fallbackRows(assets);
    source = evidenceRows.length > 0 ? "mixed" : "hyperliquid_fallback";
  }

  const scored = rows.map(scoreAsset).filter((asset) => asset.markPx != null || asset.openInterestUsd != null);
  const lastEvidenceAt = Math.max(
    0,
    ...rows
      .flatMap((row) => [asNumber(row.last_context_at), asNumber(row.last_zone_at)])
      .filter((value): value is number => value != null && Number.isFinite(value)),
  ) || null;
  const report = aggregateReport({ assets: scored, source, lastEvidenceAt });
  await persistSnapshot(report);
  return report;
}
