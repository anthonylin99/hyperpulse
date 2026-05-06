-- Momentum Alert Brain v1.
-- Stores point-in-time alert snapshots and generic notification delivery state.

create table if not exists momentum_alert_events (
  id text primary key,
  asset text not null,
  created_at bigint not null,
  alert_price double precision not null,
  current_price_at_eval double precision not null,
  return_1h_pct double precision,
  return_4h_pct double precision,
  return_24h_pct double precision,
  open_interest_usd double precision,
  open_interest_change_pct double precision,
  volume_24h_usd double precision,
  volume_vs_baseline double precision,
  funding_apr double precision,
  trigger_kind text not null check (trigger_kind in ('momentum_ignition', 'momentum_continuation')),
  score double precision not null,
  severity text not null check (severity in ('high', 'medium', 'low')),
  reason text not null,
  invalidation_price double precision,
  target_price double precision,
  route_href text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists momentum_alert_events_time_idx
  on momentum_alert_events (created_at desc);

create index if not exists momentum_alert_events_asset_time_idx
  on momentum_alert_events (asset, created_at desc);

create index if not exists momentum_alert_events_severity_time_idx
  on momentum_alert_events (severity, created_at desc);

create table if not exists notification_queue (
  id text primary key,
  event_type text not null,
  event_id text not null,
  channel text not null check (channel in ('telegram')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'disabled')),
  created_at bigint not null,
  sent_at bigint,
  attempts integer not null default 0,
  message_hash text,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  unique (event_type, event_id, channel)
);

create index if not exists notification_queue_status_time_idx
  on notification_queue (status, created_at asc);

create index if not exists notification_queue_event_idx
  on notification_queue (event_type, event_id);
