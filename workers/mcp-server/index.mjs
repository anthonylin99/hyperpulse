import { Pool } from "pg";
import { createInterface } from "node:readline";
import { existsSync, readFileSync } from "node:fs";

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
if (!DATABASE_URL) {
  console.error("[hyperpulse-mcp] DATABASE_URL or POSTGRES_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 3 });

const tools = [
  {
    name: "hyperpulse_get_market_context",
    description: "Read latest HyperPulse market context for one asset. Read-only; never places trades.",
    inputSchema: {
      type: "object",
      properties: { asset: { type: "string", description: "Hyperliquid perp ticker, for example BTC or TAO" } },
      required: ["asset"],
    },
  },
  {
    name: "hyperpulse_get_levels",
    description: "Read latest stored support/resistance level observations for an asset.",
    inputSchema: {
      type: "object",
      properties: {
        asset: { type: "string" },
        interval: { type: "string", description: "Optional candle interval, for example 15m or 1h" },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["asset"],
    },
  },
  {
    name: "hyperpulse_get_trade_ideas",
    description: "Return deterministic read-only setup candidates from stored context and levels. Decision support only.",
    inputSchema: {
      type: "object",
      properties: { asset: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 5 } },
      required: ["asset"],
    },
  },
  {
    name: "hyperpulse_get_positioning_alerts",
    description: "Read recent whale/crowding/liquidation positioning alerts if the worker tables exist.",
    inputSchema: {
      type: "object",
      properties: { asset: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 25 } },
    },
  },
];

function normalizeAsset(asset) {
  return String(asset ?? "").trim().toUpperCase();
}

function clampLimit(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function guardedPayload(value) {
  return {
    ...value,
    guardrails: {
      readOnly: true,
      noOrderPlacement: true,
      notFinancialAdvice: true,
      maxDataAgeSec: value.maxDataAgeSec ?? 900,
    },
  };
}

function toolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(guardedPayload(value), null, 2) }],
  };
}

async function tableExists(tableName) {
  const result = await pool.query("select to_regclass($1) as name", [`public.${tableName}`]);
  return Boolean(result.rows[0]?.name);
}

async function latestAssetKey(asset) {
  const normalized = normalizeAsset(asset);
  const result = await pool.query(
    `select asset_key, asset, market_type from market_assets where upper(asset) = $1 and is_active = true order by last_seen_at desc limit 1`,
    [normalized],
  );
  return result.rows[0] ?? null;
}

async function getMarketContext(args) {
  const key = await latestAssetKey(args.asset);
  if (!key) return toolResult({ asset: normalizeAsset(args.asset), status: "not_found" });
  const [context, features] = await Promise.all([
    pool.query(`select * from market_context_snapshots where asset_key = $1 order by captured_at desc limit 1`, [key.asset_key]),
    pool.query(`select * from feature_snapshots where asset_key = $1 order by feature_time desc limit 1`, [key.asset_key]),
  ]);
  const latest = context.rows[0] ?? null;
  return toolResult({
    asset: key.asset,
    marketType: key.market_type,
    generatedAt: Date.now(),
    marketDataFreshnessSec: latest ? Math.max(0, Math.round((Date.now() - Number(latest.captured_at)) / 1000)) : null,
    context: latest,
    features: features.rows[0] ?? null,
  });
}

async function getLevels(args) {
  const key = await latestAssetKey(args.asset);
  if (!key) return toolResult({ asset: normalizeAsset(args.asset), status: "not_found", levels: [] });
  const values = [key.asset_key];
  let clause = "asset_key = $1";
  if (args.interval) {
    values.push(String(args.interval));
    clause += ` and interval = $${values.length}`;
  }
  values.push(clampLimit(args.limit, 12, 20));
  const result = await pool.query(
    `select * from level_observations where ${clause} order by observed_at desc, strength desc limit $${values.length}`,
    values,
  );
  return toolResult({ asset: key.asset, generatedAt: Date.now(), levels: result.rows });
}

async function getTradeIdeas(args) {
  const key = await latestAssetKey(args.asset);
  if (!key) return toolResult({ asset: normalizeAsset(args.asset), status: "not_found", ideas: [] });
  const limit = clampLimit(args.limit, 3, 5);
  const context = await pool.query(`select * from market_context_snapshots where asset_key = $1 order by captured_at desc limit 1`, [key.asset_key]);
  const mark = Number(context.rows[0]?.mark_px ?? 0);
  const levels = await pool.query(
    `select * from level_observations where asset_key = $1 order by observed_at desc, strength desc limit 30`,
    [key.asset_key],
  );
  const ideas = levels.rows
    .filter((level) => mark > 0 && Number.isFinite(Number(level.level_price)))
    .map((level) => {
      const levelPrice = Number(level.level_price);
      const distancePct = ((levelPrice - mark) / mark) * 100;
      const near = Math.abs(distancePct) <= 3;
      return {
        bias: near ? (level.kind === "support" ? "long-setup" : "short-setup") : "wait",
        setupType: level.kind === "support" ? "support_reclaim" : "resistance_rejection",
        trigger: level.kind === "support" ? `Watch reclaim/hold near ${levelPrice}` : `Watch rejection below ${levelPrice}`,
        invalidation: level.kind === "support" ? `Close below ${levelPrice}` : `Close above ${levelPrice}`,
        targets: [],
        confidence: Number(level.strength) >= 8 ? "medium" : "low",
        evidence: [`${level.kind} level ${distancePct.toFixed(2)}% from mark`, `touches=${level.touches}`, `strength=${Number(level.strength).toFixed(2)}`],
        riskWarnings: ["Read-only signal. Requires live confirmation and position sizing outside HyperPulse MCP."],
      };
    })
    .slice(0, limit);
  return toolResult({ asset: key.asset, generatedAt: Date.now(), markPx: mark || null, ideas });
}

async function getPositioningAlerts(args) {
  const limit = clampLimit(args.limit, 10, 25);
  const normalized = args.asset ? normalizeAsset(args.asset) : null;
  const alerts = [];
  if (await tableExists("positioning_alerts")) {
    const values = [];
    let clause = "true";
    if (normalized) {
      values.push(normalized);
      clause = "upper(asset) = $1";
    }
    values.push(limit);
    const result = await pool.query(`select payload from positioning_alerts where ${clause} order by created_at desc limit $${values.length}`, values);
    alerts.push(...result.rows.map((row) => row.payload));
  }
  if ((await tableExists("whale_alerts")) && alerts.length < limit) {
    const values = [];
    let clause = "true";
    if (normalized) {
      values.push(normalized);
      clause = "upper(coin) = $1";
    }
    values.push(limit - alerts.length);
    const result = await pool.query(`select payload from whale_alerts where ${clause} order by created_at desc limit $${values.length}`, values);
    alerts.push(...result.rows.map((row) => row.payload));
  }
  return toolResult({ generatedAt: Date.now(), asset: normalized, alerts: alerts.slice(0, limit) });
}

async function callTool(name, args = {}) {
  if (name === "hyperpulse_get_market_context") return getMarketContext(args);
  if (name === "hyperpulse_get_levels") return getLevels(args);
  if (name === "hyperpulse_get_trade_ideas") return getTradeIdeas(args);
  if (name === "hyperpulse_get_positioning_alerts") return getPositioningAlerts(args);
  throw new Error(`Unknown tool: ${name}`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handleRequest(message) {
  if (message.method === "notifications/initialized") return;
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "hyperpulse-private", version: "0.1.0" },
      },
    });
    return;
  }
  if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools } });
    return;
  }
  if (message.method === "tools/call") {
    const result = await callTool(message.params?.name, message.params?.arguments ?? {});
    send({ jsonrpc: "2.0", id: message.id, result });
    return;
  }
  if (message.id != null) {
    send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } });
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  Promise.resolve()
    .then(() => handleRequest(JSON.parse(line)))
    .catch((error) => {
      let id = null;
      try { id = JSON.parse(line).id ?? null; } catch {}
      send({ jsonrpc: "2.0", id, error: { code: -32000, message: error.message } });
    });
});

process.on("SIGINT", async () => {
  await pool.end().catch(() => {});
  process.exit(0);
});
