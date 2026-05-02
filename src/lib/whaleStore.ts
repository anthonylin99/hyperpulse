import { Pool } from "pg";
import type {
  PositioningAlert,
  PositioningDigestRun,
  PositioningMarketSnapshot,
  TrackedLiquidationBucket,
  WalletTimingScore,
  WhaleAlert,
  WhaleDirectionality,
  WhaleEpisode,
  WhaleWalletProfile,
  WhaleWatchlistEntry,
} from "@/types";
import { isQualifiedHip3Symbol } from "@/lib/whaleTaxonomy";

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
const DEFAULT_WHALE_MIN_REALIZED_PNL_30D = 200_000;
const DEFAULT_FEED_FETCH_MULTIPLIER = 5;
const TRACKED_CLUSTER_MAX_DISTANCE_PCT = Number.isFinite(Number(process.env.POSITIONING_TRACKED_CLUSTER_MAX_DISTANCE_PCT))
  ? Number(process.env.POSITIONING_TRACKED_CLUSTER_MAX_DISTANCE_PCT)
  : 25;

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (!DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  }
  return pool;
}

const memoryAlerts = new Map<string, WhaleAlert>();
const memoryProfiles = new Map<string, WhaleWalletProfile>();
const memoryEpisodes = new Map<string, WhaleEpisode>();
const memoryWatchlist = new Map<string, WhaleWatchlistEntry>();
const memoryPositioningAlerts = new Map<string, PositioningAlert>();
const memoryPositioningSnapshots = new Map<string, PositioningMarketSnapshot>();
const memoryPositioningDigests = new Map<string, PositioningDigestRun>();
const memoryTrackedLiquidationBuckets = new Map<string, TrackedLiquidationBucket>();
const memoryTimingScores = new Map<string, WalletTimingScore>();
const memoryWorkerStatus: { updatedAt: number; payload: Record<string, unknown> | null } | null = null;

function normalizePositioningAlert(alert: PositioningAlert): PositioningAlert {
  const price = alert.price ?? null;
  const clusterPrice = alert.clusterPrice ?? null;
  const clusterDistancePct =
    price != null && clusterPrice != null && Number.isFinite(price) && Number.isFinite(clusterPrice) && price > 0
      ? ((clusterPrice - price) / price) * 100
      : alert.clusterDistancePct ?? null;

  const normalized = {
    ...alert,
    clusterDistancePct,
  };

  if (normalized.alertType === "liquidation_pressure" && normalized.trackedLiquidationClusterUsd != null && clusterPrice != null && clusterDistancePct != null) {
    const liquidationSide = normalized.regime === "downside_magnet" ? "long" : "short";
    const consequence = normalized.regime === "downside_magnet" ? "downside pressure can accelerate" : "squeeze pressure rises";
    normalized.whyItMatters =
      `Tracked trader ${liquidationSide} liquidations sit ${clusterDistancePct > 0 ? "+" : ""}${clusterDistancePct.toFixed(1)}% from price ` +
      `near ${clusterPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} with ${formatCompactSignedUsd(normalized.trackedLiquidationClusterUsd).replace(/^\+/, "")} at risk. ` +
      `If price trades into that zone, ${consequence}.`;
  }

  return normalized;
}

function qualifiesForPositioningSurface(alert: PositioningAlert): boolean {
  if (alert.alertType !== "liquidation_pressure") return true;
  const normalized = normalizePositioningAlert(alert);
  const distancePct = normalized.clusterDistancePct;
  if (distancePct == null || !Number.isFinite(distancePct)) return false;
  if (normalized.regime === "upside_magnet" && distancePct <= 0) return false;
  if (normalized.regime === "downside_magnet" && distancePct >= 0) return false;
  return Math.abs(distancePct) <= TRACKED_CLUSTER_MAX_DISTANCE_PCT;
}

function formatCompactSignedUsd(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function normalizeAlertSide(alert: WhaleAlert): WhaleAlert["side"] {
  if (alert.side !== "mixed") return alert.side;
  const match = `${alert.headline} ${alert.detail}`.match(/\b(long|short)\b/i);
  return match?.[1]?.toLowerCase() === "short" ? "short" : "long";
}

function buildWhyItPassed(alert: WhaleAlert, profile?: WhaleWalletProfile | null): string {
  const reasons: string[] = [];
  if (alert.sizeVsWalletAverage >= 1) {
    reasons.push(`${alert.sizeVsWalletAverage.toFixed(1)}x avg size`);
  }
  const realizedPnl = profile?.realizedPnl30d ?? alert.walletRealizedPnl30d ?? null;
  if (realizedPnl != null && Number.isFinite(realizedPnl)) {
    reasons.push(`${formatCompactSignedUsd(realizedPnl)} 30d PnL`);
  } else if (alert.directionality === "stress") {
    reasons.push("stress setup");
  } else if (alert.offsetRatio <= 0.2) {
    reasons.push("low offset");
  } else if (alert.marketType === "hip3_spot") {
    reasons.push("qualified HIP-3 flow");
  } else {
    reasons.push("positioning imbalance");
  }
  return reasons.slice(0, 2).join(" · ");
}

function normalizeAlertPayload(alert: WhaleAlert, profile?: WhaleWalletProfile | null): WhaleAlert {
  return {
    ...alert,
    side: normalizeAlertSide(alert),
    walletRealizedPnl30d: alert.walletRealizedPnl30d ?? profile?.realizedPnl30d ?? null,
    walletDirectionalHitRate30d: alert.walletDirectionalHitRate30d ?? profile?.directionalHitRate30d ?? null,
    confidenceLabel: buildWhyItPassed(alert, profile),
  };
}

function qualifiesForDefaultSurface(alert: WhaleAlert, profile?: WhaleWalletProfile | null): boolean {
  if (!profile || profile.realizedPnl30d < DEFAULT_WHALE_MIN_REALIZED_PNL_30D) return false;
  if (alert.marketType === "hip3_spot" && !isQualifiedHip3Symbol(alert.coin)) return false;
  return true;
}

export function isWhaleStoreConfigured(): boolean {
  return Boolean(getPool());
}

async function ensureTables() {
  const client = getPool();
  if (!client) return;
  await client.query(`
    create table if not exists whale_alerts (
      id text primary key,
      address text not null,
      created_at bigint not null,
      coin text not null,
      event_type text not null,
      severity text not null,
      directionality text,
      market_type text,
      risk_bucket text,
      payload jsonb not null
    );
  `);
  await client.query(`
    create table if not exists whale_profiles_current (
      address text primary key,
      updated_at bigint not null,
      payload jsonb not null
    );
  `);
  await client.query(`
    create table if not exists whale_trade_episodes (
      id text primary key,
      address text not null,
      created_at bigint not null,
      directionality text,
      market_type text,
      risk_bucket text,
      payload jsonb not null
    );
  `);
  await client.query(`
    create table if not exists whale_telegram_queue (
      id text primary key,
      alert_id text unique not null,
      created_at bigint not null,
      sent_at bigint,
      message_hash text,
      payload jsonb not null
    );
  `);
  await client.query(`
    create table if not exists whale_worker_status (
      service text primary key,
      updated_at bigint not null,
      payload jsonb
    );
  `);
  await client.query(`
    create table if not exists whale_watchlist (
      address text primary key,
      nickname text,
      created_at bigint not null
    );
  `);
  await client.query(`
    create table if not exists positioning_market_snapshots (
      id text primary key,
      asset text not null,
      created_at bigint not null,
      market_type text not null,
      payload jsonb not null
    );
  `);
  await client.query(`
    create table if not exists positioning_alerts (
      id text primary key,
      asset text not null,
      alert_type text not null,
      regime text not null,
      severity text not null,
      created_at bigint not null,
      payload jsonb not null
    );
  `);
  await client.query(`
    create table if not exists positioning_digest_runs (
      id text primary key,
      created_at bigint not null,
      payload jsonb not null,
      message_hash text,
      telegram_sent_at bigint
    );
  `);
  await client.query(`
    create table if not exists wallet_timing_scores (
      address text not null,
      asset text not null,
      lookahead_hours integer not null,
      updated_at bigint not null,
      payload jsonb not null,
      primary key (address, asset, lookahead_hours)
    );
  `);
  await client.query(`
    create table if not exists tracked_position_snapshots (
      id text primary key,
      wallet_address text not null,
      wallet_hash text not null,
      asset text not null,
      side text not null,
      market_type text not null,
      captured_at bigint not null,
      entry_px double precision not null,
      entry_bucket_price double precision,
      mark_px double precision not null,
      size double precision not null,
      signed_size double precision not null,
      notional_usd double precision not null,
      margin_used_usd double precision,
      liquidation_px double precision,
      liquidation_bucket_price double precision,
      leverage_value double precision,
      leverage_type text,
      account_equity_usd double precision,
      realized_pnl_30d double precision,
      source text not null,
      payload jsonb not null
    );
  `);
  await client.query(`
    create table if not exists liq_heatmap_buckets (
      id text primary key,
      asset text not null,
      side text not null,
      created_at bigint not null,
      bucket_size double precision not null,
      bucket_price double precision not null,
      current_price double precision not null,
      distance_pct double precision not null,
      long_notional_usd double precision not null default 0,
      short_notional_usd double precision not null default 0,
      total_notional_usd double precision not null,
      margin_usd double precision,
      weighted_avg_leverage double precision,
      avg_entry_price double precision,
      position_count integer not null,
      wallet_count integer not null,
      source text not null,
      payload jsonb not null
    );
  `);
  await client.query(`alter table whale_alerts add column if not exists directionality text;`);
  await client.query(`alter table whale_alerts add column if not exists market_type text;`);
  await client.query(`alter table whale_alerts add column if not exists risk_bucket text;`);
  await client.query(`create index if not exists whale_alerts_created_at_idx on whale_alerts (created_at desc);`);
  await client.query(`create index if not exists whale_alerts_address_idx on whale_alerts (address);`);
  await client.query(`create index if not exists whale_alerts_directionality_idx on whale_alerts (directionality, created_at desc);`);
  await client.query(`create index if not exists whale_alerts_market_type_idx on whale_alerts (market_type, created_at desc);`);
  await client.query(`create index if not exists whale_trade_episodes_created_at_idx on whale_trade_episodes (created_at desc);`);
  await client.query(`create index if not exists positioning_alerts_created_at_idx on positioning_alerts (created_at desc);`);
  await client.query(`create index if not exists positioning_alerts_asset_idx on positioning_alerts (asset, created_at desc);`);
  await client.query(`create index if not exists positioning_market_snapshots_asset_idx on positioning_market_snapshots (asset, created_at desc);`);
  await client.query(`create index if not exists tracked_position_snapshots_asset_idx on tracked_position_snapshots (asset, captured_at desc);`);
  await client.query(`create index if not exists tracked_position_snapshots_wallet_idx on tracked_position_snapshots (wallet_address, captured_at desc);`);
  await client.query(`create index if not exists tracked_position_snapshots_liq_idx on tracked_position_snapshots (asset, side, liquidation_bucket_price, captured_at desc);`);
  await client.query(`create index if not exists liq_heatmap_buckets_asset_latest_idx on liq_heatmap_buckets (asset, created_at desc);`);
  await client.query(`create index if not exists liq_heatmap_buckets_asset_side_idx on liq_heatmap_buckets (asset, side, bucket_price, created_at desc);`);
}

export async function upsertWhaleAlert(alert: WhaleAlert): Promise<void> {
  const client = getPool();
  if (!client) {
    memoryAlerts.set(alert.id, alert);
    return;
  }
  await ensureTables();
  await client.query(
    `
    insert into whale_alerts (id, address, created_at, coin, event_type, severity, directionality, market_type, risk_bucket, payload)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    on conflict (id) do update set
      address = excluded.address,
      created_at = excluded.created_at,
      coin = excluded.coin,
      event_type = excluded.event_type,
      severity = excluded.severity,
      directionality = excluded.directionality,
      market_type = excluded.market_type,
      risk_bucket = excluded.risk_bucket,
      payload = excluded.payload
  `,
    [
      alert.id,
      alert.address.toLowerCase(),
      alert.timestamp,
      alert.coin,
      alert.eventType,
      alert.severity,
      alert.directionality,
      alert.marketType,
      alert.riskBucket,
      JSON.stringify(alert),
    ],
  );
}

export async function upsertWhaleProfile(profile: WhaleWalletProfile): Promise<void> {
  const client = getPool();
  if (!client) {
    memoryProfiles.set(profile.address.toLowerCase(), profile);
    return;
  }
  await ensureTables();
  await client.query(
    `
    insert into whale_profiles_current (address, updated_at, payload)
    values ($1, $2, $3::jsonb)
    on conflict (address) do update set
      updated_at = excluded.updated_at,
      payload = excluded.payload
  `,
    [profile.address.toLowerCase(), profile.lastSeenAt ?? Date.now(), JSON.stringify(profile)],
  );
}

export async function upsertWhaleEpisode(episode: WhaleEpisode): Promise<void> {
  const client = getPool();
  if (!client) {
    memoryEpisodes.set(episode.id, episode);
    return;
  }
  await ensureTables();
  await client.query(
    `
    insert into whale_trade_episodes (id, address, created_at, directionality, market_type, risk_bucket, payload)
    values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    on conflict (id) do update set
      created_at = excluded.created_at,
      directionality = excluded.directionality,
      market_type = excluded.market_type,
      risk_bucket = excluded.risk_bucket,
      payload = excluded.payload
  `,
    [
      episode.id,
      episode.address.toLowerCase(),
      episode.startedAt,
      episode.directionality,
      episode.marketType,
      episode.riskBucket,
      JSON.stringify(episode),
    ],
  );
}

export async function upsertPositioningAlert(alert: PositioningAlert): Promise<void> {
  const client = getPool();
  if (!client) {
    memoryPositioningAlerts.set(alert.id, alert);
    return;
  }
  await ensureTables();
  await client.query(
    `
    insert into positioning_alerts (id, asset, alert_type, regime, severity, created_at, payload)
    values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    on conflict (id) do update set
      asset = excluded.asset,
      alert_type = excluded.alert_type,
      regime = excluded.regime,
      severity = excluded.severity,
      created_at = excluded.created_at,
      payload = excluded.payload
  `,
    [
      alert.id,
      alert.asset,
      alert.alertType,
      alert.regime,
      alert.severity,
      alert.timestamp,
      JSON.stringify(alert),
    ],
  );
}

export async function upsertPositioningMarketSnapshot(snapshot: PositioningMarketSnapshot): Promise<void> {
  const client = getPool();
  if (!client) {
    memoryPositioningSnapshots.set(snapshot.id, snapshot);
    return;
  }
  await ensureTables();
  await client.query(
    `
    insert into positioning_market_snapshots (id, asset, created_at, market_type, payload)
    values ($1, $2, $3, $4, $5::jsonb)
    on conflict (id) do update set
      asset = excluded.asset,
      created_at = excluded.created_at,
      market_type = excluded.market_type,
      payload = excluded.payload
  `,
    [snapshot.id, snapshot.asset, snapshot.timestamp, snapshot.marketType, JSON.stringify(snapshot)],
  );
}

export async function upsertPositioningDigestRun(digest: PositioningDigestRun): Promise<void> {
  const client = getPool();
  if (!client) {
    memoryPositioningDigests.set(digest.id, digest);
    return;
  }
  await ensureTables();
  await client.query(
    `
    insert into positioning_digest_runs (id, created_at, payload, message_hash, telegram_sent_at)
    values ($1, $2, $3::jsonb, $4, $5)
    on conflict (id) do update set
      created_at = excluded.created_at,
      payload = excluded.payload,
      message_hash = excluded.message_hash,
      telegram_sent_at = excluded.telegram_sent_at
  `,
    [digest.id, digest.createdAt, JSON.stringify(digest), null, digest.telegramSentAt],
  );
}

export async function upsertWalletTimingScore(score: WalletTimingScore): Promise<void> {
  const key = `${score.address.toLowerCase()}:${score.asset}:${score.lookaheadHours}`;
  const client = getPool();
  if (!client) {
    memoryTimingScores.set(key, score);
    return;
  }
  await ensureTables();
  await client.query(
    `
    insert into wallet_timing_scores (address, asset, lookahead_hours, updated_at, payload)
    values ($1, $2, $3, $4, $5::jsonb)
    on conflict (address, asset, lookahead_hours) do update set
      updated_at = excluded.updated_at,
      payload = excluded.payload
  `,
    [score.address.toLowerCase(), score.asset, score.lookaheadHours, score.updatedAt, JSON.stringify(score)],
  );
}

export async function getWhaleWorkerStatus(): Promise<{ updatedAt: number; payload: Record<string, unknown> | null } | null> {
  const client = getPool();
  if (!client) return memoryWorkerStatus;
  await ensureTables();
  const result = await client.query(
    `select updated_at, payload from whale_worker_status where service = 'whale-indexer' limit 1`,
  );
  if (!result.rows[0]) return null;
  return {
    updatedAt: Number(result.rows[0].updated_at),
    payload: (result.rows[0].payload as Record<string, unknown> | null) ?? null,
  };
}

export type WhaleFeedFilters = {
  severity?: string | null;
  coin?: string | null;
  eventType?: string | null;
  timeframeMs?: number;
  cursor?: number | null;
  limit?: number;
  directionality?: WhaleDirectionality | "all" | null;
  marketType?: string | null;
  riskBucket?: string | null;
  hip3Only?: boolean;
};

export type PositioningFeedFilters = {
  severity?: string | null;
  asset?: string | null;
  alertType?: string | null;
  regime?: string | null;
  timeframeMs?: number;
  cursor?: number | null;
  limit?: number;
};

export async function listWhaleAlerts(filters: WhaleFeedFilters = {}): Promise<WhaleAlert[]> {
  const severity = filters.severity && filters.severity !== "all" ? filters.severity : null;
  const coin = filters.coin && filters.coin !== "all" ? filters.coin.toUpperCase() : null;
  const eventType = filters.eventType && filters.eventType !== "all" ? filters.eventType : null;
  const directionality = filters.directionality && filters.directionality !== "all" ? filters.directionality : null;
  const marketType = filters.hip3Only ? "hip3_spot" : filters.marketType && filters.marketType !== "all" ? filters.marketType : null;
  const riskBucket = filters.riskBucket && filters.riskBucket !== "all" ? filters.riskBucket : null;
  const timeframeFloor = filters.timeframeMs ? Date.now() - filters.timeframeMs : null;
  const cursor = filters.cursor ?? null;
  const limit = filters.limit ?? 50;

  const filterMemory = (items: WhaleAlert[]) =>
    items
      .filter((alert) => (severity ? alert.severity === severity : true))
      .filter((alert) => (coin ? alert.coin === coin : true))
      .filter((alert) => (eventType ? alert.eventType === eventType : true))
      .filter((alert) => (directionality ? alert.directionality === directionality : true))
      .filter((alert) => (marketType ? alert.marketType === marketType : true))
      .filter((alert) => (riskBucket ? alert.riskBucket === riskBucket : true))
      .filter((alert) => (timeframeFloor ? alert.timestamp >= timeframeFloor : true))
      .filter((alert) => (cursor ? alert.timestamp < cursor : true))
      .filter((alert) => qualifiesForDefaultSurface(alert, memoryProfiles.get(alert.address.toLowerCase()) ?? null))
      .map((alert) => normalizeAlertPayload(alert, memoryProfiles.get(alert.address.toLowerCase()) ?? null))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

  const client = getPool();
  if (!client) {
    return filterMemory(Array.from(memoryAlerts.values()));
  }

  await ensureTables();
  const clauses = ["1=1"];
  const values: unknown[] = [];
  if (severity) {
    values.push(severity);
    clauses.push(`severity = $${values.length}`);
  }
  if (coin) {
    values.push(coin);
    clauses.push(`coin = $${values.length}`);
  }
  if (eventType) {
    values.push(eventType);
    clauses.push(`event_type = $${values.length}`);
  }
  if (directionality) {
    values.push(directionality);
    clauses.push(`directionality = $${values.length}`);
  }
  if (marketType) {
    values.push(marketType);
    clauses.push(`market_type = $${values.length}`);
  }
  if (riskBucket) {
    values.push(riskBucket);
    clauses.push(`risk_bucket = $${values.length}`);
  }
  if (timeframeFloor) {
    values.push(timeframeFloor);
    clauses.push(`created_at >= $${values.length}`);
  }
  if (cursor) {
    values.push(cursor);
    clauses.push(`created_at < $${values.length}`);
  }
  values.push(Math.max(limit * DEFAULT_FEED_FETCH_MULTIPLIER, limit));
  const result = await client.query(
    `select payload from whale_alerts where ${clauses.join(" and ")} order by created_at desc limit $${values.length}`,
    values,
  );
  const alerts = result.rows.map((row) => row.payload as WhaleAlert);
  const addresses = [...new Set(alerts.map((alert) => alert.address.toLowerCase()))];
  let profilesByAddress = new Map<string, WhaleWalletProfile>();
  if (addresses.length > 0) {
    const profileResult = await client.query(
      `select address, payload from whale_profiles_current where address = any($1::text[])`,
      [addresses],
    );
    profilesByAddress = new Map(
      profileResult.rows.map((row) => [String(row.address).toLowerCase(), row.payload as WhaleWalletProfile]),
    );
  }

  return alerts
    .filter((alert) => qualifiesForDefaultSurface(alert, profilesByAddress.get(alert.address.toLowerCase()) ?? null))
    .map((alert) => normalizeAlertPayload(alert, profilesByAddress.get(alert.address.toLowerCase()) ?? null))
    .slice(0, limit);
}

export async function getWhaleAlertsForAddress(address: string, limit = 8): Promise<WhaleAlert[]> {
  const lower = address.toLowerCase();
  const client = getPool();
  if (!client) {
    return Array.from(memoryAlerts.values())
      .filter((alert) => alert.address.toLowerCase() === lower)
      .map((alert) => normalizeAlertPayload(alert, memoryProfiles.get(lower) ?? null))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  await ensureTables();
  const result = await client.query(`select payload from whale_alerts where address = $1 order by created_at desc limit $2`, [lower, limit]);
  const profile = await getStoredWhaleProfile(lower);
  return result.rows.map((row) => normalizeAlertPayload(row.payload as WhaleAlert, profile));
}

export async function getWhaleEpisodesForAddress(address: string, limit = 50): Promise<WhaleEpisode[]> {
  const lower = address.toLowerCase();
  const client = getPool();
  if (!client) {
    return Array.from(memoryEpisodes.values())
      .filter((episode) => episode.address.toLowerCase() === lower)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }
  await ensureTables();
  const result = await client.query(
    `select payload from whale_trade_episodes where address = $1 order by created_at desc limit $2`,
    [lower, limit],
  );
  return result.rows.map((row) => row.payload as WhaleEpisode);
}

export async function getStoredWhaleProfile(address: string): Promise<WhaleWalletProfile | null> {
  const lower = address.toLowerCase();
  const client = getPool();
  if (!client) return memoryProfiles.get(lower) ?? null;
  await ensureTables();
  const result = await client.query(`select payload from whale_profiles_current where address = $1 limit 1`, [lower]);
  return result.rows[0]?.payload ?? null;
}

export async function listTrackedWhaleProfiles(limit = 500): Promise<WhaleWalletProfile[]> {
  const client = getPool();
  if (!client) {
    return Array.from(memoryProfiles.values())
      .sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0))
      .slice(0, limit);
  }
  await ensureTables();
  const result = await client.query(
    `select payload from whale_profiles_current order by updated_at desc limit $1`,
    [limit],
  );
  return result.rows.map((row) => row.payload as WhaleWalletProfile);
}

export async function listPositioningAlerts(filters: PositioningFeedFilters = {}): Promise<PositioningAlert[]> {
  const severity = filters.severity && filters.severity !== "all" ? filters.severity : null;
  const asset = filters.asset && filters.asset !== "all" ? filters.asset.toUpperCase() : null;
  const alertType = filters.alertType && filters.alertType !== "all" ? filters.alertType : null;
  const regime = filters.regime && filters.regime !== "all" ? filters.regime : null;
  const timeframeFloor = filters.timeframeMs ? Date.now() - filters.timeframeMs : null;
  const cursor = filters.cursor ?? null;
  const limit = filters.limit ?? 50;

  const filterMemory = (items: PositioningAlert[]) =>
    items
      .map((item) => normalizePositioningAlert(item))
      .filter((item) => qualifiesForPositioningSurface(item))
      .filter((item) => (severity ? item.severity === severity : true))
      .filter((item) => (asset ? item.asset === asset : true))
      .filter((item) => (alertType ? item.alertType === alertType : true))
      .filter((item) => (regime ? item.regime === regime : true))
      .filter((item) => (timeframeFloor ? item.timestamp >= timeframeFloor : true))
      .filter((item) => (cursor ? item.timestamp < cursor : true))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

  const client = getPool();
  if (!client) {
    return filterMemory(Array.from(memoryPositioningAlerts.values()));
  }

  await ensureTables();
  const clauses = ["1=1"];
  const values: unknown[] = [];
  if (severity) {
    values.push(severity);
    clauses.push(`severity = $${values.length}`);
  }
  if (asset) {
    values.push(asset);
    clauses.push(`asset = $${values.length}`);
  }
  if (alertType) {
    values.push(alertType);
    clauses.push(`alert_type = $${values.length}`);
  }
  if (regime) {
    values.push(regime);
    clauses.push(`regime = $${values.length}`);
  }
  if (timeframeFloor) {
    values.push(timeframeFloor);
    clauses.push(`created_at >= $${values.length}`);
  }
  if (cursor) {
    values.push(cursor);
    clauses.push(`created_at < $${values.length}`);
  }
  values.push(limit);
  const result = await client.query(
    `select payload from positioning_alerts where ${clauses.join(" and ")} order by created_at desc limit $${values.length}`,
    values,
  );
  return result.rows
    .map((row) => normalizePositioningAlert(row.payload as PositioningAlert))
    .filter((alert) => qualifiesForPositioningSurface(alert));
}

export async function listPositioningDigests(limit = 12): Promise<PositioningDigestRun[]> {
  const client = getPool();
  if (!client) {
    return Array.from(memoryPositioningDigests.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
  await ensureTables();
  const result = await client.query(
    `select payload, telegram_sent_at from positioning_digest_runs order by created_at desc limit $1`,
    [limit],
  );
  return result.rows.map((row) => ({
    ...(row.payload as PositioningDigestRun),
    telegramSentAt: row.telegram_sent_at == null ? (row.payload as PositioningDigestRun).telegramSentAt ?? null : Number(row.telegram_sent_at),
  }));
}

export async function listPositioningMarketSnapshots(asset: string, limit = 200): Promise<PositioningMarketSnapshot[]> {
  const normalizedAsset = asset.toUpperCase();
  const client = getPool();
  if (!client) {
    return Array.from(memoryPositioningSnapshots.values())
      .filter((snapshot) => snapshot.asset === normalizedAsset)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  await ensureTables();
  const result = await client.query(
    `select payload from positioning_market_snapshots where asset = $1 order by created_at desc limit $2`,
    [normalizedAsset, limit],
  );
  return result.rows.map((row) => row.payload as PositioningMarketSnapshot);
}

function normalizeTrackedLiquidationBucket(row: Record<string, unknown>): TrackedLiquidationBucket {
  const payload = (row.payload as Record<string, unknown> | null) ?? {};
  const trackedWalletCount = typeof payload.trackedWalletCount === "number" ? payload.trackedWalletCount : null;
  return {
    id: String(row.id),
    asset: String(row.asset),
    side: row.side === "short_liq" ? "short_liq" : "long_liq",
    timestamp: Number(row.created_at),
    bucketSize: Number(row.bucket_size),
    price: Number(row.bucket_price),
    currentPrice: Number(row.current_price),
    distancePct: Number(row.distance_pct),
    longNotionalUsd: Number(row.long_notional_usd),
    shortNotionalUsd: Number(row.short_notional_usd),
    totalNotionalUsd: Number(row.total_notional_usd),
    marginUsd: row.margin_usd == null ? null : Number(row.margin_usd),
    weightedAvgLeverage: row.weighted_avg_leverage == null ? null : Number(row.weighted_avg_leverage),
    avgEntryPrice: row.avg_entry_price == null ? null : Number(row.avg_entry_price),
    positionCount: Number(row.position_count),
    walletCount: Number(row.wallet_count),
    source: "tracked_wallet_sample",
    trackedWalletCount,
    payload,
  };
}

export async function listTrackedLiquidationBuckets(asset: string, limit = 160, maxAgeMs = 30 * 60 * 1000): Promise<TrackedLiquidationBucket[]> {
  const normalizedAsset = asset.toUpperCase();
  const client = getPool();
  if (!client) {
    return Array.from(memoryTrackedLiquidationBuckets.values())
      .filter((bucket) => bucket.asset === normalizedAsset)
      .sort((a, b) => b.timestamp - a.timestamp || b.totalNotionalUsd - a.totalNotionalUsd)
      .slice(0, limit);
  }
  await ensureTables();
  const latest = await client.query(
    `select max(created_at) as created_at from liq_heatmap_buckets where asset = $1`,
    [normalizedAsset],
  );
  const latestTimestamp = latest.rows[0]?.created_at == null ? null : Number(latest.rows[0].created_at);
  if (!latestTimestamp) return [];
  if (maxAgeMs > 0 && latestTimestamp < Date.now() - maxAgeMs) return [];
  const result = await client.query(
    `
    select *
    from liq_heatmap_buckets
    where asset = $1 and created_at = $2
    order by bucket_price desc
    limit $3
  `,
    [normalizedAsset, latestTimestamp, limit],
  );
  return result.rows.map((row) => normalizeTrackedLiquidationBucket(row));
}

export async function getWalletTimingScores(address: string): Promise<WalletTimingScore[]> {
  const normalized = address.toLowerCase();
  const client = getPool();
  if (!client) {
    return Array.from(memoryTimingScores.values())
      .filter((score) => score.address.toLowerCase() === normalized)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  await ensureTables();
  const result = await client.query(
    `select payload from wallet_timing_scores where address = $1 order by updated_at desc`,
    [normalized],
  );
  return result.rows.map((row) => row.payload as WalletTimingScore);
}

export async function listWhaleWatchlist(): Promise<WhaleWatchlistEntry[]> {
  const client = getPool();
  if (!client) {
    return Array.from(memoryWatchlist.values()).sort((a, b) => b.createdAt - a.createdAt);
  }
  await ensureTables();
  const result = await client.query(`select address, nickname, created_at from whale_watchlist order by created_at desc limit 100`);
  return result.rows.map((row) => ({
    address: row.address,
    nickname: row.nickname,
    createdAt: Number(row.created_at),
  }));
}

export async function addWhaleWatchlist(address: string, nickname: string | null): Promise<WhaleWatchlistEntry> {
  const normalized = address.toLowerCase();
  const entry: WhaleWatchlistEntry = {
    address: normalized,
    nickname: nickname?.trim() || null,
    createdAt: Date.now(),
  };
  const client = getPool();
  if (!client) {
    memoryWatchlist.set(normalized, entry);
    return entry;
  }
  await ensureTables();
  await client.query(
    `insert into whale_watchlist (address, nickname, created_at) values ($1, $2, $3)
     on conflict (address) do update set nickname = excluded.nickname`,
    [normalized, entry.nickname, entry.createdAt],
  );
  return entry;
}

export async function removeWhaleWatchlist(address: string): Promise<void> {
  const normalized = address.toLowerCase();
  const client = getPool();
  if (!client) {
    memoryWatchlist.delete(normalized);
    return;
  }
  await ensureTables();
  await client.query(`delete from whale_watchlist where address = $1`, [normalized]);
}
