# HyperPulse Data Infra

HyperPulse now has a lean data-warehouse foundation designed for low-cost capture first, model training later.

## Architecture

Production stays simple:

- Vercel serves the public Next.js app.
- Railway runs always-on workers.
- Neon Postgres is the canonical warehouse.
- Docker Compose is for local multi-service parity and worker packaging.

No Kafka, ClickHouse, Kubernetes, or full web Docker migration is required in this phase.

## Data Layers

### Bronze / raw-ish capture

- `market_assets`
- `market_candles`
- `market_context_snapshots`
- `market_funding_rates`
- `positioning_market_snapshots`
- `whale_alerts`
- `whale_trade_episodes`
- `portfolio_trade_sizing_snapshots`

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

## Guardrails

- No full raw trade tape in v1.
- No full order-book history in v1.
- Wallet IDs should be hashed before they are used in model-training tables.
- MCP is read-only and returns `noOrderPlacement: true` guardrails.
- Use `ingestion_checkpoints` for restart-safe capture.
