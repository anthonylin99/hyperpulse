import { Pool } from "pg";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? "migrations";

if (!DATABASE_URL) {
  console.error("[migrate] DATABASE_URL or POSTGRES_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

async function ensureMigrationTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      checksum text not null,
      applied_at bigint not null
    );
  `);
}

function checksum(sql) {
  let hash = 0;
  for (let i = 0; i < sql.length; i += 1) {
    hash = (hash * 31 + sql.charCodeAt(i)) | 0;
  }
  return String(hash >>> 0);
}

async function main() {
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (migrationFiles.length === 0) {
    console.log(`[migrate] no .sql files found in ${MIGRATIONS_DIR}`);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext('hyperpulse_schema_migrations'))");
    await ensureMigrationTable(client);

    for (const file of migrationFiles) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const sum = checksum(sql);
      const existing = await client.query("select checksum from schema_migrations where id = $1 limit 1", [file]);
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== sum) {
          throw new Error(`Migration ${file} changed after it was applied.`);
        }
        console.log(`[migrate] skip ${file}`);
        continue;
      }

      console.log(`[migrate] apply ${file}`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into schema_migrations (id, checksum, applied_at) values ($1, $2, $3)",
          [file, sum, Date.now()],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock(hashtext('hyperpulse_schema_migrations'))").catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[migrate] failed", error);
  process.exit(1);
});
