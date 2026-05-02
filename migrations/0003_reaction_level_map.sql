-- Reaction Level Map v1.
-- Stores public Hyperliquid market-stream aggregates used to infer likely
-- reaction levels without claiming exact exchange-wide trader positions.

create table if not exists reaction_context_snapshots (
  id text primary key,
  asset text not null,
  bucket_ms bigint not null,
  captured_at bigint not null,
  mark_px double precision not null,
  mid_px double precision,
  oracle_px double precision,
  funding_rate double precision,
  funding_apr double precision,
  open_interest_coin double precision,
  open_interest_usd double precision,
  open_interest_delta_usd double precision,
  source text not null default 'hyperliquid_ws',
  payload jsonb not null default '{}'::jsonb
);

create index if not exists reaction_context_asset_time_idx on reaction_context_snapshots (asset, bucket_ms desc);

create table if not exists reaction_orderbook_buckets (
  id text primary key,
  asset text not null,
  bucket_ms bigint not null,
  price_bucket double precision not null,
  bucket_size double precision not null,
  bid_notional_usd double precision not null default 0,
  ask_notional_usd double precision not null default 0,
  peak_bid_notional_usd double precision not null default 0,
  peak_ask_notional_usd double precision not null default 0,
  order_count integer not null default 0,
  sample_count integer not null default 0,
  first_seen_at bigint not null,
  last_seen_at bigint not null,
  source text not null default 'hyperliquid_ws',
  payload jsonb not null default '{}'::jsonb
);

create index if not exists reaction_orderbook_asset_time_idx on reaction_orderbook_buckets (asset, bucket_ms desc);
create index if not exists reaction_orderbook_asset_price_idx on reaction_orderbook_buckets (asset, price_bucket, bucket_ms desc);

create table if not exists reaction_trade_buckets (
  id text primary key,
  asset text not null,
  bucket_ms bigint not null,
  price_bucket double precision not null,
  bucket_size double precision not null,
  buy_notional_usd double precision not null default 0,
  sell_notional_usd double precision not null default 0,
  trade_count integer not null default 0,
  unique_trader_count integer not null default 0,
  first_trade_at bigint not null,
  last_trade_at bigint not null,
  source text not null default 'hyperliquid_ws',
  payload jsonb not null default '{}'::jsonb
);

create index if not exists reaction_trade_asset_time_idx on reaction_trade_buckets (asset, bucket_ms desc);
create index if not exists reaction_trade_asset_price_idx on reaction_trade_buckets (asset, price_bucket, bucket_ms desc);

create table if not exists reaction_level_snapshots (
  id text primary key,
  asset text not null,
  window_ms bigint not null,
  generated_at bigint not null,
  current_price double precision not null,
  price_level double precision not null,
  distance_pct double precision not null,
  reaction_label text not null,
  direction_bias text not null,
  confidence text not null,
  score double precision not null,
  primary_source text not null,
  source text not null default 'reaction_level_map.v1',
  payload jsonb not null default '{}'::jsonb
);

create index if not exists reaction_level_asset_time_idx on reaction_level_snapshots (asset, generated_at desc);
create index if not exists reaction_level_asset_price_idx on reaction_level_snapshots (asset, price_level, generated_at desc);
