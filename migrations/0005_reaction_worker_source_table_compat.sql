-- Align Neon-created reaction input tables with the worker contract from 0003.
-- Production Neon did not originally have 0003, so this is safe no-op
-- compatibility for local databases that already applied it.

alter table reaction_context_snapshots
  add column if not exists funding_apr double precision,
  add column if not exists open_interest_coin double precision,
  add column if not exists source text not null default 'hyperliquid_ws';

alter table reaction_orderbook_buckets
  add column if not exists order_count integer not null default 0,
  add column if not exists first_seen_at bigint not null default 0,
  add column if not exists last_seen_at bigint not null default 0,
  add column if not exists source text not null default 'hyperliquid_ws';

alter table reaction_trade_buckets
  add column if not exists first_trade_at bigint not null default 0,
  add column if not exists last_trade_at bigint not null default 0,
  add column if not exists source text not null default 'hyperliquid_ws';

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

create index if not exists reaction_level_asset_time_idx
  on reaction_level_snapshots (asset, generated_at desc);

create index if not exists reaction_level_asset_price_idx
  on reaction_level_snapshots (asset, price_level, generated_at desc);
