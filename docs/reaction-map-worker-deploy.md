# Reaction Map Worker Deployment

Use this path when DigitalOcean should run only the Reaction Map stream worker. It does not start the web app, local Postgres, migrations, market collector, or whale indexer.

The worker expects the Neon schema to already be migrated. If startup logs mention missing tables or columns, apply the migrations first and restart the worker after the schema is ready.

## Required env

Create a droplet `.env` next to the compose file, or set these values in the DigitalOcean service environment:

```bash
DATABASE_URL="postgresql://...?sslmode=verify-full"
REACTION_MAP_ASSETS=BTC,ETH,SOL
REACTION_MAP_BUCKET_MS=60000
REACTION_MAP_FLUSH_MS=15000
REACTION_MAP_BOOK_LEVEL_LIMIT=40
REACTION_MAP_WIDE_BOOK_N_SIG_FIGS=3,2
REACTION_MAP_ZONE_WINDOWS=5m,15m,1h
REACTION_MAP_ZONE_CLUSTER_WIDTH_PCT=0.8
REACTION_MAP_ZONE_MIN_TRADE_NOTIONAL_USD=250000
REACTION_MAP_CLEANUP_RANGE_MIN_PCT=2
REACTION_MAP_CLEANUP_RANGE_MAX_PCT=35
REACTION_MAP_RETENTION_MS=86400000
```

Do not commit the real `DATABASE_URL`. Keep it in DigitalOcean secrets or a droplet-local `.env`.

Prefer `sslmode=verify-full` for Neon connection strings. The Node `pg` driver currently treats `sslmode=require` like `verify-full`, but startup logs warn that this behavior will change in a future major release.

## Start only the worker

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
[reaction-map] starting network=mainnet assets=BTC,ETH,SOL bucketMs=60000
[reaction-map] subscribed BTC wideBooks=3,2
[reaction-map] subscribed ETH wideBooks=3,2
[reaction-map] subscribed SOL wideBooks=3,2
[reaction-map] flushed context=... book=... trades=...
```

## Update the worker

```bash
git fetch
git pull
docker compose -f docker-compose.reaction-map.yml up -d --build reaction-map
docker compose -f docker-compose.reaction-map.yml logs --tail=80 reaction-map
```

## Stop the worker

```bash
docker compose -f docker-compose.reaction-map.yml down
```

## Avoid the full local stack on DigitalOcean

The root `docker-compose.yml` is for local full-stack development and includes `db`, `migrate`, `web`, `market-collector`, `reaction-map`, and `whale-indexer`.

For a worker-only droplet, prefer `docker-compose.reaction-map.yml`. If you intentionally use the root compose file for a one-off smoke, run `docker compose run -d --no-deps reaction-map`; otherwise Compose may try to resolve the local `db` service.
