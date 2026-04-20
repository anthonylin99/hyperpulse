# HyperPulse Whale Indexer

This worker is the always-on discovery layer for the HyperPulse `Whales` tab.

## What it does
- subscribes to all Hyperliquid perp trade streams
- subscribes to HIP-3 / spot trade streams using the spot market universe
- subscribes to `explorerTxs` on the Hyperliquid RPC websocket
- classifies episodes as directional entries, directional adds, hedges, rotations, reduces, or stress
- enriches wallets with positions, grouped trades, funding, ledger flow, and bucket exposures
- persists alerts, episodes, wallet profiles, worker heartbeat, and Telegram queue rows into Neon Postgres

## Deploy target
- Railway worker / service
- Neon Postgres for storage

## Railway settings
- Service root directory: `workers/whale-indexer`
- Start command: `npm start`
- Required variable: `DATABASE_URL`

## Required env
- `DATABASE_URL`
- `WHALERPC_URL` optional, defaults to `wss://rpc.hyperliquid.xyz/ws`
- `HYPERLIQUID_WS_URL` optional, defaults to `wss://api.hyperliquid.xyz/ws`
- `WHALE_MAJOR_THRESHOLD_USD` optional, defaults to `1000000`
- `WHALE_ALT_THRESHOLD_USD` optional, defaults to `500000`
- `WHALE_DEPOSIT_THRESHOLD_USD` optional, defaults to `250000`
- `WHALE_HIGH_LEVERAGE` optional, defaults to `10`
- `WHALE_RISK_LOSS_USD` optional, defaults to `500000`
- `WHALE_LIQ_DISTANCE_PCT` optional, defaults to `10`

## Telegram env
- `TELEGRAM_ENABLED=true` to turn on outbound alerts
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `NEXT_PUBLIC_APP_URL` for deep links back into HyperPulse

## Notes
- v1 intentionally starts indexing from worker cutover onward.
- Historical wallet drilldowns are still fetched on demand in the app.
- This worker keeps HyperPulse read-only: it never signs or sends wallet actions.
- Telegram delivery is idempotent through the `whale_telegram_queue` table.
