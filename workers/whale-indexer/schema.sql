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

create index if not exists whale_alerts_created_at_idx on whale_alerts (created_at desc);
create index if not exists whale_alerts_address_idx on whale_alerts (address);
create index if not exists whale_alerts_directionality_idx on whale_alerts (directionality, created_at desc);

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

create index if not exists whale_trade_episodes_created_at_idx on whale_trade_episodes (created_at desc);

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
