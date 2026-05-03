create table if not exists tracked_position_snapshots (
  id text primary key,
  wallet_address text not null,
  wallet_hash text not null,
  asset text not null,
  side text not null,
  market_type text not null,
  captured_at bigint not null,
  entry_px double precision not null,
  entry_bucket_price double precision,
  mark_px double precision not null,
  size double precision not null,
  signed_size double precision not null,
  notional_usd double precision not null,
  margin_used_usd double precision,
  liquidation_px double precision,
  liquidation_bucket_price double precision,
  leverage_value double precision,
  leverage_type text,
  account_equity_usd double precision,
  realized_pnl_30d double precision,
  source text not null,
  payload jsonb not null
);

create index if not exists tracked_position_snapshots_asset_idx on tracked_position_snapshots (asset, captured_at desc);
create index if not exists tracked_position_snapshots_wallet_idx on tracked_position_snapshots (wallet_address, captured_at desc);
create index if not exists tracked_position_snapshots_liq_idx on tracked_position_snapshots (asset, side, liquidation_bucket_price, captured_at desc);

create table if not exists liq_heatmap_buckets (
  id text primary key,
  asset text not null,
  side text not null,
  created_at bigint not null,
  bucket_size double precision not null,
  bucket_price double precision not null,
  current_price double precision not null,
  distance_pct double precision not null,
  long_notional_usd double precision not null default 0,
  short_notional_usd double precision not null default 0,
  total_notional_usd double precision not null,
  margin_usd double precision,
  weighted_avg_leverage double precision,
  avg_entry_price double precision,
  position_count integer not null,
  wallet_count integer not null,
  source text not null,
  payload jsonb not null
);

create index if not exists liq_heatmap_buckets_asset_latest_idx on liq_heatmap_buckets (asset, created_at desc);
create index if not exists liq_heatmap_buckets_asset_side_idx on liq_heatmap_buckets (asset, side, bucket_price, created_at desc);
