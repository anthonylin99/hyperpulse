# HyperPulse Market Collector

Always-on Railway/Docker worker for the first HyperPulse market warehouse.

## What it captures

- Top 10-15 liquid Hyperliquid perps by volume/open-interest score
- `5m`, `15m`, `1h`, and `1d` candles
- 5-minute market context snapshots
- Funding history
- Point-in-time support/resistance level observations
- Basic market feature snapshots and delayed level labels

## Required env

- `DATABASE_URL` or `POSTGRES_URL`

## Optional env

- `MARKET_COLLECTOR_ASSETS=BTC,ETH,SOL,HYPE,TAO`
- `MARKET_COLLECTOR_ASSET_LIMIT=15`
- `MARKET_COLLECTOR_INTERVALS=5m,15m,1h,1d`
- `MARKET_COLLECTOR_LEVEL_INTERVALS=15m,1h`
- `MARKET_COLLECTOR_INTERVAL_MS=300000`
- `MARKET_COLLECTOR_ONCE=true`
- `HYPERPULSE_NETWORK=mainnet|testnet`

## Commands

```bash
npm run db:migrate
npm run market:collect:once
npm run market:collect
```
