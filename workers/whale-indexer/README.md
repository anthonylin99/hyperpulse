# HyperPulse Whale Indexer

This worker is the always-on discovery layer for the HyperPulse `Whales` tab.

## What it does
- subscribes to all Hyperliquid perp trade streams
- subscribes to `explorerTxs` on the Hyperliquid RPC websocket
- identifies candidate whale wallets from large fills and rapid adds
- enriches those wallets with state, fills, funding, and ledger data
- persists alerts and current wallet snapshots into Neon Postgres

## Deploy target
- Railway worker / service
- Neon Postgres for storage

## Railway settings
- Service root directory: `workers/whale-indexer`
- Start command: `npm start`
- If Railway asks for a builder, Nixpacks works with the included `nixpacks.toml`
- Required variable: `DATABASE_URL`

## Required env
- `DATABASE_URL`
- `WHALERPC_URL` optional, defaults to `wss://rpc.hyperliquid.xyz/ws`
- `HYPERLIQUID_WS_URL` optional, defaults to `wss://api.hyperliquid.xyz/ws`

## Notes
- v1 intentionally starts indexing from worker cutover onward.
- Historical wallet drilldowns are still fetched on demand in the app.
- This worker keeps HyperPulse read-only: it never signs or sends wallet actions.
