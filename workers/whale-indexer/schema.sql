create table if not exists whale_alerts (
  id text primary key,
  address text not null,
  created_at bigint not null,
  coin text not null,
  event_type text not null,
  severity text not null,
  payload jsonb not null
);

create index if not exists whale_alerts_created_at_idx on whale_alerts (created_at desc);
create index if not exists whale_alerts_address_idx on whale_alerts (address);

create table if not exists whale_profiles_current (
  address text primary key,
  updated_at bigint not null,
  payload jsonb not null
);

create table if not exists whale_watchlist (
  address text primary key,
  nickname text,
  created_at bigint not null
);
