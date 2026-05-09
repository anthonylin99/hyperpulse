# Reaction Map Worker Deployment

Use this path when a Linux host or DigitalOcean droplet should run only the Reaction Map stream worker. It does not start the web app, local Postgres, migrations, market collector, or whale indexer.

The worker expects the Neon schema to already be migrated. Run migrations from the app/deploy pipeline with `NEON_DATABASE_URL` before starting the worker. If startup logs mention missing tables or columns, apply the migrations first and restart the worker after the schema is ready.

## Runtime contract

```text
Linux worker -> public Hyperliquid streams -> Neon reaction tables -> frontend /api/market/reaction-levels -> positioning + reaction panels
```

The worker writes compact inferred positioning zones into Neon. The frontend picks up new buyer/seller-initiated builds only when the frontend host also has Neon env access, preferably `NEON_DATABASE_URL_POOLING`, pointed at the same Neon project and branch.

## Required env

Create a droplet `.env` next to the compose file, or set these values in the Linux service environment:

```bash
NEON_DATABASE_URL="postgresql://...?sslmode=verify-full"
NEON_DATABASE_URL_POOLING="postgresql://...?sslmode=verify-full"
REACTION_MAP_ASSETS=BTC,ETH,SOL,HYPE,XRP,DOGE,ZEC,AAVE
REACTION_MAP_BUCKET_MS=60000
REACTION_MAP_FLUSH_MS=15000
REACTION_MAP_BOOK_LEVEL_LIMIT=40
REACTION_MAP_WIDE_BOOK_N_SIG_FIGS=3,2
REACTION_MAP_ZONE_WINDOWS=5m,15m,1h,4h
REACTION_MAP_ZONE_CLUSTER_WIDTH_PCT=0.8
REACTION_MAP_ZONE_MIN_TRADE_NOTIONAL_USD=250000
REACTION_MAP_CLEANUP_RANGE_MIN_PCT=2
REACTION_MAP_CLEANUP_RANGE_MAX_PCT=35
REACTION_MAP_RETENTION_MS=86400000
```

Do not commit the real Neon URL. Keep it in DigitalOcean secrets or a droplet-local `.env`.

Use `NEON_DATABASE_URL_POOLING` for the worker. Use `NEON_DATABASE_URL` for migrations. Keep both set on deploy hosts so no service needs to rename either value to `DATABASE_URL`.

Prefer `sslmode=verify-full` for Neon connection strings. The Node `pg` driver currently treats `sslmode=require` like `verify-full`, but startup logs warn that this behavior will change in a future major release.

## Start only the worker

One-command deploy/smoke path:

```bash
bash scripts/deploy-reaction-map-worker.sh
```

The script targets a Linux shell on the worker host. On Windows, use the manual Compose commands below.

Manual path:

```bash
git fetch
git pull
docker compose -f docker-compose.reaction-map.yml config --services
docker compose -f docker-compose.reaction-map.yml up -d --build reaction-map
docker compose -f docker-compose.reaction-map.yml ps
docker compose -f docker-compose.reaction-map.yml logs --tail=80 reaction-map
```

Expected service list:

```text
reaction-map
```

Healthy logs look like:

```text
[reaction-map] starting network=mainnet assets=BTC,ETH,SOL,HYPE,XRP,DOGE,ZEC,AAVE bucketMs=60000
[reaction-map] subscribed BTC wideBooks=3,2
[reaction-map] subscribed ETH wideBooks=3,2
[reaction-map] subscribed SOL wideBooks=3,2
[reaction-map] flushed context=... book=... trades=...
```

## Update the worker

```bash
bash scripts/deploy-reaction-map-worker.sh
```

## Stop the worker

```bash
docker compose -f docker-compose.reaction-map.yml down
```

## Avoid the full local stack on DigitalOcean

The root `docker-compose.yml` is for local full-stack development and includes `db`, `migrate`, `web`, `market-collector`, and `reaction-map`.

For a worker-only droplet, prefer `docker-compose.reaction-map.yml`. If you intentionally use the root compose file for a one-off smoke, run `docker compose run -d --no-deps reaction-map`; otherwise Compose may try to resolve the local `db` service.

## Frontend pickup check

After the worker flushes rows, check the frontend against the same Neon project:

```bash
curl -fsS "https://hyperpulsehl.com/api/market/reaction-levels?coin=BTC&window=15m" | head -c 500
```

The response should include `orderBook`, `positioning`, and `reactionZones` sections once the worker has flushed fresh buckets for the configured major assets. If the Linux worker is healthy but the frontend stays stale, check the frontend deploy env first: it needs `NEON_DATABASE_URL_POOLING` for runtime reads.
