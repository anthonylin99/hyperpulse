# HyperPulse Data Infra

HyperPulse now has a lean data-warehouse foundation designed for low-cost capture first, model training later.

## Architecture

Production stays simple:

- Vercel serves the public Next.js app.
- A DigitalOcean Docker droplet runs always-on ingestion workers.
- Neon Postgres is the canonical warehouse.
- Docker Compose is for local multi-service parity and worker packaging.

No Kafka, ClickHouse, Kubernetes, or full web Docker migration is required in this phase.

## Data Layers

### Current product tables

- `reaction_exposure_zones_current`
- `reaction_exposure_zone_events`
- `whale_wallets_current`
- `whale_wallet_asset_stats`
- `whale_positioning_current`
- `whale_alert_events`

`reaction_exposure_zones_current` is the serving table for the Reaction Map. It stores up to five bull zones and five bear zones per asset/window for BTC, ETH, and SOL. Zones are clustered from recent public Hyperliquid flow within a 0.8% band and remain explicitly inferred, not exact trader-position truth.

### Short-lived worker inputs

- `reaction_context_snapshots`
- `reaction_orderbook_buckets`
- `reaction_trade_buckets`

These tables are worker inputs, not product truth. The reaction worker promotes useful signal into current zones, then prunes short-lived aggregates by dynamic range and hard time caps.

### Legacy / compatibility capture

- `market_assets`
- `market_candles`
- `market_context_snapshots`
- `market_funding_rates`
- `positioning_market_snapshots` (legacy)
- `tracked_position_snapshots` (legacy)
- `liq_heatmap_buckets` (legacy)
- `whale_alerts` (legacy)
- `whale_trade_episodes` (legacy)
- `portfolio_trade_sizing_snapshots` (legacy)

### Silver / normalized features

- `feature_snapshots`
- `level_observations`

### Gold / labels and future predictions

- `training_labels`
- `model_predictions`

## Commands

Run migrations:

```bash
npm run db:migrate
```

Run market collector once:

```bash
npm run market:collect:once
```

Run continuously:

```bash
npm run market:collect
```

Run the Reaction Map ingestor:

```bash
npm run reaction:start
```

Run the private read-only MCP server:

```bash
npm run mcp:start
```

Run local Docker stack:

```bash
npm run docker:up
```

Local Docker Postgres is exposed on `localhost:15432` to avoid colliding with any Mac Postgres already using `5432`.

## Market Collector Defaults

- Selects top 15 active perps by volume/open-interest score.
- Captures `5m`, `15m`, `1h`, and `1d` candles.
- Captures market context every 5 minutes.
- Captures funding history hourly.
- Generates support/resistance observations from stored candles.
- Labels level outcomes after a 4-hour horizon.

Useful env overrides:

```bash
MARKET_COLLECTOR_ASSETS=BTC,ETH,SOL,HYPE,TAO
MARKET_COLLECTOR_ASSET_LIMIT=15
MARKET_COLLECTOR_INTERVALS=5m,15m,1h,1d
MARKET_COLLECTOR_LEVEL_INTERVALS=15m,1h
MARKET_COLLECTOR_INTERVAL_MS=300000
MARKET_COLLECTOR_ONCE=true
```

## Reaction Map Ingestor

The `reaction-map` worker subscribes to public Hyperliquid streams for BTC, ETH, and SOL:

- `activeAssetCtx` for mark price, funding, and open-interest changes
- `l2Book` and wide aggregated books for visible shelves
- `trades` for recent buy/sell flow concentration

Every flush cycle, the worker:

1. writes compact minute aggregates,
2. clusters candidate buckets into 0.8% exposure zones,
3. upserts the top five bull and top five bear zones per asset/window,
4. appends lifecycle events only for meaningful changes,
5. prunes out-of-range short-lived aggregates.

Cleanup uses `current spot +/- clamp(3 * recent average move, 2%, 35%)` with a hard time-cap fallback. Current zones and lifecycle events are preserved; stale current zones are marked instead of being deleted just because spot moved.

Production should run this worker as an always-on Docker process on the DigitalOcean droplet. Vercel reads current zones through `/api/market/reaction-levels`; it should not persist exposure-zone rows.

## Tracked Trader Liquidation Map

HyperPulse stores a zero-spend v1 liquidation map from tracked wallet profiles, not a full exchange-wide position book.

- `tracked_position_snapshots` normalizes current per-wallet perp positions with entry, mark, signed size, notional, margin, leverage, and liquidation price.
- `liq_heatmap_buckets` aggregates those positions by liquidation price bucket so the app can show tracked long/short liquidation pockets without recomputing from JSON profiles on every request.
- Buckets are rebuilt by the whale indexer during its positioning cycle and are used by `/api/whales/liquidation-heatmap` and `/api/market/pressure` when fresh rows exist.
- Labels should say `tracked trader` or `tracked wallet sample`; do not call this a full-market liquidation heatmap.

## Guardrails

- No full raw trade tape in v1.
- No full order-book history in v1.
- No full-market liquidation heatmap claim until coverage comes from a market-wide provider or equivalent exchange-wide reconstruction.
- Wallet IDs should be hashed before they are used in model-training tables.
- Keep legacy tables for one rollout while the new exposure-zone and whale-performance tables are verified. Drop old Neon tables only after temp-branch migration and production-read validation.
- MCP is read-only and returns `noOrderPlacement: true` guardrails.
- Use `ingestion_checkpoints` for restart-safe capture.
