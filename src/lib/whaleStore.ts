import { Pool } from "pg";
import type { WhaleAlert, WhaleDirectionality, WhaleEpisode, WhaleWalletProfile, WhaleWatchlistEntry } from "@/types";
import { isQualifiedHip3Symbol } from "@/lib/whaleTaxonomy";

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
const DEFAULT_WHALE_MIN_REALIZED_PNL_30D = 200_000;
const DEFAULT_FEED_FETCH_MULTIPLIER = 5;

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
const memoryWorkerStatus: { updatedAt: number; payload: Record<string, unknown> | null } | null = null;

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
  await client.query(`alter table whale_alerts add column if not exists directionality text;`);
  await client.query(`alter table whale_alerts add column if not exists market_type text;`);
  await client.query(`alter table whale_alerts add column if not exists risk_bucket text;`);
  await client.query(`create index if not exists whale_alerts_created_at_idx on whale_alerts (created_at desc);`);
  await client.query(`create index if not exists whale_alerts_address_idx on whale_alerts (address);`);
  await client.query(`create index if not exists whale_alerts_directionality_idx on whale_alerts (directionality, created_at desc);`);
  await client.query(`create index if not exists whale_alerts_market_type_idx on whale_alerts (market_type, created_at desc);`);
  await client.query(`create index if not exists whale_trade_episodes_created_at_idx on whale_trade_episodes (created_at desc);`);
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
