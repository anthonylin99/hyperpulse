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

## Next Dev Steps

- Persist paper recommendations to Postgres instead of browser-only local storage.
- Add editable policy controls for allowed assets, max size, leverage, and cooldown.
- Add a testnet-only agent-wallet approval flow after policy and audit logging are stable.
