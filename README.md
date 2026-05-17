# HyperPulse

HyperPulse is a Hyperliquid-native intelligence workspace for live markets, read-only portfolio review, and trader-facing documentation.

The current public demo is optimized for **Hyperliquid traders** and intentionally ships in a **read-only posture**. It is designed to be safe to share publicly while still showing real product surfaces.

## Public Demo Scope

The public production deployment exposes:

- `Home`
- `Markets`
- `Portfolio`
- `Docs`

Hidden in the public demo by default:

- `Trading`
- `Factors`

Whale tracking has been retired from the active product/runtime. The live app redirects old whale routes back to Markets, and the active Neon runtime should stay focused on Reaction Map tables.

## Product Surfaces

- **Markets**: table-first Hyperliquid directory with price, funding, Reaction Map setup status, and top-level tape context
- **Reaction Map**: market-positioning level map for BTC, ETH, and SOL using public Hyperliquid trades, OI changes, book depth, and funding. It shows likely reaction pressure, not exact exchange-wide positions.
- **Portfolio**: read-only wallet review with performance chart, positions, and trade journal
- **Docs**: methodology and implementation notes for the current demo

## Deployment Architecture

- **Frontend**: Next.js App Router
- **Primary deployment target**: Vercel
- **Market data**: Hyperliquid-native APIs
- **Ingestion workers**: DigitalOcean Docker droplet for the always-on Reaction Map stream worker
- **Database**: Neon Postgres for worker-backed analytics where enabled

## Feature Flags

Runtime flags are resolved from environment variables:

- `ENABLE_TRADING`
- `ENABLE_FACTORS`
- `NEXT_PUBLIC_ENABLE_TRADING`
- `NEXT_PUBLIC_ENABLE_FACTORS`

Public production defaults:

- `ENABLE_TRADING=false`
- `ENABLE_FACTORS=false`

Optional site/runtime variables:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_BUILD_ID`

## Local Setup

Install dependencies:

```bash
npm install
```

Run the local dev server:

```bash
npm run dev
```

Open:

- [http://localhost:3000](http://localhost:3000)


## Data Infra

HyperPulse now includes a lean warehouse foundation for market capture and market-positioning research:

- Canonical SQL migrations via `npm run db:migrate`
- Market collector worker via `npm run market:collect`
- Reaction Map stream worker via `npm run reaction:start`
- Reaction Map read-only health check via `npm run reaction:health`
- Reaction-level API at `/api/market/reaction-levels?coin=BTC&window=15m`
- Current exposure-zone serving table with ranked Long OI and Short OI holding zones per asset/window
- Docker Compose local stack via `npm run docker:up`, using Neon env values rather than a local database container
- Worker-only DigitalOcean Compose path via `docker-compose.reaction-map.yml`
- Private read-only MCP server via `npm run mcp:start`

See [`docs/data-infra.md`](docs/data-infra.md).
For a DigitalOcean droplet that should run only the Reaction Map worker, see [`docs/reaction-map-worker-deploy.md`](docs/reaction-map-worker-deploy.md).

## Verification

Build the app:

```bash
npm run build
```

Build through the container path:

```bash
docker compose build web
```

Run the public smoke test against a local or deployed environment:

```bash
npm run smoke:public
```

To enforce the public-demo expectations during smoke testing:

```bash
HYPERPULSE_EXPECT_PUBLIC_FLAGS=1 npm run smoke:public
```

## Safety Posture

- Public demo is **read-only**
- No manual private-key entry
- Browser-wallet portfolio view is analytics-only by default
- Hidden features are disabled in public production
- Health, metadata, and crawler routes are included for public sharing

## Notes

- Factors were retired. Setup no longer needs `ARTEMIS_API_KEY`, `ENABLE_FACTORS`, or factor-specific OpenAI credentials.
- Landing screenshots are intended to come from real HyperPulse UI states rather than synthetic marketing mockups.
- If you are deploying publicly, verify the production flags first before sharing the URL.
