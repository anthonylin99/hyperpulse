# HyperPulse Agent Trading Dev Plan

The current implementation starts in dev-only recommendation mode.

## Adjustments After The Latest Cleanup

- Build on `Momentum Alerts` and `Shadow Book`, not the removed activity feed or old recommendations panels.
- Keep agent work separate from `ENABLE_TRADING`; dev recommendations use `ENABLE_AGENT_DEV` and never call Hyperliquid exchange endpoints.
- Do not depend on the removed Railway supervisor. Any future execution worker should run as its own explicit process or Compose service.
- Treat `TradeDrawer` as manual/session execution only. Automated trading should use a server-side executor in a later phase.

## Dev First Slice

- `/agent` shows alert-derived recommendations when `ENABLE_AGENT_DEV` allows it.
- `/api/agent/dev/recommendations` reads stored `momentum_alert_events`, applies deterministic risk checks, and returns paper-ready sizing.
- The default policy only allows BTC, ETH, SOL, and HYPE. The Agent page includes an explicit expanded-universe dev toggle so local testing can exercise non-major alert rows without changing live defaults.
- The page can send an eligible recommendation into the local Shadow Book for paper tracking.
- No key storage, no agent wallet creation, no exchange orders, and no live worker are included in this slice.

## Current Rollout Slice

- `/api/agent/intents` converts stored momentum alerts into durable paper execution intents.
- `/api/agent/intents/[id]/approve` marks an intent as `paper_open` and never places an exchange order.
- `/api/agent/intents/[id]/reject` records an operator rejection.
- `agent_execution_intents` and `agent_audit_log` are the first durable audit trail for future testnet/live execution.
- `workers/agent-executor` is a locked scaffold. It refuses testnet/live orders until an explicit execution implementation is added.

## Next Dev Steps

- Add editable policy controls for allowed assets, max size, leverage, and cooldown.
- Add mark-price reconciliation for open paper intents so paper P&L is server-side, not only Shadow Book/local browser.
- Add a testnet-only agent-wallet approval flow after policy and audit logging are stable.
