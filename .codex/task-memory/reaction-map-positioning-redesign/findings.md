# Findings

## 2026-05-08 - Data Truth

Official Hyperliquid docs support the product distinction:

- `l2Book` is a real order-book feed/snapshot. The HTTP info endpoint says the snapshot returns at most 20 levels per side, and the WebSocket docs define `WsBook.levels` as bid/ask arrays of `WsLevel` with `px`, `sz`, and `n`.
- Public `trades` stream provides trade price, size, side, time, id, and buyer/seller users.
- `activeAssetCtx` provides `openInterest`, funding, mark price, mid price, and oracle price for perps.
- User fills include `dir` and `startPosition`, but those are user-specific fills, not global market-wide OI-at-price data.

Decision: Order Book can promise top bid/ask shelves with high confidence. OI Positioning must stay explicitly inferred.

## 2026-05-08 - Current Implementation Shape

Relevant local files:

- `workers/reaction-map/index.mjs`: subscribes to Hyperliquid public streams, buckets book/trade/context, builds exposure zones, stores current zones.
- `src/lib/reactionLevelStore.ts`: reads `reaction_exposure_zones_current`, then merges raw book shelves from stream buckets.
- `src/lib/reactionLevels.ts`: has support for up to five OI holding zones per side in fallback build logic, plus conversion into support/resistance chart levels.
- `src/components/PriceChart.tsx`: maps visible downside/upside flow levels onto the chart and currently treats location relative to price as support/resistance-style display context.

Decision: The plan should separate data contract first, then UI semantics.

## 2026-05-08 - Live Local Health

`docker compose exec web node scripts/reaction-map-health.mjs` showed fresh stream rows for BTC, ETH, and SOL, but only one active OI zone per asset in the current 15m serving table. This confirms the issue is not "no flow"; it is the current ranking/clustering/persistence model plus UI representation.

Decision: OI zone count should be made observable in health/API/UI empty slots.
