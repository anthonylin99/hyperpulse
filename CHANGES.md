## 2026-04-12

- Request: reset local `main` and `origin/main` back to commit `29bf91a36c36d0dae9c178156be78b19764c3596`.
- Attempted: verified current branch state, fetched remote history, resolved the target commit, and checked the local branch was clean before rewriting refs.
- Decision: used `git reset --hard` on local `main` and `git push --force-with-lease origin main` because the user explicitly requested a branch rollback.
- Result: local `main` and remote `origin/main` now point to `29bf91a36c36d0dae9c178156be78b19764c3596` (`Add trade analyzer for post-exit reviews`).

## 2026-04-29

- Request: sync latest `main`, prepare a separate levels/pressure feature branch, and confirm local/deployment setup before feature work.
- Attempted: fetched all remotes, pulled `origin/main` fast-forward, created `well-pressure` from commit `ada359b`, reviewed README/Railway config and existing support/resistance code, built the app, started local dev on port `3001`, ran browser smoke, and ran public smoke.
- Decision: kept local execution on host npm because no `docker-compose.yml` or `compose.yml` exists in this checkout; Vercel remains the frontend target and Railway remains worker-only per README/config.
- Result: build passed and public smoke passed for `http://localhost:3001`.

## 2026-04-29

- Request: implement the Levels + Pressure plan on `well-pressure`.
- Attempted: removed the retired Factors surface and config, added a Hyperliquid-native pressure API, added tracked-wallet liquidation banding, and wired pressure overlays into the existing price chart.
- Decision: kept pressure inside the existing Next/Vercel app with optional whale store data only; no new deployment instance is required.
- Result: Factors no longer need Artemis/OpenAI config, `/api/market/pressure` returns market context without tracked wallets, and charts can render tracked liquidation pockets when profiles contain `liquidationPx`.

## 2026-04-30

- Request: replace the test support/resistance read with the most leveraged long/short levels on the market page and chart.
- Attempted: fetched and pulled latest `origin/main` into `well-pressure`, resolved the merge cleanup, replaced candle-pivot setup scanning with batched pressure scans, added estimated leverage bands from OI/max leverage/funding/book skew, and kept tracked-wallet liquidation clusters as an additive source.
- Decision: the market page and chart no longer fall back to candle-derived support/resistance for this surface; long-liquidation bands below price and short-liquidation bands above price are the only displayed levels, with line intensity coming from pressure score.
- Result: Docker web image rebuild passes, container-side health/pressure/page smoke passes, and Browser Use verification shows long/short liquidation labels with no `R2`, `R3`, `Support`, or `Resistance` chart text.

## 2026-04-30

- Request: implement LFX v1 using free request-time Hyperliquid APIs only, no new services or deployment changes.
- Attempted: pulled latest `origin/main`, resolved merge conflicts, replaced `/api/market/pressure` semantics with market-inferred LFX zones, limited table scans to BTC/ETH/SOL/HYPE, and updated the chart/table copy to LFX language.
- Decision: v1 stays market-only with OI/funding/max leverage/visible book depth and ATR reach; wallet-confirmed liquidation maps remain a later version.
- Result: `docker compose build web` passes, container smoke passes for health/LFX/page routes, Browser Use verifies `LFX map` with no old S/R labels, and classifier checks cover thin/thick bid/ask scenarios.

## 2026-04-30

- Request: add justification to LFX levels so each level explains what is happening there.
- Attempted: pulled latest `origin/main`, resolved the chart merge conflict, added level explanations/evidence to the LFX model, and rendered evidence chips in chart level rows.
- Decision: kept the wording as LFX/forced-flow context rather than reintroducing old support/resistance labels.
- Result: Docker web build passes, pressure API returns `explanation` and `evidence`, and Browser Use verifies the level rows show flow/depth, reach, buy/sell risk, and leverage-tier context.

## 2026-04-30

- Request: fix 1d candle failure, simplify noisy LFX level copy, make levels feel like ranges, and show where flow attraction can point next.
- Attempted: capped chart 1d lookback under the candle API limit, replaced leverage-tier/depth-ratio evidence with flow rank/depth/leverage chips, added LFX range bands and right-edge rank tags, added an on-chart attraction map, and renamed the stale `Leverage / Crowd` tab to `LFX / Crowd`.
- Decision: kept the model market-only and probabilistic; attraction wording describes likely next flow pockets, not dealer gamma hedging.
- Result: `docker compose build web` passes, container smoke passes for health/pressure/batch/1d candles/markets, and Browser Use verifies 1d candles render with `Attraction map`, `Top #1` flow chips, range bands, and no `Support`, `Resistance`, `R2`, `R3`, `tier proxy`, `flow/depth`, `40x`, or `Leverage / Crowd` text.

## 2026-04-30

- Request: remove the attraction map, add chart-level flow arrows, and move LFX level details into hoverable chart tooltips.
- Attempted: pulled latest `origin/main`, resolved the PriceChart/tradePlan autostash conflict, replaced the attraction map with dashed directional arrows, made each chart range/tag hoverable and tappable, and moved level range/explanation/path/evidence into the tooltip.
- Decision: kept bottom panel focused on the trade plan only; the chart itself now owns level interpretation so users do not have to match lower rows back to prices.
- Result: `docker compose build web` passes, container smoke passes for health/pressure/batch/1d candles/markets, and Browser Use verifies `#1 sell flow` opens a tooltip with path/top-flow/risk detail while `Attraction map`, old flow rows, and 1d candle errors are absent.

## 2026-05-01

- Request: show whether there is actionable leverage near current price, especially around 77k, instead of only outer buy/sell flow ranges.
- Attempted: fetched/pulled latest `origin/main`, added candle-anchored local LFX projection from recent entry prices, and merged those projected near-mark bands into the chart alongside the stronger outer market-inferred pockets.
- Decision: near bands are labeled `near buy flow` / `near sell flow` and explained as projected from recent entry flow, not wallet-confirmed liquidation walls.
- Result: `docker compose build web` passes and container smoke passes for health/pressure/batch/1d candles/markets. Browser Use verification was attempted but blocked by its browser security policy after navigation timeouts, so no alternate browser route was used.

## 2026-05-01

- Request: fix LFX chart lines that looked like detached DOM overlays instead of price-bound chart levels.
- Attempted: fetched/pulled latest `origin/main`, moved visible LFX center/range lines to native lightweight-charts price lines, made DOM bands transparent hover targets only, and subscribed overlay coordinate refresh to chart range/crosshair/wheel/pointer changes.
- Decision: chart canvas owns visible prices; React overlay only owns tooltips, tags, and arrows.
- Result: `docker compose build web` passes, container route smoke passes, and Browser Use verifies the BTC chart renders with LFX/near-flow content and no candle error.

## 2026-05-01

- Request: add simple hover reads for LFX sell/buy levels so testing can classify each level as Rejection, Break, or Pivot.
- Attempted: fetched/pulled latest `origin/main`, mapped existing LFX zone data into the three plain-English reads, and made the chart hover card lead with the read before showing compact evidence.
- Decision: kept the classification inside the existing chart hover UI; no new API shape or persistent test data was added.
- Result: `docker compose build web` passes, temporary `3002` route smoke passes for health/pressure/markets. Later Browser Use discovery exposed `mcp__node_repl__js`, confirming the runtime is lazy-loaded rather than missing.

## 2026-05-01

- Request: stop fast chart scrolling from pulling the page upward and make LFX level strength visually clearer.
- Attempted: added chart-frame scroll containment, temporarily locks page scroll while the pointer is inside the chart, and drove line width, opacity, band fill, arrows, and tag glow from a shared visual-strength score.
- Decision: kept the interaction local to `PriceChart`; no global page scroll behavior changed outside chart hover.
- Result: Docker web build passes, Browser Use verifies fast scrolling inside the chart keeps the viewport on the chart, and the rebuilt preview remains available at `http://localhost:3002/markets`.

## 2026-05-01

- Request: explain whether near-flow tags are meaningful or just random nearby projections, and hide weak near-flow signals.
- Attempted: traced near-flow generation to local projected LFX buckets, removed the artificial minimum notional floor, required repeated projected entries plus a meaningful share of nearby same-side flow, ranked near buckets by quality instead of pure closeness, and preserved projection-specific hover evidence.
- Decision: near-flow remains market-inferred and estimated, but now it must clear a stricter quality gate; weak projections return no tag.
- Result: Docker web build passes, rebuilt `3002` preview is healthy, and Browser Use verifies the hover card shows recent candles, projected entries, nearby-flow share, estimated notional, leverage bucket, and entry range.

## 2026-05-02

- Request: split shifting estimated stress zones from real ranked flow levels so the chart no longer always implies a buy/sell range.
- Attempted: relabeled market-inferred leverage tiers as moving stress context, preserved ranked flow language for non-stress clusters only, softened stress-zone visual weight, and excluded stress zones from trade-plan level generation.
- Decision: stress zones can move with mark and remain visible as risk context; `#1/#2 flow` is reserved for filtered clustered flow levels.
- Result: Docker web build passes.

## 2026-05-02

- Request: clarify whether HyperPulse already stores trader/position data for a production liquidation/OI heatmap and whether Allium would be needed or paid.
- Attempted: inspected the local data-infra docs, migration schema, market collector, and whale indexer; checked current Allium Hyperliquid docs and pricing pages.
- Decision: the current warehouse supports market snapshots and tracked-wallet samples, but not a normalized market-wide position book. Production-grade liquidation heatmaps need either normalized tracked-position snapshots at scale or a provider/warehouse feed such as Allium.
- Result: no runtime changes; this is a data-architecture research note.

## 2026-05-02

- Request: build the zero-spend tracked-wallet v1 for trader liquidation levels and label it honestly as a tracked trader sample.
- Attempted: added normalized tracked position snapshots, liquidation heatmap bucket storage, worker persistence from enriched whale profiles, bucket rebuilds during the positioning cycle, stored-bucket reads in the heatmap API, tracked-bucket support in market pressure, and tracked trader copy across UI/docs.
- Decision: HyperPulse now treats this as a proprietary tracked-trader data source, not a full-market liquidation heatmap. Stored buckets are used only when fresh; empty local stores return clean empty payloads instead of errors.
- Result: Docker web/worker builds pass, migration `0002_tracked_liquidation_heatmap.sql` applies, local Postgres has the new tables, health/pressure/heatmap API smokes pass, and Browser Use verifies the whales page shows `Trader liquidation map` with no `tracked-book` label.

## 2026-05-02

- Request: make LFX map mouse-wheel zoom move the y-axis toward the cursor point instead of only zooming time.
- Attempted: added cursor-anchored price-scale wheel zoom to `PriceChart`, using the candle series coordinate-to-price conversion and setting the visible price range around the cursor price.
- Decision: keep native lightweight-charts horizontal wheel behavior and layer a small vertical price-range zoom on top so the chart zooms into the point under the cursor.
- Result: Docker web build passes and health/pressure smokes pass. Browser Use was attempted but blocked because no active Codex browser pane was available.
