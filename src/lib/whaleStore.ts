import { Pool } from "pg";
import type { WhaleAlert, WhaleWalletProfile, WhaleWatchlistEntry } from "@/types";

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";

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
const memoryWatchlist = new Map<string, WhaleWatchlistEntry>();

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
    create table if not exists whale_watchlist (
      address text primary key,
      nickname text,
      created_at bigint not null
    );
  `);
  await client.query(`create index if not exists whale_alerts_created_at_idx on whale_alerts (created_at desc);`);
  await client.query(`create index if not exists whale_alerts_address_idx on whale_alerts (address);`);
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
    insert into whale_alerts (id, address, created_at, coin, event_type, severity, payload)
    values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    on conflict (id) do update set
      address = excluded.address,
      created_at = excluded.created_at,
      coin = excluded.coin,
      event_type = excluded.event_type,
      severity = excluded.severity,
      payload = excluded.payload
  `,
    [
      alert.id,
      alert.address.toLowerCase(),
      alert.timestamp,
      alert.coin,
      alert.eventType,
      alert.severity,
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

export type WhaleFeedFilters = {
  severity?: string | null;
  coin?: string | null;
  eventType?: string | null;
  timeframeMs?: number;
  cursor?: number | null;
  limit?: number;
};

export async function listWhaleAlerts(filters: WhaleFeedFilters = {}): Promise<WhaleAlert[]> {
  const severity = filters.severity && filters.severity !== "all" ? filters.severity : null;
  const coin = filters.coin && filters.coin !== "all" ? filters.coin.toUpperCase() : null;
  const eventType = filters.eventType && filters.eventType !== "all" ? filters.eventType : null;
  const timeframeFloor = filters.timeframeMs ? Date.now() - filters.timeframeMs : null;
  const cursor = filters.cursor ?? null;
  const limit = filters.limit ?? 50;

  const client = getPool();
  if (!client) {
    return Array.from(memoryAlerts.values())
      .filter((alert) => (severity ? alert.severity === severity : true))
      .filter((alert) => (coin ? alert.coin === coin : true))
      .filter((alert) => (eventType ? alert.eventType === eventType : true))
      .filter((alert) => (timeframeFloor ? alert.timestamp >= timeframeFloor : true))
      .filter((alert) => (cursor ? alert.timestamp < cursor : true))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
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
    `select payload from whale_alerts where ${clauses.join(" and ")} order by created_at desc limit $${values.length}`,
    values,
  );
  return result.rows.map((row) => row.payload as WhaleAlert);
}

export async function getWhaleAlertsForAddress(address: string, limit = 8): Promise<WhaleAlert[]> {
  const lower = address.toLowerCase();
  const client = getPool();
  if (!client) {
    return Array.from(memoryAlerts.values())
      .filter((alert) => alert.address.toLowerCase() === lower)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  await ensureTables();
  const result = await client.query(
    `select payload from whale_alerts where address = $1 order by created_at desc limit $2`,
    [lower, limit],
  );
  return result.rows.map((row) => row.payload as WhaleAlert);
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
