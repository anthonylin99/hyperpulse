# HyperPulse Data Infra

HyperPulse now has a lean data-warehouse foundation designed for low-cost capture first, model training later.

## Architecture

Production stays simple:

- Vercel serves the public Next.js app.
- A DigitalOcean Docker droplet runs always-on ingestion workers.
- Neon Postgres is the canonical warehouse.
- Docker Compose is for local multi-service parity and worker packaging. It uses Neon connection env values; the repo does not start a local database container.

No Kafka, ClickHouse, Kubernetes, or full web Docker migration is required in this phase.

## Data Layers

### Current Reaction Map product tables

- `reaction_exposure_zones_current`
- `reaction_exposure_zone_events`

`reaction_exposure_zones_current` is the serving table for the Reaction Map. It stores ranked long-OI and short-OI holding zones per asset/window for BTC, ETH, and SOL. Zones are clustered from recent public Hyperliquid flow and remain explicitly inferred, not exact trader-position truth.

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

Migrations run against Neon. Use `NEON_DATABASE_URL` for direct migration access and `NEON_DATABASE_URL_POOLING` for app and worker runtime reads/writes. Do not point local Compose at a disposable Postgres fallback.

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

The local Docker stack expects Neon env values in your shell or `.env`. It does not create a local database service; run `docker compose run --rm migrate` only when you intentionally want to apply migrations to Neon.

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

## Reaction Map And Momentum Alerts

HyperPulse no longer runs the whale indexer as an active product surface. Reaction Map uses public market stream buckets and visible order-book shelves; Momentum Alerts persist durable signal rows in `momentum_alert_events`.

- `/api/market/reaction-levels` reads current reaction zones from the reaction-map worker tables.
- `/api/market/pressure` runs in market-only mode without tracked-wallet liquidation buckets.
- `/api/alerts/momentum` is legacy unless `ENABLE_MOMENTUM_ALERTS=true` is set.
- Historical whale, market-collector, research, and portfolio-sizing tables are not part of the current Reaction Map runtime.

## Guardrails

- No full raw trade tape in v1.
- No full order-book history in v1.
- No full-market liquidation heatmap claim until coverage comes from a market-wide provider or equivalent exchange-wide reconstruction.
- Wallet IDs should be hashed before they are used in model-training tables.
- Keep legacy tables for one rollout while the new exposure-zone and whale-performance tables are verified. Drop old Neon tables only after temp-branch migration and production-read validation.
- MCP is read-only and returns `noOrderPlacement: true` guardrails.
- Use `ingestion_checkpoints` for restart-safe capture.
