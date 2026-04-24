import { Pool } from "pg";
import type { DailyMarketPrice, TradeSizingSnapshot } from "@/types";

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
const STORE_BACKOFF_MS = 5 * 60 * 1000;

let pool: Pool | null = null;
let disabledUntil = 0;

function markStoreUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("quota") || message.includes("XX000")) {
    disabledUntil = Date.now() + STORE_BACKOFF_MS;
  }
  console.warn("[research-store] unavailable", error);
}

function getPool(): Pool | null {
  if (disabledUntil > Date.now()) return null;
  if (!DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  }
  return pool;
}

export function isResearchStoreConfigured(): boolean {
  return Boolean(getPool());
}

async function ensureResearchTables(): Promise<void> {
  const client = getPool();
  if (!client) return;

  await client.query(`
    create table if not exists research_daily_prices (
      asset text not null,
      market_type text not null,
      day text not null,
      time bigint not null,
      open double precision not null,
      high double precision not null,
      low double precision not null,
      close double precision not null,
      volume double precision not null,
      source text not null,
      updated_at bigint not null,
      primary key (asset, market_type, day)
    );
  `);
  await client.query(`
    create index if not exists research_daily_prices_asset_day_idx
    on research_daily_prices (asset, market_type, day desc);
  `);
  await client.query(`
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
      account_equity_usd double precision not null,
      deployable_capital_usd double precision not null,
      leverage double precision not null,
      sizing_pct double precision not null,
      status text not null,
      source text not null,
      payload jsonb not null
    );
  `);
  await client.query(`
    create index if not exists portfolio_trade_sizing_wallet_idx
    on portfolio_trade_sizing_snapshots (wallet_address, captured_at desc);
  `);
  await client.query(`
    create index if not exists portfolio_trade_sizing_position_idx
    on portfolio_trade_sizing_snapshots (wallet_address, position_key, captured_at desc);
  `);
}

function normalizeDailyPrice(row: Record<string, unknown>): DailyMarketPrice {
  return {
    asset: String(row.asset),
    marketType: String(row.market_type) === "spot" ? "spot" : "perp",
    day: String(row.day),
    time: Number(row.time),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    source: "hyperliquid",
    updatedAt: Number(row.updated_at),
  };
}

function normalizeSizingSnapshot(row: Record<string, unknown>): TradeSizingSnapshot {
  const status = String(row.status);
  const source = String(row.source);
  return {
    id: String(row.id),
    walletAddress: String(row.wallet_address),
    asset: String(row.asset),
    side: String(row.side) === "short" ? "short" : "long",
    marketType: "perp",
    positionKey: String(row.position_key),
    capturedAt: Number(row.captured_at),
    entryTime: row.entry_time == null ? null : Number(row.entry_time),
    entryPrice: Number(row.entry_price),
    markPrice: Number(row.mark_price),
    size: Number(row.size),
    notionalUsd: Number(row.notional_usd),
    marginUsedUsd: Number(row.margin_used_usd),
    accountEquityUsd: Number(row.account_equity_usd),
    tradeableCapitalUsd: Number(row.deployable_capital_usd),
    leverage: Number(row.leverage),
    sizingPct: Number(row.sizing_pct),
    status: status === "closed" || status === "unknown" ? status : "open",
    source: source === "snapshot" ? "snapshot" : "first_captured",
  };
}

export async function upsertDailyPrices(prices: DailyMarketPrice[]): Promise<boolean> {
  const client = getPool();
  if (!client || prices.length === 0) return false;
  try {
    await ensureResearchTables();

    for (const price of prices) {
      await client.query(
        `
        insert into research_daily_prices (
          asset, market_type, day, time, open, high, low, close, volume, source, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        on conflict (asset, market_type, day) do update set
          time = excluded.time,
          open = excluded.open,
          high = excluded.high,
          low = excluded.low,
          close = excluded.close,
          volume = excluded.volume,
          source = excluded.source,
          updated_at = excluded.updated_at
      `,
        [
          price.asset,
          price.marketType,
          price.day,
          price.time,
          price.open,
          price.high,
          price.low,
          price.close,
          price.volume,
          price.source,
          price.updatedAt,
        ],
      );
    }

    return true;
  } catch (error) {
    markStoreUnavailable(error);
    return false;
  }
}

export async function listDailyPrices(args: {
  assets: string[];
  days: number;
  marketType?: "perp" | "spot";
}): Promise<DailyMarketPrice[]> {
  const client = getPool();
  if (!client || args.assets.length === 0) return [];
  try {
    await ensureResearchTables();

    const cutoff = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = await client.query(
      `
      select *
      from research_daily_prices
      where asset = any($1::text[])
        and market_type = $2
        and day >= $3
      order by asset asc, day asc
    `,
      [args.assets, args.marketType ?? "perp", cutoff],
    );

    return result.rows.map(normalizeDailyPrice);
  } catch (error) {
    markStoreUnavailable(error);
    return [];
  }
}

export async function upsertSizingSnapshots(snapshots: TradeSizingSnapshot[]): Promise<boolean> {
  const client = getPool();
  if (!client || snapshots.length === 0) return false;
  try {
    await ensureResearchTables();

    for (const snapshot of snapshots) {
      await client.query(
        `
        insert into portfolio_trade_sizing_snapshots (
          id, wallet_address, asset, side, market_type, position_key, captured_at,
          entry_time, entry_price, mark_price, size, notional_usd, margin_used_usd,
          account_equity_usd, deployable_capital_usd, leverage, sizing_pct, status, source, payload
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb)
        on conflict (id) do update set
          mark_price = excluded.mark_price,
          size = excluded.size,
          notional_usd = excluded.notional_usd,
          margin_used_usd = excluded.margin_used_usd,
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
          snapshot.walletAddress.toLowerCase(),
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

    return true;
  } catch (error) {
    markStoreUnavailable(error);
    return false;
  }
}

export async function listSizingSnapshots(args: {
  walletAddress: string;
  days?: number;
}): Promise<TradeSizingSnapshot[]> {
  const client = getPool();
  if (!client) return [];
  try {
    await ensureResearchTables();

    const since = Date.now() - (args.days ?? 365) * 24 * 60 * 60 * 1000;
    const result = await client.query(
      `
      select *
      from portfolio_trade_sizing_snapshots
      where wallet_address = $1
        and captured_at >= $2
      order by captured_at desc
    `,
      [args.walletAddress.toLowerCase(), since],
    );

    return result.rows.map(normalizeSizingSnapshot);
  } catch (error) {
    markStoreUnavailable(error);
    return [];
  }
}
