import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import { getPooledDatabaseUrl } from "./database-url.mjs";

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

const DATABASE_URL = getPooledDatabaseUrl();

const ASSETS = (
  process.env.REACTION_MAP_HEALTH_ASSETS ??
  "BTC,ETH,SOL,HYPE,XRP,DOGE,ZEC,TON,SUI,ONDO,AAVE,LINK,BNB,AVAX,LTC,ADA,TRX,UNI,ENA,WIF"
)
  .split(",")
  .map((asset) => asset.trim().toUpperCase())
  .filter(Boolean);

const ZONE_MIN_TRADE_NOTIONAL_USD = envNumber("REACTION_MAP_ZONE_MIN_TRADE_NOTIONAL_USD", 250_000, 1_000);
const ZONE_MIN_TRADE_NOTIONAL_USD_FLOOR = envNumber("REACTION_MAP_ZONE_MIN_TRADE_NOTIONAL_USD_FLOOR", 25_000, 1_000);
const ZONE_MIN_TRADE_NOTIONAL_SHARE = envNumber("REACTION_MAP_ZONE_MIN_TRADE_NOTIONAL_SHARE", 0.08, 0.01);
const WINDOWS = healthWindows();
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

function parseList(value, fallback = []) {
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function envNumber(key, fallback, min = 0) {
  const parsed = Number(process.env[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(parsed, min);
}

function compactPositioningThreshold() {
  return `${compactUsd(ZONE_MIN_TRADE_NOTIONAL_USD_FLOOR)} floor, ${compactUsd(ZONE_MIN_TRADE_NOTIONAL_USD)} cap, ${(ZONE_MIN_TRADE_NOTIONAL_SHARE * 100).toFixed(0)}% of window flow`;
}

function windowMsFromLabel(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.endsWith("m")) {
    const minutes = Number(normalized.slice(0, -1));
    return Number.isFinite(minutes) ? minutes * 60 * 1000 : null;
  }
  if (normalized.endsWith("h")) {
    const hours = Number(normalized.slice(0, -1));
    return Number.isFinite(hours) ? hours * 60 * 60 * 1000 : null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatWindow(ms) {
  if (ms % (60 * 60 * 1000) === 0) return `${ms / (60 * 60 * 1000)}h`;
  if (ms % (60 * 1000) === 0) return `${ms / (60 * 1000)}m`;
  return `${ms}ms`;
}

function healthWindows() {
  const labels =
    process.env.REACTION_MAP_HEALTH_WINDOW_MS != null
      ? [process.env.REACTION_MAP_HEALTH_WINDOW_MS]
      : parseList(
          process.env.REACTION_MAP_HEALTH_WINDOWS ?? process.env.REACTION_MAP_ZONE_WINDOWS,
          ["15m", "1h", "4h"],
        );
  const seen = new Set();
  return labels
    .map((label) => windowMsFromLabel(label))
    .filter((ms) => ms != null && ms > 0)
    .filter((ms) => {
      if (seen.has(ms)) return false;
      seen.add(ms);
      return true;
    })
    .map((ms) => ({ ms, label: formatWindow(ms) }));
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

function mapKey(asset, windowMs, side = "") {
  return `${String(asset).toUpperCase()}:${Number(windowMs)}:${side}`;
}

function sideLabel(side) {
  return side === "bull" ? "buyerBuild" : "sellerBuild";
}

function missingReason({ active, candidate, freshness }) {
  if (active >= 5) return "filled";
  if (!freshness || Number(freshness.context_rows) === 0) return "no context snapshots in window";
  if ((Number(freshness.positive_oi_delta_usd) || 0) <= 0) return "OI flat/down in window";
  if ((Number(candidate?.total_bucket_count) || 0) === 0) return "no trade buckets in window";
  if ((Number(candidate?.eligible_bucket_count) || 0) === 0) {
    return `flow below ${compactUsd(candidate?.min_trade_notional_usd)} bucket threshold`;
  }
  if (active === 0) return "eligible flow did not promote into active zones";
  if ((Number(candidate?.eligible_bucket_count) || 0) <= active) return "eligible buckets already clustered";
  return "extra candidates clustered together or ranked below active zones";
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

    const windowMsValues = WINDOWS.map((window) => window.ms);

    const freshnessResult = await client.query(
      `
      select
        upper(asset) as asset,
        window_ms,
        count(*) filter (where status = 'active')::int as active_rows,
        count(*) filter (where status = 'active' and side = 'bull')::int as active_bull_rows,
        count(*) filter (where status = 'active' and side = 'bear')::int as active_bear_rows,
        count(*) filter (where status = 'stale')::int as stale_rows,
        count(*) filter (where status = 'retired')::int as retired_rows,
        to_char(to_timestamp(max(refreshed_at) / 1000.0) at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') as latest_refresh_utc,
        round(((extract(epoch from now()) * 1000 - max(refreshed_at)) / 1000.0)::numeric, 1)::float as refresh_age_seconds
      from reaction_exposure_zones_current
      where upper(asset) = any($1::text[])
        and window_ms = any($2::bigint[])
      group by upper(asset), window_ms
      order by upper(asset), window_ms
      `,
      [ASSETS, windowMsValues],
    );

    const levelResult = await client.query(
      `
      select
        upper(asset) as asset,
        window_ms,
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
        and window_ms = any($2::bigint[])
        and status <> 'retired'
      order by upper(asset), window_ms, side, rank
      `,
      [ASSETS, windowMsValues],
    );

    const positioningCandidateResult = await client.query(
      `
      with requested as (
        select upper(assets.asset) as asset, windows.window_ms::bigint as window_ms
        from unnest($1::text[]) as assets(asset)
        cross join unnest($2::bigint[]) as windows(window_ms)
      ),
      context_agg as (
        select
          requested.asset,
          requested.window_ms,
          count(context_rows.*)::int as context_rows,
          coalesce(sum(greatest(coalesce(context_rows.open_interest_delta_usd, 0), 0)), 0) as positive_oi_delta_usd,
          max(context_rows.captured_at) as latest_context_ms
        from requested
        left join reaction_context_snapshots context_rows
          on upper(context_rows.asset) = requested.asset
          and context_rows.bucket_ms >= (extract(epoch from now()) * 1000 - requested.window_ms)
        group by requested.asset, requested.window_ms
      ),
      trade_price_buckets as (
        select
          requested.asset,
          requested.window_ms,
          trade_rows.price_bucket,
          sum(trade_rows.buy_notional_usd) as buy_notional_usd,
          sum(trade_rows.sell_notional_usd) as sell_notional_usd,
          sum(trade_rows.trade_count)::int as trade_count
        from requested
        join reaction_trade_buckets trade_rows
          on upper(trade_rows.asset) = requested.asset
          and trade_rows.bucket_ms >= (extract(epoch from now()) * 1000 - requested.window_ms)
        group by requested.asset, requested.window_ms, trade_rows.price_bucket
      ),
      window_trade_totals as (
        select
          asset,
          window_ms,
          coalesce(sum(buy_notional_usd + sell_notional_usd), 0) as total_trade_notional_usd,
          least($3::numeric, greatest($4::numeric, coalesce(sum(buy_notional_usd + sell_notional_usd), 0) * $5::numeric)) as min_trade_notional_usd
        from trade_price_buckets
        group by asset, window_ms
      ),
      side_candidates as (
        select
          trade_price_buckets.asset,
          trade_price_buckets.window_ms,
          case when trade_price_buckets.buy_notional_usd >= trade_price_buckets.sell_notional_usd then 'bull' else 'bear' end as side,
          count(*)::int as total_bucket_count,
          count(*) filter (where trade_price_buckets.buy_notional_usd + trade_price_buckets.sell_notional_usd >= window_trade_totals.min_trade_notional_usd)::int as eligible_bucket_count,
          coalesce(sum(trade_price_buckets.buy_notional_usd + trade_price_buckets.sell_notional_usd), 0) as total_trade_notional_usd,
          coalesce(sum(trade_price_buckets.buy_notional_usd + trade_price_buckets.sell_notional_usd) filter (where trade_price_buckets.buy_notional_usd + trade_price_buckets.sell_notional_usd >= window_trade_totals.min_trade_notional_usd), 0) as eligible_trade_notional_usd,
          coalesce(sum(trade_price_buckets.trade_count), 0)::int as trade_count,
          max(window_trade_totals.min_trade_notional_usd) as min_trade_notional_usd
        from trade_price_buckets
        join window_trade_totals
          on window_trade_totals.asset = trade_price_buckets.asset
          and window_trade_totals.window_ms = trade_price_buckets.window_ms
        group by trade_price_buckets.asset, trade_price_buckets.window_ms, side
      )
      select
        requested.asset,
        requested.window_ms,
        sides.side,
        coalesce(context_agg.context_rows, 0)::int as context_rows,
        coalesce(context_agg.positive_oi_delta_usd, 0) as positive_oi_delta_usd,
        round(((extract(epoch from now()) * 1000 - context_agg.latest_context_ms) / 1000.0)::numeric, 1)::float as latest_context_age_seconds,
        coalesce(side_candidates.total_bucket_count, 0)::int as total_bucket_count,
        coalesce(side_candidates.eligible_bucket_count, 0)::int as eligible_bucket_count,
        coalesce(side_candidates.total_trade_notional_usd, 0) as total_trade_notional_usd,
        coalesce(side_candidates.eligible_trade_notional_usd, 0) as eligible_trade_notional_usd,
        coalesce(side_candidates.min_trade_notional_usd, least($3::numeric, greatest($4::numeric, 0))) as min_trade_notional_usd,
        coalesce(side_candidates.trade_count, 0)::int as trade_count
      from requested
      cross join (values ('bull'), ('bear')) as sides(side)
      left join context_agg
        on context_agg.asset = requested.asset
        and context_agg.window_ms = requested.window_ms
      left join side_candidates
        on side_candidates.asset = requested.asset
        and side_candidates.window_ms = requested.window_ms
        and side_candidates.side = sides.side
      order by requested.asset, requested.window_ms, sides.side
      `,
      [ASSETS, windowMsValues, ZONE_MIN_TRADE_NOTIONAL_USD, ZONE_MIN_TRADE_NOTIONAL_USD_FLOOR, ZONE_MIN_TRADE_NOTIONAL_SHARE],
    );

    const bookShelfResult = await client.query(
      `
      with requested as (
        select upper(assets.asset) as asset, windows.window_ms::bigint as window_ms
        from unnest($1::text[]) as assets(asset)
        cross join unnest($2::bigint[]) as windows(window_ms)
      ),
      latest_context as (
        select distinct on (requested.asset, requested.window_ms)
          requested.asset,
          requested.window_ms,
          coalesce(context_rows.mark_px, context_rows.mid_px, context_rows.oracle_px) as current_price
        from requested
        left join reaction_context_snapshots context_rows
          on upper(context_rows.asset) = requested.asset
          and context_rows.bucket_ms >= (extract(epoch from now()) * 1000 - requested.window_ms)
        order by requested.asset, requested.window_ms, context_rows.captured_at desc nulls last
      ),
      grouped_shelves as (
        select
          latest_context.asset,
          latest_context.window_ms,
          case when book_rows.price_bucket <= latest_context.current_price then 'bid' else 'ask' end as shelf_side,
          book_rows.price_bucket,
          case
            when book_rows.price_bucket <= latest_context.current_price
              then sum(book_rows.bid_notional_usd) / nullif(sum(greatest(book_rows.sample_count, 1)), 0)
            else sum(book_rows.ask_notional_usd) / nullif(sum(greatest(book_rows.sample_count, 1)), 0)
          end as shelf_depth_usd,
          sum(book_rows.order_count)::int as order_count,
          sum(book_rows.sample_count)::int as sample_count
        from latest_context
        join reaction_orderbook_buckets book_rows
          on upper(book_rows.asset) = latest_context.asset
          and book_rows.bucket_ms >= (extract(epoch from now()) * 1000 - latest_context.window_ms)
          and latest_context.current_price is not null
          and book_rows.price_bucket between latest_context.current_price * 0.65 and latest_context.current_price * 1.35
          and (
            (book_rows.price_bucket <= latest_context.current_price and book_rows.bid_notional_usd > 0)
            or (book_rows.price_bucket >= latest_context.current_price and book_rows.ask_notional_usd > 0)
          )
        group by latest_context.asset, latest_context.window_ms, latest_context.current_price, shelf_side, book_rows.price_bucket
      ),
      ranked_shelves as (
        select
          *,
          row_number() over (
            partition by asset, window_ms, shelf_side
            order by shelf_depth_usd desc nulls last, sample_count desc
          ) as shelf_rank
        from grouped_shelves
        where shelf_depth_usd > 0
      )
      select
        asset,
        window_ms,
        shelf_side,
        count(*) filter (where shelf_rank <= 5)::int as shelf_count,
        coalesce(sum(shelf_depth_usd) filter (where shelf_rank <= 5), 0) as top_shelf_depth_usd,
        coalesce(max(shelf_depth_usd) filter (where shelf_rank <= 5), 0) as max_shelf_depth_usd,
        coalesce(sum(order_count) filter (where shelf_rank <= 5), 0)::int as order_count,
        coalesce(sum(sample_count) filter (where shelf_rank <= 5), 0)::int as sample_count
      from ranked_shelves
      group by asset, window_ms, shelf_side
      order by asset, window_ms, shelf_side
      `,
      [ASSETS, windowMsValues],
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

    const freshnessByWindow = new Map(freshnessResult.rows.map((row) => [mapKey(row.asset, row.window_ms), row]));
    const activeBySide = new Map();
    for (const row of levelResult.rows) {
      if (row.status !== "active") continue;
      const key = mapKey(row.asset, row.window_ms, row.side);
      activeBySide.set(key, (activeBySide.get(key) ?? 0) + 1);
    }
    const candidatesBySide = new Map(
      positioningCandidateResult.rows.map((row) => [mapKey(row.asset, row.window_ms, row.side), row]),
    );
    const shelfBySide = new Map(bookShelfResult.rows.map((row) => [mapKey(row.asset, row.window_ms, row.shelf_side), row]));

    console.log(`[reaction-health] windows=${WINDOWS.map((window) => window.label).join(",")} assets=${ASSETS.join(",")}`);
    console.log(`[reaction-health] positioning threshold=${compactPositioningThreshold()}`);
    if (unexpectedTables.length > 0) {
      console.log(`[reaction-health] unexpected tables: ${unexpectedTables.join(", ")}`);
    } else {
      console.log("[reaction-health] unexpected tables: none");
    }

    console.table(
      ASSETS.flatMap((asset) =>
        WINDOWS.map((window) => {
          const row = freshnessByWindow.get(mapKey(asset, window.ms));
          return {
            asset,
            window: window.label,
            activeTotal: Number(row?.active_rows ?? 0),
            buyerZones: Number(row?.active_bull_rows ?? 0),
            sellerZones: Number(row?.active_bear_rows ?? 0),
            stale: Number(row?.stale_rows ?? 0),
            retired: Number(row?.retired_rows ?? 0),
            latestRefreshUtc: row?.latest_refresh_utc ?? "n/a",
            age: ageLabel(row?.refresh_age_seconds),
          };
        }),
      ),
    );

    console.table(
      ASSETS.flatMap((asset) =>
        WINDOWS.map((window) => {
          const buyer = candidatesBySide.get(mapKey(asset, window.ms, "bull"));
          const seller = candidatesBySide.get(mapKey(asset, window.ms, "bear"));
          const freshness = buyer ?? seller;
          const activeBuyer = activeBySide.get(mapKey(asset, window.ms, "bull")) ?? 0;
          const activeSeller = activeBySide.get(mapKey(asset, window.ms, "bear")) ?? 0;
          return {
            asset,
            window: window.label,
            buyerActive: activeBuyer,
            buyerEligibleBuckets: Number(buyer?.eligible_bucket_count ?? 0),
            buyerMissing: Math.max(5 - activeBuyer, 0),
            buyerReason: missingReason({ active: activeBuyer, candidate: buyer, freshness }),
            sellerActive: activeSeller,
            sellerEligibleBuckets: Number(seller?.eligible_bucket_count ?? 0),
            sellerMissing: Math.max(5 - activeSeller, 0),
            sellerReason: missingReason({ active: activeSeller, candidate: seller, freshness }),
            bucketThreshold: compactUsd(freshness?.min_trade_notional_usd),
            positiveOiDelta: compactUsd(freshness?.positive_oi_delta_usd),
            contextAge: ageLabel(freshness?.latest_context_age_seconds),
          };
        }),
      ),
    );

    console.table(
      ASSETS.flatMap((asset) =>
        WINDOWS.map((window) => {
          const bids = shelfBySide.get(mapKey(asset, window.ms, "bid"));
          const asks = shelfBySide.get(mapKey(asset, window.ms, "ask"));
          return {
            asset,
            window: window.label,
            bidShelves: Number(bids?.shelf_count ?? 0),
            bidDepthTop5: compactUsd(bids?.top_shelf_depth_usd),
            bidMaxShelf: compactUsd(bids?.max_shelf_depth_usd),
            askShelves: Number(asks?.shelf_count ?? 0),
            askDepthTop5: compactUsd(asks?.top_shelf_depth_usd),
            askMaxShelf: compactUsd(asks?.max_shelf_depth_usd),
          };
        }),
      ),
    );

    console.table(
      levelResult.rows.map((row) => ({
        asset: row.asset,
        window: formatWindow(Number(row.window_ms)),
        side: sideLabel(row.side),
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
