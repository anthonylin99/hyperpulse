-- HyperPulse data infra foundation.
-- This migration creates the lean warehouse tables used by the market collector,
-- support/resistance observation jobs, and future read-only MCP surfaces.

create table if not exists market_assets (
  asset_key text primary key,
  asset text not null,
  symbol text not null,
  market_type text not null,
  dex text not null default 'main',
  asset_index integer,
  sz_decimals integer,
  max_leverage double precision,
  is_active boolean not null default true,
  first_seen_at bigint not null,
  last_seen_at bigint not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists market_assets_active_idx on market_assets (is_active, market_type, last_seen_at desc);
create unique index if not exists market_assets_identity_idx on market_assets (asset, market_type, dex);

create table if not exists market_candles (
  asset_key text not null references market_assets(asset_key) on delete cascade,
  asset text not null,
  market_type text not null,
  interval text not null,
  open_time bigint not null,
  close_time bigint not null,
  open double precision not null,
  high double precision not null,
  low double precision not null,
  close double precision not null,
  volume double precision not null default 0,
  trade_count integer,
  source text not null default 'hyperliquid',
  captured_at bigint not null,
  payload jsonb not null default '{}'::jsonb,
  primary key (asset_key, interval, open_time)
);

create index if not exists market_candles_asset_interval_time_idx on market_candles (asset_key, interval, open_time desc);
create index if not exists market_candles_interval_time_idx on market_candles (interval, open_time desc);

create table if not exists market_context_snapshots (
  id text primary key,
  asset_key text not null references market_assets(asset_key) on delete cascade,
  asset text not null,
  market_type text not null,
  captured_at bigint not null,
  mark_px double precision,
  mid_px double precision,
  oracle_px double precision,
  prev_day_px double precision,
  funding_rate double precision,
  funding_apr double precision,
  open_interest_coin double precision,
  open_interest_usd double precision,
  day_volume_usd double precision,
  price_change_24h double precision,
  source text not null default 'hyperliquid',
  payload jsonb not null default '{}'::jsonb
);

create index if not exists market_context_asset_time_idx on market_context_snapshots (asset_key, captured_at desc);
create index if not exists market_context_time_idx on market_context_snapshots (captured_at desc);

create table if not exists market_funding_rates (
  asset_key text not null references market_assets(asset_key) on delete cascade,
  asset text not null,
  market_type text not null,
  time bigint not null,
  funding_rate double precision not null,
  funding_apr double precision,
  premium double precision,
  source text not null default 'hyperliquid',
  captured_at bigint not null,
  payload jsonb not null default '{}'::jsonb,
  primary key (asset_key, time)
);

create index if not exists market_funding_asset_time_idx on market_funding_rates (asset_key, time desc);

create table if not exists ingestion_checkpoints (
  source text primary key,
  cursor_ms bigint,
  cursor_text text,
  updated_at bigint not null,
  status text not null default 'ok',
  payload jsonb not null default '{}'::jsonb
);

create table if not exists worker_runs (
  id text primary key,
  worker text not null,
  started_at bigint not null,
  completed_at bigint,
  status text not null,
  message text,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists worker_runs_worker_time_idx on worker_runs (worker, started_at desc);

create table if not exists level_observations (
  id text primary key,
  asset_key text not null references market_assets(asset_key) on delete cascade,
  asset text not null,
  market_type text not null,
  interval text not null,
  observed_at bigint not null,
  kind text not null check (kind in ('support', 'resistance')),
  level_price double precision not null,
  source text not null,
  distance_pct double precision,
  strength double precision not null default 0,
  touches integer not null default 1,
  atr_pct double precision,
  feature_version text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists level_observations_asset_time_idx on level_observations (asset_key, observed_at desc);
create index if not exists level_observations_kind_idx on level_observations (kind, observed_at desc);

create table if not exists feature_snapshots (
  id text primary key,
  asset_key text not null references market_assets(asset_key) on delete cascade,
  asset text not null,
  market_type text not null,
  feature_time bigint not null,
  horizon_set text not null,
  feature_version text not null,
  return_5m double precision,
  return_1h double precision,
  return_4h double precision,
  return_24h double precision,
  realized_vol_24h double precision,
  atr_pct double precision,
  funding_apr double precision,
  open_interest_usd double precision,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists feature_snapshots_asset_time_idx on feature_snapshots (asset_key, feature_time desc);
create index if not exists feature_snapshots_version_idx on feature_snapshots (feature_version, feature_time desc);

create table if not exists training_labels (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  asset_key text not null references market_assets(asset_key) on delete cascade,
  asset text not null,
  market_type text not null,
  feature_time bigint not null,
  horizon_minutes integer not null,
  forward_return_pct double precision,
  max_up_pct double precision,
  max_down_pct double precision,
  touched boolean,
  respected boolean,
  broken boolean,
  time_to_touch_ms bigint,
  label_version text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists training_labels_entity_idx on training_labels (entity_type, entity_id);
create index if not exists training_labels_asset_time_idx on training_labels (asset_key, feature_time desc);

create table if not exists model_predictions (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  generated_at bigint not null,
  model_version text not null,
  prediction_type text not null,
  score double precision,
  confidence text,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists model_predictions_entity_idx on model_predictions (entity_type, entity_id, generated_at desc);
create index if not exists model_predictions_type_idx on model_predictions (prediction_type, generated_at desc);

-- Existing product tables are included here so new databases can be brought up
-- from one canonical migration runner instead of relying on opportunistic app boot.
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

create index if not exists research_daily_prices_asset_day_idx on research_daily_prices (asset, market_type, day desc);

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

alter table portfolio_trade_sizing_snapshots add column if not exists liquidation_px double precision;
create index if not exists portfolio_trade_sizing_wallet_idx on portfolio_trade_sizing_snapshots (wallet_address, captured_at desc);
create index if not exists portfolio_trade_sizing_position_idx on portfolio_trade_sizing_snapshots (wallet_address, position_key, captured_at desc);

create table if not exists portfolio_tracked_wallets (
  wallet_address text primary key,
  first_seen_at bigint not null,
  last_seen_at bigint not null,
  source text not null,
  status text not null
);

create index if not exists portfolio_tracked_wallets_status_idx on portfolio_tracked_wallets (status, last_seen_at desc);

create table if not exists whale_alerts (
  id text primary key,
  address text not null,
  created_at bigint not null,
  coin text not null,
  event_type text not null,
  severity text not null,
  directionality text,
  market_type text,
  risk_bucket text,
  payload jsonb not null
);

create table if not exists whale_profiles_current (
  address text primary key,
  updated_at bigint not null,
  payload jsonb not null
);

create table if not exists whale_trade_episodes (
  id text primary key,
  address text not null,
  created_at bigint not null,
  directionality text,
  market_type text,
  risk_bucket text,
  payload jsonb not null
);

create table if not exists whale_telegram_queue (
  id text primary key,
  alert_id text unique not null,
  created_at bigint not null,
  sent_at bigint,
  message_hash text,
  payload jsonb not null
);

create table if not exists whale_worker_status (
  service text primary key,
  updated_at bigint not null,
  payload jsonb
);

create table if not exists whale_watchlist (
  address text primary key,
  nickname text,
  created_at bigint not null
);

create table if not exists positioning_market_snapshots (
  id text primary key,
  asset text not null,
  created_at bigint not null,
  market_type text not null,
  payload jsonb not null
);

create table if not exists positioning_alerts (
  id text primary key,
  asset text not null,
  alert_type text not null,
  regime text not null,
  severity text not null,
  created_at bigint not null,
  payload jsonb not null
);

create table if not exists positioning_digest_runs (
  id text primary key,
  created_at bigint not null,
  payload jsonb not null,
  message_hash text,
  telegram_sent_at bigint
);

create table if not exists wallet_timing_scores (
  address text not null,
  asset text not null,
  lookahead_hours integer not null,
  updated_at bigint not null,
  payload jsonb not null,
  primary key (address, asset, lookahead_hours)
);

alter table whale_alerts add column if not exists directionality text;
alter table whale_alerts add column if not exists market_type text;
alter table whale_alerts add column if not exists risk_bucket text;
alter table whale_trade_episodes add column if not exists directionality text;
alter table whale_trade_episodes add column if not exists market_type text;
alter table whale_trade_episodes add column if not exists risk_bucket text;
create index if not exists whale_alerts_created_at_idx on whale_alerts (created_at desc);
create index if not exists whale_alerts_address_idx on whale_alerts (address);
create index if not exists whale_alerts_directionality_idx on whale_alerts (directionality, created_at desc);
create index if not exists whale_alerts_market_type_idx on whale_alerts (market_type, created_at desc);
create index if not exists whale_trade_episodes_created_at_idx on whale_trade_episodes (created_at desc);
create index if not exists positioning_alerts_created_at_idx on positioning_alerts (created_at desc);
create index if not exists positioning_alerts_asset_idx on positioning_alerts (asset, created_at desc);
create index if not exists positioning_market_snapshots_asset_idx on positioning_market_snapshots (asset, created_at desc);
