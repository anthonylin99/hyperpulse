import { Pool } from "pg";
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
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

loadLocalEnv();

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
const HYPERLIQUID_INFO_URL = process.env.HYPERLIQUID_INFO_URL ?? "https://api.hyperliquid.xyz/info";
const INTERVAL_MS = Math.max(Number(process.env.PORTFOLIO_CAPTURE_INTERVAL_MS ?? 300_000), 60_000);
const WALLET_LIMIT = Math.min(Math.max(Number(process.env.PORTFOLIO_CAPTURE_WALLET_LIMIT ?? 100), 1), 500);
const RUN_ONCE = process.argv.includes("--once") || process.env.PORTFOLIO_CAPTURE_ONCE === "true";

if (!DATABASE_URL) {
  console.error("[portfolio-capture] DATABASE_URL or POSTGRES_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fiveMinuteBucket(timestamp) {
  return Math.floor(timestamp / 300_000) * 300_000;
}

async function infoRequest(payload) {
  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid info request failed: ${response.status}`);
  }
  return response.json();
}

async function ensureTables() {
  await pool.query(`
    create table if not exists portfolio_tracked_wallets (
      wallet_address text primary key,
      first_seen_at bigint not null,
      last_seen_at bigint not null,
      source text not null,
      status text not null
    );
  `);
  await pool.query(`
    create table if not exists portfolio_trade_sizing_snapshots (
      id text primary key,
      wallet_address text not null,
      asset text not null,
      side text not null,
      market_type text not null,
      position_key text not null,
      captured_at bigint not null,
      entry_time bigint,
      entry_price double precision not null,
      mark_price double precision not null,
      size double precision not null,
      notional_usd double precision not null,
      margin_used_usd double precision not null,
      liquidation_px double precision,
      account_equity_usd double precision not null,
      deployable_capital_usd double precision not null,
      leverage double precision not null,
      sizing_pct double precision not null,
      status text not null,
      source text not null,
      payload jsonb not null
    );
  `);
  await pool.query(`
    alter table portfolio_trade_sizing_snapshots
    add column if not exists liquidation_px double precision;
  `);
  await pool.query(`
    create index if not exists portfolio_trade_sizing_wallet_idx
    on portfolio_trade_sizing_snapshots (wallet_address, captured_at desc);
  `);
  await pool.query(`
    create index if not exists portfolio_trade_sizing_position_idx
    on portfolio_trade_sizing_snapshots (wallet_address, position_key, captured_at desc);
  `);
}

async function listTrackedWallets() {
  const result = await pool.query(
    `
    select wallet_address
    from portfolio_tracked_wallets
    where status = 'active'
    order by last_seen_at desc
    limit $1
    `,
    [WALLET_LIMIT],
  );
  return result.rows.map((row) => String(row.wallet_address).toLowerCase());
}

async function listExistingPositionKeys(walletAddress) {
  const result = await pool.query(
    `
    select distinct position_key
    from portfolio_trade_sizing_snapshots
    where wallet_address = $1
    `,
    [walletAddress.toLowerCase()],
  );
  return new Set(result.rows.map((row) => String(row.position_key)));
}

async function fetchDexNames() {
  try {
    const dexs = await infoRequest({ type: "perpDexs" });
    return Array.isArray(dexs)
      ? dexs
          .map((dex) => String(dex?.name ?? ""))
          .filter((name) => name.length > 0)
      : [];
  } catch (error) {
    console.warn("[portfolio-capture] dex list unavailable", error);
    return [];
  }
}

async function fetchPerpStates(walletAddress, dexNames) {
  const main = await infoRequest({
    type: "clearinghouseState",
    user: walletAddress,
  });

  const dexResults = await Promise.allSettled(
    dexNames.map(async (dex) => ({
      dex,
      state: await infoRequest({
        type: "clearinghouseState",
        user: walletAddress,
        dex,
      }),
    })),
  );

  return [
    { dex: null, state: main },
    ...dexResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
  ];
}

function deriveSnapshots({ walletAddress, dex, state, existingPositionKeys }) {
  const capturedAt = fiveMinuteBucket(Date.now());
  const assetPositions = Array.isArray(state?.assetPositions) ? state.assetPositions : [];
  const marginSummary = state?.marginSummary ?? {};
  const crossMarginSummary = state?.crossMarginSummary ?? {};
  const accountEquityUsd = parseNumber(marginSummary.accountValue);
  const totalMarginUsed = parseNumber(marginSummary.totalMarginUsed);
  const explicitWithdrawable = parseNumber(state?.withdrawable);
  const fallbackWithdrawable = Math.max(
    parseNumber(crossMarginSummary.accountValue) - parseNumber(crossMarginSummary.totalMarginUsed),
    0,
  );
  const tradeableCapitalUsd = Math.max((explicitWithdrawable > 0 ? explicitWithdrawable : fallbackWithdrawable) + totalMarginUsed, 0);

  return assetPositions.flatMap((item) => {
    const position = item?.position ?? {};
    const szi = parseNumber(position.szi);
    if (szi === 0) return [];

    const rawAsset = String(position.coin ?? "");
    const asset = dex && rawAsset.toLowerCase().startsWith(`${dex.toLowerCase()}:`)
      ? rawAsset.slice(dex.length + 1)
      : rawAsset;
    if (!asset) return [];

    const side = szi >= 0 ? "long" : "short";
    const entryPrice = parseNumber(position.entryPx);
    const unrealizedPnl = parseNumber(position.unrealizedPnl);
    const absSize = Math.abs(szi);
    const pnlPerUnit = absSize > 0 ? unrealizedPnl / absSize : 0;
    const markPrice = szi > 0 ? entryPrice + pnlPerUnit : entryPrice - pnlPerUnit;
    const marginUsedUsd = parseNumber(position.marginUsed);
    const notionalUsd = absSize * Math.max(markPrice, 0);
    const leverage = parseNumber(position.leverage?.value);
    const liquidationPx = position.liquidationPx == null ? null : parseNumber(position.liquidationPx);
    const sizingPct = tradeableCapitalUsd > 0 && marginUsedUsd > 0
      ? (marginUsedUsd / tradeableCapitalUsd) * 100
      : 0;
    const marketPrefix = dex ? `hip3_perp:${dex}` : "perp";
    const positionKey = `${marketPrefix}:${asset}:${side}`;
    const source = existingPositionKeys.has(positionKey) ? "snapshot" : "first_captured";

    const snapshot = {
      id: `${walletAddress.toLowerCase()}:${positionKey}:${capturedAt}`,
      walletAddress: walletAddress.toLowerCase(),
      asset,
      side,
      marketType: dex ? "hip3_perp" : "perp",
      positionKey,
      capturedAt,
      entryTime: null,
      entryPrice,
      markPrice,
      size: absSize,
      notionalUsd,
      marginUsedUsd,
      liquidationPx,
      accountEquityUsd,
      tradeableCapitalUsd,
      leverage,
      sizingPct,
      status: "open",
      source,
    };
    return [snapshot];
  });
}

async function upsertSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    await pool.query(
      `
      insert into portfolio_trade_sizing_snapshots (
        id, wallet_address, asset, side, market_type, position_key, captured_at,
        entry_time, entry_price, mark_price, size, notional_usd, margin_used_usd, liquidation_px,
        account_equity_usd, deployable_capital_usd, leverage, sizing_pct, status, source, payload
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb)
      on conflict (id) do update set
        mark_price = excluded.mark_price,
        size = excluded.size,
        notional_usd = excluded.notional_usd,
        margin_used_usd = excluded.margin_used_usd,
        liquidation_px = excluded.liquidation_px,
        account_equity_usd = excluded.account_equity_usd,
        deployable_capital_usd = excluded.deployable_capital_usd,
        leverage = excluded.leverage,
        sizing_pct = excluded.sizing_pct,
        status = excluded.status,
        source = portfolio_trade_sizing_snapshots.source,
        payload = excluded.payload
      `,
      [
        snapshot.id,
        snapshot.walletAddress,
        snapshot.asset,
        snapshot.side,
        snapshot.marketType,
        snapshot.positionKey,
        snapshot.capturedAt,
        snapshot.entryTime,
        snapshot.entryPrice,
        snapshot.markPrice,
        snapshot.size,
        snapshot.notionalUsd,
        snapshot.marginUsedUsd,
        snapshot.liquidationPx,
        snapshot.accountEquityUsd,
        snapshot.tradeableCapitalUsd,
        snapshot.leverage,
        snapshot.sizingPct,
        snapshot.status,
        snapshot.source,
        JSON.stringify(snapshot),
      ],
    );
  }
}

async function captureOnce() {
  await ensureTables();
  const wallets = await listTrackedWallets();
  if (wallets.length === 0) {
    console.log("[portfolio-capture] no active tracked wallets");
    return;
  }

  const dexNames = await fetchDexNames();
  let totalSnapshots = 0;

  for (const walletAddress of wallets) {
    try {
      const [states, existingPositionKeys] = await Promise.all([
        fetchPerpStates(walletAddress, dexNames),
        listExistingPositionKeys(walletAddress),
      ]);
      const snapshots = states.flatMap((entry) =>
        deriveSnapshots({
          walletAddress,
          dex: entry.dex,
          state: entry.state,
          existingPositionKeys,
        }),
      );
      await upsertSnapshots(snapshots);
      totalSnapshots += snapshots.length;
      console.log(`[portfolio-capture] ${walletAddress} snapshots=${snapshots.length}`);
    } catch (error) {
      console.warn(`[portfolio-capture] failed wallet=${walletAddress}`, error);
    }
  }

  console.log(`[portfolio-capture] complete wallets=${wallets.length} snapshots=${totalSnapshots}`);
}

async function main() {
  if (RUN_ONCE) {
    await captureOnce();
    await pool.end();
    return;
  }

  await captureOnce();
  setInterval(() => {
    captureOnce().catch((error) => {
      console.error("[portfolio-capture] cycle failed", error);
    });
  }, INTERVAL_MS);
}

main().catch(async (error) => {
  console.error("[portfolio-capture] fatal", error);
  await pool.end().catch(() => null);
  process.exit(1);
});
