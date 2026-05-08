import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const contents = readFileSync(file, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}

loadLocalEnv();

const DATABASE_URL =
  process.env.NEON_DATABASE_URL_POOLING ??
  process.env.NEON_DATABASE_URL ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  "";

const ASSETS = (process.env.REACTION_MAP_HEALTH_ASSETS ?? "BTC,ETH,SOL")
  .split(",")
  .map((asset) => asset.trim().toUpperCase())
  .filter(Boolean);

const WINDOW_MS = Number(process.env.REACTION_MAP_HEALTH_WINDOW_MS ?? 15 * 60 * 1000);
const EXPECTED_TABLES = new Set([
  "schema_migrations",
  "reaction_context_snapshots",
  "reaction_trade_buckets",
  "reaction_orderbook_buckets",
  "reaction_exposure_zones_current",
  "reaction_exposure_zone_events",
]);

if (!DATABASE_URL) {
  console.error("[reaction-health] NEON_DATABASE_URL_POOLING, NEON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL is required.");
  process.exit(1);
}

function ageLabel(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return "n/a";
  const value = Number(seconds);
  if (value < 90) return `${value.toFixed(1)}s`;
  if (value < 7200) return `${(value / 60).toFixed(1)}m`;
  return `${(value / 3600).toFixed(1)}h`;
}

function compactUsd(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "n/a";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });

try {
  const client = await pool.connect();
  try {
    await client.query("begin read only");

    const tableResult = await client.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name
    `);
    const tables = tableResult.rows.map((row) => String(row.table_name));
    const unexpectedTables = tables.filter((table) => !EXPECTED_TABLES.has(table));

    const freshnessResult = await client.query(
      `
      select
        asset,
        window_ms,
        count(*) filter (where status = 'active')::int as active_rows,
        count(*) filter (where status = 'stale')::int as stale_rows,
        count(*) filter (where status = 'retired')::int as retired_rows,
        to_char(to_timestamp(max(refreshed_at) / 1000.0) at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') as latest_refresh_utc,
        round(((extract(epoch from now()) * 1000 - max(refreshed_at)) / 1000.0)::numeric, 1)::float as refresh_age_seconds
      from reaction_exposure_zones_current
      where upper(asset) = any($1::text[])
        and window_ms = $2
      group by asset, window_ms
      order by asset
      `,
      [ASSETS, WINDOW_MS],
    );

    const levelResult = await client.query(
      `
      select
        asset,
        side,
        rank,
        status,
        zone_low,
        zone_high,
        distance_pct,
        score,
        confidence,
        buy_notional_usd,
        sell_notional_usd,
        inferred_oi_notional_usd,
        trade_notional_usd,
        to_char(to_timestamp(first_seen_at / 1000.0) at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') as first_seen_utc,
        to_char(to_timestamp(refreshed_at / 1000.0) at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') as refreshed_utc
      from reaction_exposure_zones_current
      where upper(asset) = any($1::text[])
        and window_ms = $2
        and status <> 'retired'
      order by asset, side, rank
      `,
      [ASSETS, WINDOW_MS],
    );

    const bucketResult = await client.query(
      `
      select 'context' as source, upper(asset) as asset, max(bucket_ms) as latest_bucket_ms, count(*)::int as rows
      from reaction_context_snapshots
      where upper(asset) = any($1::text[])
      group by upper(asset)
      union all
      select 'book' as source, upper(asset) as asset, max(bucket_ms) as latest_bucket_ms, count(*)::int as rows
      from reaction_orderbook_buckets
      where upper(asset) = any($1::text[])
      group by upper(asset)
      union all
      select 'trades' as source, upper(asset) as asset, max(bucket_ms) as latest_bucket_ms, count(*)::int as rows
      from reaction_trade_buckets
      where upper(asset) = any($1::text[])
      group by upper(asset)
      order by asset, source
      `,
      [ASSETS],
    );

    await client.query("commit");

    console.log(`[reaction-health] window=${WINDOW_MS}ms assets=${ASSETS.join(",")}`);
    if (unexpectedTables.length > 0) {
      console.log(`[reaction-health] unexpected tables: ${unexpectedTables.join(", ")}`);
    } else {
      console.log("[reaction-health] unexpected tables: none");
    }

    console.table(
      freshnessResult.rows.map((row) => ({
        asset: row.asset,
        active: row.active_rows,
        stale: row.stale_rows,
        retired: row.retired_rows,
        latestRefreshUtc: row.latest_refresh_utc,
        age: ageLabel(row.refresh_age_seconds),
      })),
    );

    console.table(
      levelResult.rows.map((row) => ({
        asset: row.asset,
        side: row.side,
        rank: row.rank,
        status: row.status,
        zone: `${Number(row.zone_low).toFixed(Number(row.zone_low) >= 100 ? 0 : 2)}-${Number(row.zone_high).toFixed(Number(row.zone_high) >= 100 ? 0 : 2)}`,
        distancePct: Number(row.distance_pct).toFixed(2),
        score: Number(row.score).toFixed(0),
        buy: compactUsd(row.buy_notional_usd),
        sell: compactUsd(row.sell_notional_usd),
        inferredOi: compactUsd(row.inferred_oi_notional_usd),
        firstSeenUtc: row.first_seen_utc,
        refreshedUtc: row.refreshed_utc,
      })),
    );

    console.table(
      bucketResult.rows.map((row) => ({
        asset: row.asset,
        source: row.source,
        rows: row.rows,
        latestBucketUtc: row.latest_bucket_ms
          ? new Date(Number(row.latest_bucket_ms)).toISOString().replace("T", " ").slice(0, 19)
          : "n/a",
      })),
    );
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
