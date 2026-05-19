-- HyperPulse Agent paper-execution foundation.
-- This is intentionally paper/testnet-scaffold only. No live exchange keys or
-- Hyperliquid order placement are represented in this schema.

create table if not exists agent_policies (
  id text primary key,
  mode text not null default 'paper' check (mode in ('paper', 'testnet', 'live')),
  status text not null default 'paused' check (status in ('paused', 'manual_approval', 'auto')),
  allowed_assets text[] not null default array['BTC', 'ETH', 'SOL', 'HYPE'],
  max_position_notional_usd double precision not null default 500,
  max_position_notional_pct_equity double precision not null default 0.05,
  max_leverage double precision not null default 3,
  per_trade_risk_pct_equity double precision not null default 0.005,
  daily_loss_limit_pct_equity double precision not null default 0.02,
  trade_cooldown_minutes integer not null default 30,
  max_trades_per_day integer not null default 3,
  min_reward_risk double precision not null default 1.5,
  min_stop_distance_pct double precision not null default 0.2,
  kill_switch_enabled boolean not null default true,
  human_approval_required boolean not null default true,
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists agent_execution_intents (
  id text primary key,
  idempotency_key text not null unique,
  mode text not null default 'paper' check (mode in ('paper', 'testnet', 'live')),
  status text not null check (
    status in (
      'risk_blocked',
      'pending_approval',
      'paper_open',
      'paper_closed',
      'rejected',
      'expired',
      'failed'
    )
  ),
  source_type text not null check (source_type in ('momentum_alert')),
  source_id text not null,
  asset text not null,
  side text not null check (side in ('long', 'short')),
  signal_created_at bigint not null,
  created_at bigint not null,
  updated_at bigint not null,
  approved_at bigint,
  rejected_at bigint,
  closed_at bigint,
  entry_price double precision not null,
  stop_price double precision,
  target_price double precision,
  margin_usd double precision,
  notional_usd double precision,
  leverage double precision,
  risk_usd double precision,
  stop_distance_pct double precision,
  reward_risk double precision,
  score double precision not null default 0,
  reason text not null default '',
  route_href text not null default '',
  policy_snapshot jsonb not null default '{}'::jsonb,
  checks jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  last_mark_price double precision,
  exit_price double precision,
  paper_pnl_usd double precision,
  paper_pnl_pct double precision,
  unique (mode, source_type, source_id)
);

create index if not exists agent_execution_intents_status_time_idx
  on agent_execution_intents (status, updated_at desc);

create index if not exists agent_execution_intents_source_idx
  on agent_execution_intents (source_type, source_id);

create table if not exists agent_audit_log (
  id text primary key,
  intent_id text not null,
  event_type text not null,
  created_at bigint not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists agent_audit_log_intent_time_idx
  on agent_audit_log (intent_id, created_at desc);
