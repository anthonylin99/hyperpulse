import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";

for (const file of [".env.local", ".env", "workers/momentum-alerts/.env", "workers/whale-indexer/.env"]) {
  if (!existsSync(file)) continue;
  const contents = readFileSync(file, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function cleanEnv(value) {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "");
}

process.env.MOMENTUM_ALERT_DRY_RUN = "false";
process.env.MOMENTUM_ALERT_ONCE = "true";

const url = cleanEnv(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "");
if (!url) {
  console.error("DATABASE_URL or POSTGRES_URL is required.");
  process.exit(1);
}

function runWorker() {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["workers/momentum-alerts/index.mjs", "--once"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`momentum worker exited with code ${code}`));
    });
  });
}

const before = Date.now();
await runWorker();

const pool = new Pool({ connectionString: url, max: 1 });
try {
  const result = await pool.query(
    `select completed_at, status, payload
     from worker_runs
     where worker = 'momentum-alerts' and started_at >= $1
     order by started_at desc
     limit 1`,
    [before - 60_000],
  );
  const payload = result.rows[0]?.payload ?? {};
  console.log("\nMomentum live one-shot summary");
  console.table([
    {
      status: result.rows[0]?.status ?? "missing_run_row",
      scanned: payload.scanned ?? 0,
      candidates: payload.candidates ?? 0,
      inserted: payload.inserted ?? 0,
      queued: payload.queued ?? 0,
      sent: payload.sent ?? 0,
      selected: Array.isArray(payload.selected) ? payload.selected.join(",") : "",
      dryRun: payload.dryRun ?? false,
    },
  ]);
} finally {
  await pool.end();
}
