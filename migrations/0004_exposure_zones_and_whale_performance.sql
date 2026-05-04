-- Exposure zones and whale performance v1.
-- Forward-only refactor: keep legacy tables during rollout, add compact current
-- product tables for worker-owned zone reads and structured whale performance.

create table if not exists reaction_exposure_zones_current (
  zone_id text primary key,
  asset text not null,
  window_ms bigint not null,
  side text not null check (side in ('bull', 'bear')),
  rank integer not null check (rank between 1 and 5),
  status text not null default 'active' check (status in ('active', 'stale', 'retired')),
  generated_at bigint not null,
  refreshed_at bigint not null,
  first_seen_at bigint not null,
  last_seen_at bigint not null,
  current_price double precision not null,
  zone_low double precision not null,
  zone_mid double precision not null,
  zone_high double precision not null,
  weighted_price double precision not null,
  distance_pct double precision not null,
  score double precision not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  primary_source text not null default 'positioning',
  candidate_count integer not null default 0,
  cluster_width_pct double precision not null default 0,
  book_notional_usd double precision not null default 0,
  trade_notional_usd double precision not null default 0,
  inferred_oi_notional_usd double precision not null default 0,
  tracked_liq_notional_usd double precision not null default 0,
  buy_notional_usd double precision not null default 0,
  sell_notional_usd double precision not null default 0,
  bid_depth_usd double precision not null default 0,
  ask_depth_usd double precision not null default 0,
  wallet_count integer not null default 0,
  tooltip jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'reaction_exposure_zones.v1'
);

create index if not exists reaction_exposure_zones_asset_window_idx
  on reaction_exposure_zones_current (asset, window_ms, side, rank);

create index if not exists reaction_exposure_zones_status_idx
  on reaction_exposure_zones_current (status, refreshed_at desc);

create unique index if not exists reaction_exposure_zones_active_rank_idx
  on reaction_exposure_zones_current (asset, window_ms, side, rank)
  where status <> 'retired';

create table if not exists reaction_exposure_zone_events (
  id text primary key,
  zone_id text not null,
  asset text not null,
  window_ms bigint not null,
  side text not null check (side in ('bull', 'bear')),
  event_type text not null check (
    event_type in ('created', 'expanded', 'moved', 'strengthened', 'weakened', 'touched', 'retired')
  ),
  event_at bigint not null,
  rank integer,
  current_price double precision,
  zone_low double precision,
  zone_mid double precision,
  zone_high double precision,
  score double precision,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists reaction_exposure_zone_events_asset_time_idx
  on reaction_exposure_zone_events (asset, event_at desc);

create index if not exists reaction_exposure_zone_events_zone_time_idx
  on reaction_exposure_zone_events (zone_id, event_at desc);

create table if not exists whale_wallets_current (
  address text primary key,
  wallet_hash text,
  first_seen_at bigint,
  last_seen_at bigint not null,
  account_equity_usd double precision not null default 0,
  perps_equity_usd double precision not null default 0,
  spot_usdc double precision not null default 0,
  total_open_notional_usd double precision not null default 0,
  unrealized_pnl_usd double precision not null default 0,
  realized_pnl_30d_usd double precision not null default 0,
  funding_30d_usd double precision not null default 0,
  open_positions_count integer not null default 0,
  average_leverage double precision not null default 0,
  win_rate_30d double precision,
  directional_hit_rate_30d double precision,
  pre_move_hit_rate_1h double precision,
  pre_move_hit_rate_4h double precision,
  pre_move_sample_size integer,
  repeated_add_count_6h integer,
  asset_focus text[],
  risk_tags text[],
  payload jsonb not null default '{}'::jsonb
);

create index if not exists whale_wallets_current_pnl_idx
  on whale_wallets_current (realized_pnl_30d_usd desc, last_seen_at desc);

create index if not exists whale_wallets_current_active_idx
  on whale_wallets_current (last_seen_at desc);

create table if not exists whale_wallet_asset_stats (
  address text not null,
  asset text not null,
  market_type text not null,
  lookback_window text not null default '30d',
  updated_at bigint not null,
  realized_pnl_usd double precision not null default 0,
  unrealized_pnl_usd double precision not null default 0,
  funding_usd double precision not null default 0,
  volume_usd double precision not null default 0,
  trade_count integer not null default 0,
  win_rate double precision,
  directional_hit_rate double precision,
  median_trade_size_usd double precision,
  avg_hold_hours double precision,
  long_notional_usd double precision not null default 0,
  short_notional_usd double precision not null default 0,
  net_notional_usd double precision not null default 0,
  risk_bucket text,
  payload jsonb not null default '{}'::jsonb,
  primary key (address, asset, market_type, lookback_window)
);

create index if not exists whale_wallet_asset_stats_asset_idx
  on whale_wallet_asset_stats (asset, realized_pnl_usd desc, updated_at desc);

create table if not exists whale_positioning_current (
  address text not null,
  asset text not null,
  market_type text not null,
  updated_at bigint not null,
  side text not null check (side in ('long', 'short')),
  size double precision not null,
  signed_size double precision not null,
  entry_px double precision not null,
  mark_px double precision not null,
  notional_usd double precision not null,
  margin_used_usd double precision,
  leverage double precision,
  leverage_type text,
  liquidation_px double precision,
  liquidation_distance_pct double precision,
  unrealized_pnl_usd double precision,
  return_on_equity double precision,
  asset_class text,
  risk_bucket text,
  payload jsonb not null default '{}'::jsonb,
  primary key (address, asset, market_type)
);

create index if not exists whale_positioning_asset_side_idx
  on whale_positioning_current (asset, side, updated_at desc);

create index if not exists whale_positioning_wallet_idx
  on whale_positioning_current (address, updated_at desc);

create table if not exists whale_alert_events (
  id text primary key,
  address text not null,
  asset text not null,
  created_at bigint not null,
  event_type text not null,
  directionality text not null,
  severity text not null,
  conviction text,
  side text,
  market_type text,
  asset_class text,
  risk_bucket text,
  notional_usd double precision,
  leverage double precision,
  wallet_realized_pnl_30d_usd double precision,
  wallet_directional_hit_rate_30d double precision,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists whale_alert_events_feed_idx
  on whale_alert_events (created_at desc, severity, asset);

create index if not exists whale_alert_events_wallet_idx
  on whale_alert_events (address, created_at desc);
