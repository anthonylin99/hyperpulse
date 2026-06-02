import pg from "pg";

const { Pool } = pg;

const DATABASE_URL =
  process.env.NEON_DATABASE_URL_POOLING ||
  process.env.NEON_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  "";

const MODE = process.env.AGENT_EXECUTION_MODE || "paper";
const ENABLED = process.env.AGENT_EXECUTION_ENABLED === "true";
const LOOP_MS = Math.max(Number(process.env.AGENT_EXECUTOR_INTERVAL_MS || 30_000), 10_000);

function envFlag(name, fallback = false) {
  const value = String(process.env[name] || "").trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (!value) return fallback;
  return value === "true" || value === "1" || value === "yes";
}

function normalizeDatabaseUrl(value) {
  const cleaned = String(value || "").trim().replace(/^["']|["']$/g, "");
  if (!cleaned) return "";
  try {
    const url = new URL(cleaned);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    if (sslMode === "require" || sslMode === "prefer" || sslMode === "verify-ca") {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return cleaned;
  }
}

const pool = envFlag("HYPERPULSE_DB_ENABLED") && DATABASE_URL
  ? new Pool({ connectionString: normalizeDatabaseUrl(DATABASE_URL), max: 2 })
  : null;

async function runOnce() {
  if (!pool) {
    console.log("[agent-executor] database not configured; sleeping");
    return;
  }

  if (!ENABLED) {
    console.log("[agent-executor] disabled by AGENT_EXECUTION_ENABLED; no exchange calls will be made");
    return;
  }

  if (MODE !== "paper") {
    console.log(`[agent-executor] ${MODE} mode is scaffolded but locked; refusing to place exchange orders`);
    return;
  }

  const result = await pool.query(
    `
    select id, asset, side, entry_price
    from agent_execution_intents
    where mode = 'paper' and status = 'pending_approval'
    order by updated_at desc
    limit 10
    `,
  );

  console.log(`[agent-executor] paper mode ready pending=${result.rowCount}; approval remains UI/manual`);
}

console.log(`[agent-executor] starting mode=${MODE} enabled=${ENABLED} interval=${LOOP_MS}ms`);

await runOnce().catch((error) => {
  console.error("[agent-executor] cycle failed", error);
});

setInterval(() => {
  runOnce().catch((error) => {
    console.error("[agent-executor] cycle failed", error);
  });
}, LOOP_MS);
