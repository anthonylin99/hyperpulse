# Findings

## 2026-04-12
- The root app layout was mounting `MarketProvider`, `FactorProvider`, `WalletProvider`, `PortfolioProvider`, and optional `PrivyProvider` for every route, including `/levels/[coin]`, `/whales/[coin]`, `/replay/[coin]`, `/research/[coin]`, and `/wallets/[address]`.
- The old shared nav imported both market context and wallet connect state, which forced market intelligence routes to pull trading code into the client graph even when they only needed static navigation links.
- `src/lib/market-intel.ts` was acting as a broad server barrel for snapshots, alerts, replay, wallet state, tracked coins, and whale data, so individual routes were compiling much more server code than they actually needed.
- `/api/stream/coin/[coin]` was fetching snapshot, pressure, and whale data through one helper even though the route only emits snapshot + pressure events.
- After the route-group move, the running dev server needed a restart before the new route tree resolved correctly; production build and live HTTP checks both confirmed the route definitions themselves were valid.

- Hyperliquid `/info` usage was fragmented across three places: the worker package client, a separate web helper, and raw `InfoClient` instances in multiple Next API routes.
- `services/ingestor/src/index.ts` is the highest-cost caller: each wallet refresh performs `clearinghouseState`, `openOrders`, `userFillsByTime`, and `userFunding` against the same public IP budget.
- Per-route app rate limits in Next were not protecting the upstream Hyperliquid limit because several routes created independent `InfoClient` transports with no shared pacing or retry behavior.
- The installed `@nktkas/hyperliquid` SDK exposes `HttpTransport.request(...)`, which made it safe to add a custom transport layer instead of patching every method call manually.
- Server-side coordination needs to happen across containers, not just per process, because `web` and `ingestor` share one public egress IP. Redis is already part of the stack and works as the shared scheduler.
- `packages/db/src/migrate.ts` discovered migration files with `readdirSync` before applying them.
- The host and container both showed exactly one SQL migration: `packages/db/migrations/001_market_intel.sql`.
- The directory exists and is readable inside the `ingestor` container, which makes a missing-path diagnosis unlikely.
- A deterministic migration manifest removes the startup dependency on scanning the bind-mounted migrations directory.

## 2026-04-11
- `src/components/PriceChart.tsx` uses `lightweight-charts` directly and currently only renders candles + volume.
- `src/components/levels/OrderBookPanel.tsx` is the source of the current nearby-level text list the user wants replaced.
- `src/lib/market-levels/index.ts` already computes visible bid/ask levels with notional, order count, and distance from mid; this is the right place to add a significance score for chart rendering.
- `origin/main` is already aligned with local `main` (`git rev-list --left-right --count HEAD...origin/main` returned `0 0`), so fetch succeeded and no pull was needed.
- Context7 docs confirm `series.createPriceLine(...)` for horizontal levels and `series.priceToCoordinate(price)` for chart-coordinate overlays.
- The running dev server needed a restart before `/api/levels` exposed the new `chartLevels` payload; after restart the snapshot returned 12 chart levels for BTC.
- Browser verification inside the container confirmed 12 rendered overlays on `/levels/BTC` with 6 bids and 6 asks and no runtime console errors.
- Direct SDK inspection showed Hyperliquid `l2Book` returns 20 visible levels per side for BTC; that is the hard ceiling for the truthful profile from this feed.
- Browser verification after the profile pivot confirmed 40 rendered on-chart bars on `/levels/BTC` with 20 bids and 20 asks and no runtime console errors.
- Browser verification after the polling change confirmed the snapshot timestamp changed from `20:21:44 UTC` to `20:22:09 UTC` without navigation, proving the Levels page auto-refreshes.
