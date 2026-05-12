import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      value = value.replace(/^["']|["']$/g, "").replace(/\\n/g, "");
      process.env[key] ??= value;
    }
  }
}

loadLocalEnv();

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function formatMb(bytes) {
  return `${(Number(bytes || 0) / 1024 / 1024).toFixed(2)} MB`;
}

const DATABASE_URL =
  process.env.NEON_DATABASE_URL_POOLING ??
  process.env.NEON_DATABASE_URL ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  "";

if (!DATABASE_URL) {
  console.error("[reaction-prune] DATABASE_URL/NEON_DATABASE_URL is required.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const vacuumFull = process.argv.includes("--vacuum-full");
const rawHours = Number(argValue("hours", "6"));
const hours = Number.isFinite(rawHours) && rawHours > 0 ? rawHours : 6;
const cutoff = Date.now() - hours * 60 * 60 * 1000;
const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });

const retentionTargets = [
  { table: "reaction_orderbook_buckets", column: "bucket_ms" },
  { table: "reaction_trade_buckets", column: "bucket_ms" },
  { table: "reaction_context_snapshots", column: "bucket_ms" },
  { table: "reaction_exposure_zone_events", column: "event_at", hours: 48 },
];

async function tableExists(client, table) {
  const result = await client.query("select to_regclass($1) as name", [`public.${table}`]);
  return Boolean(result.rows[0]?.name);
}

async function relationSize(client, table) {
  const result = await client.query("select pg_total_relation_size($1::regclass) as bytes", [`public.${table}`]);
  return Number(result.rows[0]?.bytes ?? 0);
}

async function countOldRows(client, target) {
  const targetCutoff = Date.now() - (target.hours ?? hours) * 60 * 60 * 1000;
  const result = await client.query(`select count(*)::int as count from ${target.table} where ${target.column} < $1`, [targetCutoff]);
  return { count: Number(result.rows[0]?.count ?? 0), cutoff: targetCutoff };
}

async function pruneTable(client, target) {
  const { count, cutoff: targetCutoff } = await countOldRows(client, target);
  const before = await relationSize(client, target.table);
  if (!apply) {
    return { table: target.table, count, before, after: before, dryRun: true };
  }

  const result = await client.query(`delete from ${target.table} where ${target.column} < $1`, [targetCutoff]);
  if (vacuumFull) {
    await client.query(`vacuum full analyze ${target.table}`);
  } else {
    await client.query(`vacuum analyze ${target.table}`);
  }
  const after = await relationSize(client, target.table);
  return {
    table: target.table,
    count: Number(result.rowCount ?? count),
    before,
    after,
    dryRun: false,
  };
}

async function pruneCurrentZones(client) {
  const table = "reaction_exposure_zones_current";
  if (!(await tableExists(client, table))) return null;
  const before = await relationSize(client, table);
  const staleCutoff = Date.now() - 48 * 60 * 60 * 1000;
  const countResult = await client.query(
    `select count(*)::int as count from ${table} where status <> 'active' and coalesce(last_seen_at, refreshed_at, generated_at, 0) < $1`,
    [staleCutoff],
  );
  if (!apply) {
    return { table, count: Number(countResult.rows[0]?.count ?? 0), before, after: before, dryRun: true };
  }
  const result = await client.query(
    `delete from ${table} where status <> 'active' and coalesce(last_seen_at, refreshed_at, generated_at, 0) < $1`,
    [staleCutoff],
  );
  if (vacuumFull) await client.query(`vacuum full analyze ${table}`);
  else await client.query(`vacuum analyze ${table}`);
  const after = await relationSize(client, table);
  return { table, count: Number(result.rowCount ?? 0), before, after, dryRun: false };
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`[reaction-prune] mode=${apply ? "apply" : "dry-run"} retention=${hours}h vacuumFull=${vacuumFull}`);
    const dbBefore = await client.query("select pg_database_size(current_database()) as bytes");
    const rows = [];
    for (const target of retentionTargets) {
      if (!(await tableExists(client, target.table))) continue;
      rows.push(await pruneTable(client, target));
    }
    const zones = await pruneCurrentZones(client);
    if (zones) rows.push(zones);
    const dbAfter = await client.query("select pg_database_size(current_database()) as bytes");
    for (const row of rows) {
      console.log(
        `${row.table.padEnd(34)} rows=${String(row.count).padStart(8)} size ${formatMb(row.before).padStart(10)} -> ${formatMb(row.after).padStart(10)}`,
      );
    }
    console.log(`database ${formatMb(dbBefore.rows[0].bytes)} -> ${formatMb(dbAfter.rows[0].bytes)}`);
    if (!apply) {
      console.log("[reaction-prune] dry-run only. Re-run with --apply to delete old cache rows.");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error("[reaction-prune] failed", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
