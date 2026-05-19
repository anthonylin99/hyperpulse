create table if not exists factor_daily_closes (
  asset text not null,
  day text not null,
  time bigint not null,
  close double precision not null,
  volume double precision not null default 0,
  source text not null default 'hyperliquid',
  updated_at bigint not null,
  primary key (asset, day)
);

create index if not exists factor_daily_closes_day_idx
  on factor_daily_closes (day desc);

create table if not exists factor_report_snapshots (
  report_id text primary key,
  period_start text not null,
  period_end text not null,
  generated_at bigint not null,
  universe text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists factor_report_snapshots_generated_idx
  on factor_report_snapshots (generated_at desc);

create table if not exists alert_outcomes (
  alert_id text primary key,
  asset text not null,
  direction text not null,
  evaluated_at bigint not null,
  horizon_ms bigint not null,
  horizon_complete boolean not null default false,
  outcome text not null,
  hit_time bigint,
  hit_price double precision,
  time_to_hit_ms bigint,
  outcome_return_pct double precision,
  max_favorable_pct double precision,
  max_adverse_pct double precision,
  candles_checked integer not null default 0,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists alert_outcomes_asset_idx
  on alert_outcomes (asset, evaluated_at desc);

create index if not exists alert_outcomes_outcome_idx
  on alert_outcomes (outcome, evaluated_at desc);
