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

## 2026-05-02

- Request: revert the LFX map y-axis wheel zooming.
- Attempted: removed the cursor-anchored price-scale wheel zoom constants, helper, and wheel handler from `PriceChart`.
- Decision: restore the previous behavior where wheel events only keep LFX overlays aligned while lightweight-charts handles its native time-axis interaction.
- Result: Docker web build passes, the preview container on port 3002 was restarted, health/pressure smokes pass, and Browser Use confirmed the BTC markets chart is present after a wheel scroll.

## 2026-05-02

- Request: replace the disposable LFX/support logic with a no-vendor Hyperliquid Reaction Level Map for likely price reactions from public market activity.
- Attempted: added reaction-map SQL tables, a Docker Compose WebSocket worker for `l2Book`, `trades`, and `activeAssetCtx`, DB read/scoring modules, `/api/market/reaction-levels`, Reaction Map chart overlays, market-table setup signals, Docker runner source support for `docker compose exec web npm run build`, and README notes.
- Decision: V1 ranks market-wide positioning pressure from public streams plus optional tracked-wallet samples. UI copy says inferred/likely/tracked sample and does not claim full exchange-wide position truth.
- Result: `docker compose ps --services`, `docker compose up -d --build web reaction-map`, and `docker compose exec web npm run build` pass. The worker writes BTC buckets, the BTC reaction-level API returns non-empty levels, and Browser Use verifies the BTC market detail shows Reaction Map tabs/copy without overclaiming.

## 2026-05-02

- Request: stop Reaction Map levels from clustering around current spot and make the map show useful farther reaction shelves.
- Attempted: subscribed the reaction worker to wider Hyperliquid L2 book aggregations, changed level selection from nearest-price picking to distinct per-side reaction zones, and lowered the final display cutoff so deeper persistent shelves can surface after spacing filters.
- Decision: keep weak close-in noise filtered, but allow lower-score distant book shelves when they are persistent and separated enough to answer “where could price react if it travels.”
- Result: `docker compose up -d --build web reaction-map` and `docker compose exec web npm run build` pass. BTC API now returns spaced levels including 73k/74k/76k/78k downside and 81k/82k/83k/85k upside; Browser Use verifies the 1h Reaction Map chart no longer stacks levels around spot.

## 2026-05-03

- Request: add an OI Holding toggle using existing Postgres data instead of changing the database schema.
- Attempted: added `overlayLevels.oiHolding` to the reaction payload, ranked top inferred holding buckets from trade concentration allocated against positive OI changes, renamed the chart tabs to `Order Book` and `OI Holding`, and updated hover copy to explain defend/break behavior without claiming exact positions.
- Decision: no new table yet. OI Holding leads with top flow concentration and keeps inferred OI build as evidence, because public streams do not expose exact all-trader open positions or leverage.
- Result: `docker compose up -d --build web` and `docker compose exec web npm run build` pass. The BTC reaction API returns OI Holding buckets, and Browser Use verifies the `OI Holding` tab renders `#1/#2 OI hold` tags with cautious copy and no exact-position claim.

## 2026-05-03

- Request: hide OI Holding when it only clusters around current spot, and avoid adding more worker/runtime bloat.
- Attempted: added distance, spacing, and minimum-flow gates to OI Holding level selection, updated Reaction Map copy to say OI Holding only appears when far enough from spot to matter, and added an explicit hidden-state message for close-to-spot inferred builds.
- Decision: keep this as a product guardrail in the existing scorer/UI. No new worker, migration, or hosted service was added.
- Result: Docker web image build and `docker compose exec web npm run build` pass. The BTC reaction API returns normal levels but zero OI Holding levels for the current near-spot cluster, and Browser Use verifies the OI Holding hidden-state copy on `http://127.0.0.1:3004/markets?asset=BTC`.

## 2026-05-03

- Request: implement the Neon refactor for top bull/bear exposure zones, whale-performance storage, Docker ingestion, and cleanup; remove Neon tables that are no longer needed.
- Attempted: added forward migration `0004_exposure_zones_and_whale_performance.sql`, moved exposure-zone persistence into `workers/reaction-map`, made `/api/market/reaction-levels` read current zones first without Vercel persistence writes, updated OI Holding UI copy/tooltips, added structured whale-performance dual-writes, documented the Neon table-retention/drop matrix, and updated Docker/DigitalOcean architecture docs.
- Decision: keep legacy whale/profile/positioning tables for one rollout in code, but classify disposable tables in `docs/neon-table-retention.md`; destructive production cleanup runs only after temp-branch verification and explicit approval.
- Result: Docker build passed, `docker compose exec web npm run lint` passed, local migration `0004` applied, the rebuilt reaction worker populated BTC/ETH/SOL current zones, and the BTC reaction-level API returned bull/bear zone rows with tooltip metadata. After Neon reauthentication, migration `fcf86800-9bea-401b-aa29-b7f4c0527463` passed on temp branch `br-dry-surf-am0wzlim`, was applied to production branch `br-round-tree-amk0dtqc`, deleted the temp branch, removed the disposable tables, and left production `neondb` at about 25 MB. Browser Use later exposed the Node REPL bridge, but the active Browser Use API did not expose a navigation command and address-bar typing could not focus an editable target, so visual verification remains blocked.

## 2026-05-03

- Request: mimic the future DigitalOcean `reaction-map` worker locally against Neon production and verify the BTC Reaction Map UI with Browser Use.
- Attempted: ran a temporary Docker `reaction-map` container pointed at production Neon, found a production source-table compatibility gap, added forward migration `0005_reaction_worker_source_table_compat.sql`, tested it on a Neon temp branch, applied it to production after approval, reran the temporary worker, and stopped the smoke container after verification.
- Decision: fix the schema to match the existing worker contract instead of weakening the worker writes. Keep the local smoke worker temporary; DigitalOcean should use the same image/env shape permanently.
- Result: production Neon now receives worker rows cleanly: context, book, trade, current-zone, and zone-event rows populated. Browser Use navigated to `http://localhost:3004/markets?asset=BTC`, clicked `OI Holding`, and verified Reaction Map, Order Book, OI Holding, inferred/not-exact copy, bull/bear labels, and no console errors. Local Docker migration history was aligned by applying `0005` through the `migrate` service.

## 2026-05-03

- Request: clarify the exact DigitalOcean clone, env, and Docker commands for running the Reaction Map worker.
- Attempted: updated `docker-compose.yml` so services can read `DATABASE_URL` and worker tuning from `.env` instead of always using local Postgres defaults, then rebuilt the `reaction-map` image.
- Decision: keep local defaults for dev while allowing DigitalOcean to override via secrets or a droplet `.env`; do not paste production Neon credentials into docs or chat.
- Result: `docker compose config --services` and `docker compose build reaction-map` pass. Deployment should run `reaction-map` with `--no-deps` so it does not start the local Postgres/migrate stack on the droplet.

## 2026-05-05

- Request: check whether the long-running `reaction-map` worker looks healthy and make a DigitalOcean path that deploys only that worker.
- Attempted: inspected the Compose runtime, found the existing worker container was restart-looping against the local `db` fallback, recreated only `reaction-map` with `--no-deps` so it picked up the external `DATABASE_URL`, and added a worker-only Compose file plus deploy docs.
- Decision: use `docker-compose.reaction-map.yml` for DigitalOcean worker-only deployments because it has no `db`, `migrate`, or `web` services and requires `DATABASE_URL` instead of silently defaulting to local Postgres.
- Result: the recreated worker is up, subscribed to BTC/ETH/SOL, flushed fresh context/book/trade rows, and wrote fresh current zone/event rows. Worker-only deploy docs now list exact env and commands.

## 2026-05-05

- Request: verify whether Neon-backed Reaction Map levels are propagating through the frontend for BTC, ETH, and SOL.
- Attempted: rebuilt and started only the `web` container on port `3004`, checked the reaction-level API for BTC/ETH/SOL across 5m/15m/1h, and used Browser Use to inspect the live market detail UI and toggle Order Book/OI Holding.
- Decision: count Order Book levels from `payload.levels` with `primarySource=book`; `overlayLevels` is currently for OI Holding overlays, not book overlays.
- Result: BTC and ETH show active OI Holding zones in the frontend; SOL shows an active OI Holding zone and populated 5m Order Book levels. Browser Use found no app console errors.

## 2026-05-05

- Request: fix the SOL 15m `OI Holding` tab after the browser comment showed it returning the warm-up state.
- Attempted: reproduced the SOL 15m `OI Holding` empty state in Browser Use, confirmed the API and Neon current-zone table had a SOL 15m OI zone, and traced the drop to frontend side filtering for zones exactly at spot.
- Decision: keep positioning levels on their declared OI side: bull zones render as downside/support and bear zones render as upside/resistance, even when the zone midpoint is equal to current price.
- Result: rebuilt the web container and verified BTC, ETH, and SOL all show 15m OI Holding chips in Browser Use.

## 2026-05-05

- Request: fix the `Order Book` Reaction Map tab showing no levels, add a small loading/warming progress indicator, and clarify whether the current Neon table set is needed for a Reaction Map-only worker.
- Attempted: checked Neon production row counts from the worker container, confirmed raw `reaction_orderbook_buckets` existed, traced the empty Order Book UI to the API returning current OI zones before merging raw book/trade levels, added a merge path, disabled public caching for `/api/market/reaction-levels`, and documented a Reaction Map-only table-retention plan.
- Decision: keep current OI zones as the OI Holding product truth while merging public-stream book shelves into the same payload for the Order Book tab. For a worker-only deployment, keep only reaction tables plus `schema_migrations`; treat whale, Telegram, alert, positioning, and timing tables as drop candidates after temp-branch verification and approval.
- Result: rebuilt the web container, verified the API now returns no-store cached BTC/ETH/SOL payloads with both positioning and book levels, and Browser Use confirmed BTC Order Book renders level buttons without the warming/progress state while OI Holding still renders the current zone.

## 2026-05-05

- Request: clean the current Neon database by deleting legacy non-Reaction Map tables.
- Attempted: ran the exact legacy `drop table if exists ... cascade` list in a production transaction and rolled it back, verified Reaction Map API/worker health, then applied the drop list after explicit confirmation.
- Decision: keep only the live reaction serving tables in this Neon database: context snapshots, trade buckets, orderbook buckets, current exposure zones, and exposure-zone events. `schema_migrations` was not present as a user table at cleanup time.
- Result: dropped the whale, Telegram, positioning, alert, timing, liquidation heatmap, tracked-position, and legacy `reaction_level_snapshots` tables. A follow-up check showed the web process could recreate legacy whale tables through `whaleStore`, so `whaleStore` is now gated behind `ENABLE_WHALES`; the reaction worker also stopped sweeping the dropped legacy snapshot table. After rebuilding web and worker, the DB stayed at five reaction tables, BTC/ETH/SOL Reaction Map APIs returned 200s, and the worker continued flushing rows.

## 2026-05-07

- Request: briefly turn on the Reaction Map ingestor, write fresh rows, and judge whether the levels show up for each market.
- Attempted: fetched/pulled the branch, rebuilt/started `reaction-map` with `docker-compose.reaction-map.yml`, let it flush public BTC/ETH/SOL context/book/trade rows, queried current 15m zones, rebuilt `web` on port `3004`, and verified the live `/markets` pages in Browser Use.
- Decision: stop the worker after the smoke because this was a short ingestion test. Normalize `candleSnapshot` API responses when the SDK returns serialized JSON so the chart panel can exit loading reliably.
- Result: worker logs showed repeated BTC/ETH/SOL flushes, the reaction-level API returned live OI/book levels for all three markets, and Browser Use confirmed BTC, ETH, and SOL render refreshed Reaction Map zones. BTC/ETH showed bull and bear OI Holding chips; SOL showed the current bull OI Holding zone during the check.

## 2026-05-07

- Request: investigate the browser-selected `Loading Reaction Map...` state on `http://localhost:3004/markets?asset=SOL` after pulling `origin/main`.
- Attempted: checked live SOL candle and reaction-level APIs, inspected Docker logs, rebuilt the merged web image, and verified the SOL market detail in Browser Use.
- Decision: keep the `origin/main` startup path and copy the new `scripts/start.mjs` runtime dependency into `Dockerfile.web` instead of changing `npm start`.
- Result: the web image builds and starts on port `3004`; SOL no longer stays on the loading panel after reload and shows a refreshed OI Holding zone. The reaction-map worker continues flushing BTC/ETH/SOL rows.

## 2026-05-07

- Request: keep the Reaction Map OI-zone tooltip above the map and prevent it from being clipped or pushed off-screen.
- Attempted: moved the level hover card out of the chart frame into a viewport-level portal, clamped its width and position to the current viewport, added a max-height scroll cap for short screens, and tightened the small zone-chip placement on narrow screens.
- Decision: leave the chart frame clipped for the canvas/rounded corners, but render the tooltip outside that clipping context with a high z-index.
- Result: rebuilt the web container and verified the SOL OI Holding tooltip opens with full flow/OI/path details at the normal browser size and a short viewport without clipping.

## 2026-05-08

- Request: stop the market chart tooltip from shaking violently on hover.
- Attempted: traced the Reaction Map zone hover overlay, removed competing native `title` tooltips from the chart band buttons, and made the custom tooltip ignore pointer events so it cannot steal hover from the underlying band.
- Decision: keep the existing visual tooltip and active-zone behavior, but prevent the tooltip card itself from participating in hit testing.
- Result: `docker compose exec web npm run lint`, `docker compose exec web npm run build`, and `docker compose build web` passed. Web restarted on `WEB_PORT=3004`; Browser Use verified one tooltip node appears for a selected chart zone, the zone buttons no longer carry `title` attributes, the tooltip has `pointer-events-none`, and no fresh console errors appeared.

## 2026-05-07

- Request: investigate why the SOL OI Holding band seemed to flip between bullish and bearish around the same 87.75-88.25 range.
- Attempted: sampled the SOL reaction-level API repeatedly, inspected current Neon exposure-zone rows through the web container, and traced the flip to side assignment using the zone midpoint versus current mark price.
- Decision: classify OI Holding side from inferred buy-vs-sell flow instead of current-price location, keep chart support/resistance placement separate, and rename user-facing labels to Long OI / Short OI so the holder side is not confused with a directional area call.
- Result: rebuilt web and reaction-map containers. The SOL 87.75-88.25 band sampled consistently as Long OI across repeated API checks, and Browser Use verified the chart shows `87.75-88.25 Pivot Long OI holding zone`, `#1 long OI`, and tooltip flow details.

## 2026-05-08

- Request: investigate whether a real Neon Postgres URL was hardcoded into the repo.
- Attempted: fetched/pulled the current branch, searched tracked files for Neon/Postgres URL patterns, checked the worker-only Compose and deploy docs, and looked for `.env` files without exposing secret values.
- Decision: keep `docker-compose.reaction-map.yml` requiring `DATABASE_URL` from the environment; the full local Compose file may keep its local `db` fallback for local development.
- Result: no committed real Neon URL was found. The only tracked concrete Postgres URL is the local Docker fallback `postgres://hyperpulse:hyperpulse@db:5432/hyperpulse`; docs and examples use placeholders.

## 2026-05-08

- Request: support the existing `.env` names `NEON_DATABASE_URL` and `NEON_DATABASE_URL_POOLING`.
- Attempted: updated Next server stores, workers, scripts, Compose files, and worker docs/examples to accept the Neon env names while keeping `DATABASE_URL` and `POSTGRES_URL` as fallbacks.
- Decision: prefer `NEON_DATABASE_URL_POOLING` for app/workers and prefer `NEON_DATABASE_URL` for migrations, with pooled URL as a final migration fallback if it is the only configured value.
- Result: `.env` is now ignored by Git and Docker build context, the Docker production web build passed, web restarted on port `3004` because `3000` is owned by another container, and the Reaction Map worker rebuilt/restarted using `NEON_DATABASE_URL_POOLING`.

## 2026-05-08

- Request: make the Linux Reaction Map worker deploy path ingest OI flows so the frontend picks up fresh top OI Holding levels.
- Attempted: made `docker-compose.reaction-map.yml` fail fast unless both Neon direct and pooled URLs are set, added a Linux deploy/smoke script, and expanded the deploy doc with the worker-to-frontend runtime contract.
- Decision: keep migrations outside the worker-only host; use `NEON_DATABASE_URL` from the app/deploy pipeline for schema changes, then run only the worker on Linux with `NEON_DATABASE_URL_POOLING`.
- Result: the worker-only Compose file still resolves to just `reaction-map`, the worker is flushing BTC/ETH/SOL rows, and the local frontend API reads OI Holding rows for BTC, ETH, and SOL from the same Neon-backed store.

## 2026-05-08

- Request: clarify where the market chart tooltips are and make them visible.
- Attempted: confirmed the live `localhost:3004` page had only native hover titles/details below the chart, added a visible hover/focus tooltip card to chart pressure bands, rebuilt the Docker web image, and restarted `web` on port `3004`.
- Decision: keep the existing chart and band behavior, but make each band expose its range, role, explanation, optional flow/OI metadata, and inferred-not-exact-position caveat directly on hover/focus/click.
- Result: `docker compose build web` passed the production Next build. Browser Use verified `/markets?asset=BTC` showed a real tooltip node after selecting a band. This was superseded by the following restore of the previous Reaction Map chart.

## 2026-05-08

- Request: remove the new TA Guide path and restore the previous Reaction Map / OI Holding market chart.
- Attempted: compared the TA-guide commits against the pre-TA-guide restore point `37c4843`, restored the affected market UI and trade-plan files from that point, and removed the added `src/lib/technicalAnalysis.ts` helper.
- Decision: revert only the TA-guide blast radius instead of resetting the whole repo, preserving unrelated current branch history and documentation.
- Result: after removing one duplicated ternary fallback left by the restore, `docker compose build web` passed. The web container restarted on port `3004`, and Browser Use verified `/markets?asset=BTC` shows `Reaction Map`, `Order Book`, `OI Holding`, `Stress`, Long OI holding zones, the Flow/OI detail table, and no new browser errors beyond expected local Vercel analytics warnings.

## 2026-05-08

- Request: fix Reaction Map getting stuck on loading and intermittent `Unable to fetch price candles`.
- Attempted: timed the live candle and reaction-level APIs, confirmed both were fast directly, traced the visible loading gate to the chart candle fetch, added client-side candle timeout/retry/manual retry behavior, and added a small upstream retry loop in the market candles API route.
- Decision: keep Reaction Map data loading separate from candle loading; the chart now says `Loading price candles...` while candles gate rendering instead of implying the Reaction Map itself is stuck.
- Result: `docker compose build web` passed. Web restarted on port `3004` with `--no-deps` because the root Compose migration dependency failed on a changed historical migration. Browser Use verified `/markets?asset=BTC` moved from `Loading price candles...` to visible Reaction Map/OI Holding/Flow-OI details by the second sample.

## 2026-05-08

- Request: add the missing hover tooltip back to the restored Reaction Map chart.
- Attempted: wired the chart overlay hover/focus/selection state to a visible tooltip card using existing Reaction Map range, role, read, Flow/OI, rank, buy/sell, and inferred-not-exact-position metadata.
- Decision: keep the details-below-chart panel, but add an in-chart tooltip so bands explain themselves immediately on hover/focus/click.
- Result: `docker compose build web` passed, `web` restarted on port `3004`, and Browser Use verified selecting a chart band exposes a `tooltip` node with Flow/OI and inferred-position caveat. No fresh console errors appeared after the tooltip interaction.

## 2026-05-08

- Request: remove the old local HyperPulse Postgres data volume and continue Docker image cleanup.
- Attempted: inspected Docker disk usage, removed the unused `hyperpulse_hyperpulse_pg` volume, ran the safe cleanup script dry-run, then applied builder-cache and unused-image pruning.
- Decision: keep active containers/images and non-HyperPulse project volumes; the worker image can be rebuilt from `docker-compose.reaction-map.yml` when needed.
- Result: Docker build cache is now `0B`, images dropped to seven active images with `0B` reclaimable, and `localhost:3004/api/health` still returns `200`.

## 2026-05-13

- Request: pull latest `main` and make Reaction Map zone hover tooltips fall away when the pointer leaves or the user clicks away.
- Attempted: refreshed Agent OS, fast-forwarded this branch from `origin/main`, traced the stuck tooltip to `PriceChart.tsx`, and separated hover tooltip state from clicked zone highlight state.
- Decision: keep click selection as a visual highlight, but render the tooltip only from hover/focus state. Any pointer click outside a zone trigger clears the highlight and tooltip state.
- Result: `docker compose build web` and `docker compose run --rm --no-deps web npm run lint` passed. Rebuilt `web` was restarted on port `3004`; Browser Use confirmed zone triggers render, click-away removes the tooltip, and the page has no console warnings/errors. Runtime `web` logs show clean Next.js startup.

## 2026-05-08

- Request: check whether legacy/whale Neon tables are intentional or being recreated, add a read-only Reaction Map health script, and reduce the OI-level stream to the current BTC/ETH/SOL use case.
- Attempted: audited live Neon tables from the `web` container, dry-ran and applied a cleanup migration, added `npm run reaction:health`, gated legacy writers behind explicit `ENABLE_*` flags, narrowed Reaction Map worker defaults to BTC/ETH/SOL, and reduced the default zone cluster width from `0.8%` to `0.12%`.
- Decision: keep only `schema_migrations` plus the five Reaction Map tables in the active Neon branch. Treat `momentum-alerts`, market collector, research/portfolio store writes, and portfolio capture as opt-in legacy/auxiliary surfaces.
- Result: immediate health after cleanup showed no unexpected tables and BTC/ETH/SOL level refresh ages under a few seconds. A 3-minute watch showed `momentum_alert_events`, `notification_queue`, `worker_runs`, portfolio sizing, and research tables reappeared from an external deployed surface using old code; this local patch prevents those paths from recreating tables after redeploy/disable.

## 2026-05-08

- Request: fix the `market-radar` beta-history error after dropping `market_candles` from Reaction-only Neon.
- Attempted: reproduced the missing-table condition through the Reaction-only health state, then guarded `/api/market/radar` with a `to_regclass('public.market_candles')` check before querying beta history.
- Decision: keep beta history optional. If `market_candles` is absent, radar falls back to live market scoring without logging a Postgres `42P01` stack trace or recreating auxiliary tables.
- Result: `docker compose build web` passed, `web` restarted on port `3004`, and `GET /api/market/radar` returned `200` with no fresh `market-radar`, `market_candles`, or `42P01` log entries.

## 2026-05-08

- Request: plan the larger Reaction Map/OI Holdings redesign using GPT Pro's critique of real data vs inferred positioning.
- Attempted: fetched latest remote, rebased local `main`, verified Hyperliquid docs for `l2Book`, `trades`, and `activeAssetCtx`, reviewed current Reaction Map worker/API/chart surfaces, and created a named long-task memory plan.
- Decision: split the future work into real Order Book shelves, inferred OI Positioning, and confluence-based Reaction zones; OI must show up to five zones per side with confidence and missing-slot explanations, not forced support/resistance lines.
- Result: saved the baseline plan under `.codex/task-memory/reaction-map-positioning-redesign/` with implementation, findings, orchestration, ownership, integration, and verification artifacts.

## 2026-05-09

- Request: stop Reaction and Positioning from rendering the same levels, and widen live flow ingestion so more coins get useful levels.
- Attempted: expanded Reaction Map defaults to 20 liquid perps, made positioning thresholds adaptive by asset/window flow, kept top-5 bid/ask shelves live from `l2Book`, separated Reaction overlays from positioning-only zones, and guarded the worker against overlapping DB write cycles after widening ingestion.
- Decision: Positioning may show inferred OI/flow zones by itself, but Reaction should only show non-positioning confluence/stress zones; when confluence is absent, the Reaction view should not duplicate the Positioning chart.
- Result: Docker typecheck, lint, production web build, reaction-map rebuild, health script, API smoke, and runtime logs passed. BTC/TON/SUI/ONDO health shows 5 bid shelves + 5 ask shelves; TON API smoke returned separate Reaction and Positioning IDs.

## 2026-05-09

- Request: remove the Node `pg-connection-string` SSL mode warning for Postgres URLs using `sslmode=require` or related aliases.
- Attempted: refreshed Agent OS, fetched/pulled `main`, traced all `pg` Pool entry points, added shared URL normalization for app/scripts, normalized worker DB URLs before Pool construction, and rebuilt the Docker images for `web`, `migrate`, `market-collector`, `momentum-alerts`, and `reaction-map`.
- Decision: preserve the current secure behavior by converting `sslmode=prefer`, `sslmode=require`, and `sslmode=verify-ca` to explicit `sslmode=verify-full` before passing connection strings to `pg`.
- Result: `docker compose exec web npm run lint`, Docker image builds, worker syntax checks, and URL normalization smoke checks passed. Fresh `migrate` logs no longer show the SSL warning, but local Compose migration remains blocked by pre-existing checksum drift on `0007_reaction_only_cleanup.sql`; `web` was restarted with `--no-deps` on port `3004` because `3000` is occupied by `efiterminal-next`.

## 2026-05-09

- Request: implement the Reaction Map/OI Holdings redesign with multiple agents from the saved plan.
- Attempted: split API/model, worker/health, and UI work across agents, integrated their outputs, added structured `orderBook`, `positioning`, and `reactionZones` payload sections, added a dedicated Reaction Map panel, widened worker defaults to `5m,15m,1h,4h`, updated health reporting, and ran a challenger pass against the first integration.
- Decision: keep order-book shelves as real liquidity, positioning as inferred buyer/seller-initiated OI builds with source caveats, and reaction zones as confluence/context. Do not color or label positioning purely by whether it is above or below spot.
- Result: fixed challenger blockers for real 4h routing, duplicate hidden slots, confluence-only `reactionZones` that require book/stress overlap with positioning, role-aware positioning colors, live `l2Book` top-5 fallback shelves, panel/chart selection mapping, and stale naming. Docker lint, typecheck, production build, rebuilt `web` and `reaction-map` images, API smoke, health script, browser verification, and runtime logs passed. BTC/ETH/SOL now serve 5 bid shelves + 5 ask shelves; positioning returns buyer/seller builds plus hidden-slot reasons.

## 2026-05-09

- Request: fix Reaction Map levels clustering around current price and make the data source clearer after GPT Pro's critique.
- Attempted: refreshed Agent OS, fetched/pulled `main`, traced the worker/API/chart path, removed the API's live top-of-book shelf overwrite, made worker-promoted/current zones the API source of truth, changed chart mode `all` to internal `confluence`, hid the unwired Stress tab, relabeled chart copy toward inferred positioning, added response metadata and algorithm versioning, widened cleanup retention, and added trade dedupe by `coin:time:tid`.
- Decision: keep raw near-spot trade/OI buckets in the payload for diagnostics, but only promote positioning zones to the chart when they are fresh and far enough from spot. Reaction now renders far persisted book shelves/confluence, not the latest top-of-book ticks.
- Result: Docker production build passed and rebuilt `web` plus `reaction-map`. Local Compose root restart is still blocked by the pre-existing `0007_reaction_only_cleanup.sql` checksum drift, so rebuilt services were started with `--no-deps` on port `3004`. API smoke for BTC returned `worker_promoted_plus_stream_buckets`, `reaction-map-v2.1.0`, far Reaction zones at roughly `78000` through `85000`, empty chartable positioning when the only OI build was at spot, and persisted book shelves instead of live top-of-book rows. Browser Use and Playwright were unavailable in this session, so UI verification used page/API smoke and source checks.
- Follow-up: after the worker added volatility-aware retention, a `0.25%` zone cluster width, `0.3%` minimum zone distance, and top-10 stored zones per side, Compose was updated so Docker no longer overrides the worker's new defaults with the old `0.12%` cluster width. `docker compose config` confirms the worker environment now resolves to the intended values, but Docker Desktop was stopped before the worker could be rebuilt/restarted.
- Follow-up: `upsertExposureZones()` was changed from "retire everything, then recreate only zones seen in the current window" into a persistent top-10 leaderboard per side. Fresh zones now compete against carried-forward active zones, and inferred zones are not removed just because the recent time window no longer contains the original flow bucket. Zones leave the current set by falling out of the top 10, moving too close to spot, or being marked stale by the volatility-aware range sweep.

## 2026-05-10

- Request: fix the XRP positioning band that rendered as an oversized `1.43-1.47` zone and simplify the Reaction Map layer controls.
- Attempted: traced the wide XRP range to coarse low-price bucket sizing plus uncapped stored/display ranges, then removed the confusing chart-level `Reaction` tab so the user-facing layers are only `Positioning` and `Order Book`.
- Decision: keep confluence/reaction scoring internally, but do not expose it as a third chart toggle. Size inferred positioning zones from each asset/window's recent average absolute move instead of a fixed cap; the worker stores the dynamic width rule with the zone.
- Result: production web build passed, `next lint` passed, worker syntax check passed, and the worker was rebuilt/restarted. XRP 4h API smoke now returns zones around `1.4925-1.4975` and `1.4467-1.4533`, with widths of roughly `0.33%` and `0.44%` based on recent movement instead of the old `1.43-1.47` slab. The exposure-zone rank constraint was folded into the existing `0004` migration as top 10; the worker still widens the already-created local DB constraint at startup for compatibility.
- Follow-up: split raw flushing from zone promotion after logs showed the 20-asset worker was trying to run `flush + promote` every 15s while flushes took 40-98s. Raw flush now runs every 120s, promotion runs separately every 120s, and retention avoids overlapping promotion. API smoke confirmed values were present while the logs were noisy; the new cadence removed skipped-cycle spam in the sampled window.
- Follow-up: batched `reaction_orderbook_buckets` writes into configurable multi-row upserts (`REACTION_MAP_BOOK_FLUSH_BATCH_SIZE`, default `750`) and offset retention sweeps from promotion ticks. Fresh logs show `book=4320`+ flushes completing below the 5s slow-operation threshold, while promotion completes separately in roughly 17-19s without book-write overlap.
- Follow-up: fixed the Reaction Map hover tooltip clipping by separating the chart's clipped canvas layer from the floating overlay layer and raising the overlay stack. Browser verification on `/markets?asset=SUI` confirmed the selected positioning tooltip renders above the chart/price-scale area.
- Follow-up: removed near-spot suppression for inferred positioning. Worker promotion no longer drops zones inside `0.3%` of spot, API/chart display no longer hides positioning inside `0.45%`, and zones inside the current price range label as `Active test` instead of `Unknown`. Candidate lookups now use a 3x movement-based range clamped to `12%-45%` instead of fixed `65%-135%` worker and `80%-120%` API bands.

## 2026-05-12

- Request: make `codex/fix-reaction-map-levels` easy to merge into `main`.
- Attempted: fetched/pulled latest refs, merged `origin/main` into the branch, resolved conflicts in the Reaction Map API route, momentum-alerts Dockerfile, Reaction Map chart mode cleanup, and the deleted `.codex` skill ledger.
- Decision: keep main's live order-book shelf enrichment while preserving this branch's persisted Reaction Map source-of-truth changes; keep the momentum-alerts Dockerfile root-context compatible for local Compose while adding chart support from main.
- Result: `docker compose build web`, `docker compose build momentum-alerts reaction-map`, and a recreated `reaction-map` container passed. The sampled `reaction-map` logs showed startup/subscriptions without fresh errors.

## 2026-05-12

- Request: make Reaction Map positioning levels reliable on `/markets`, with long imbalances green, short imbalances red, and near-flat net flow shown as yellow pivot zones.
- Attempted: traced BTC 4h positioning through the worker table, API store, chart model, and page UI; reproduced the one-sided/near-price output; rebuilt and restarted `web` and `reaction-map` in Docker; verified the BTC 4h route and browser page on port `3004`.
- Decision: keep worker-promoted zones as the source, but carry recent retired worker rows into the displayed top-five-per-side ladder so one-sided current flow does not erase the opposite side. Classify net buy/sell within `$100K` as `pivot`, expose a distance-based leverage-pressure proxy, and color by imbalance type instead of price location.
- Result: `docker compose build web` and `docker compose build --no-cache reaction-map` passed. BTC 4h `/api/market/reaction-levels` returns 5 buyer-initiated long imbalance zones and 5 seller-initiated short imbalance zones with leverage proxy values; browser/API verification on `http://localhost:3004/markets` passed with no web console errors. Local full Compose startup remains blocked by the pre-existing `0007_reaction_only_cleanup.sql` checksum drift, so `web` was restarted with `--no-deps` on port `3004`.
- Follow-up: display selection now prefers distinct positioning ranges before filling any overlapping fallback slot. BTC 4h still returns 5 long-side and 5 short-side zones, but overlapping carried rows are suppressed in favor of separate bands so the chart reads like multiple levels rather than one thick zone.
- Follow-up: chart wheel handling now prevents the page from scrolling while the pointer is over the price chart, so wheel/trackpad gestures are reserved for chart zoom/pan. Verification was blocked after Docker Desktop began returning engine API 500s during rebuild; Docker service restart also required unavailable Windows privileges.
- Follow-up: after Docker restart, rebuilt `web` successfully and found BTC positioning could still expose only 8 visible worker zones when fresh long-side rows were sparse. The selector now fills remaining ladder slots from carried worker rows after fresh rows are exhausted, and carried rows stay displayable with explicit carried-forward evidence instead of being re-hidden as stale.
- Follow-up: Browser verification caught that the chart-container wheel listener did not catch every wheel path. Added a capture-phase wheel lock on the chart frame so page scroll is prevented before the event reaches the page while the chart still receives the wheel gesture.

## 2026-05-13

- Request: make Reaction Map useful for longer trades instead of showing a stack of tiny near-price positioning bands, and collect zones for every Hyperliquid perp.
- Attempted: traced the weak-zone output through worker asset selection, zone window support, worker ranking, API distance math, table setup scanning, and chart rendering; rebuilt/restarted `web` and `reaction-map`; verified the browser on `/markets?asset=BTC`.
- Decision: default the chart to 4h candles/zones, support `1d` Reaction Map windows, hide weak near-price bands in swing views, show only the strongest farther zone per side, add tooltip entry/stop/target framing, and let the worker discover all Hyperliquid perps by default while preserving exchange ticker casing.
- Result: `docker compose build web reaction-map`, `docker compose run --rm --no-deps web npm run lint`, and `docker compose run --rm --no-deps reaction-map node --check index.mjs` passed. The worker started in all-asset mode with `assetCount=183` and no sampled fatal/listener errors after the casing fix. Browser Use confirmed BTC defaults to `4h candles` / `4h zones`, renders one swing positioning band instead of the prior 10 overlapping triggers, includes tooltip stop/target fields, and reports no browser console warnings/errors.

## 2026-05-14

- Request: keep Reaction Map level targets inside the chart and add TradingView-style candle hover context.
- Attempted: clipped chart zone hit targets and price chips to the chart frame, added a compact BTC O/H/L/C candle readout with per-candle percent change, rebuilt the `web` Docker image, and restarted `web` on port `3004`.
- Decision: hide fully off-screen zone bands rather than letting invisible hover targets spill into the panel chrome; keep the candle readout visible with the latest candle and update it from crosshair hover when the chart reports a candle.
- Result: `docker compose build web` passed. Browser Use DOM verification on `/markets?asset=BTC` showed the new `BTC O/H/L/C ... +%` readout and only contained chart-level controls. Full Compose startup remains blocked by the existing local `0007_reaction_only_cleanup.sql` checksum mismatch, so `web` was restarted with `WEB_PORT=3004 docker compose up -d --no-deps web`.

## 2026-05-16

- Request: show the top five bull and top five bear BTC Reaction Map levels without hiding near-price or tightly spaced bands.
- Attempted: removed the chart-side distance and spacing suppression from Reaction Map level selection, switched the chart back to the worker positioning ladder for this view, and updated chart copy so it no longer says near-price bands stay hidden.
- Decision: show up to five bull-side and up to five bear-side positioning levels from the source ranking, with no chart-side distance or spacing suppression.
- Result: Docker web image build and lint passed. Browser Use verified `/markets?asset=BTC` renders 10 positioning detail buttons, split as 5 long/bull and 5 short/bear, with no browser console errors. Web runtime logs show the service ready.

## 2026-05-16

- Request: combine Reaction Map positioning and order-book levels into one chart view instead of forcing a Positioning vs Order Book selector.
- Attempted: refreshed Agent OS, fetched/pulled the branch, traced the chart/API level conversion, removed the exposed overlay selector, made the chart use the internal confluence mode, and added stacking logic that merges nearby inferred positioning with visible order-book depth.
- Decision: keep separate sources in the payload, but present one combined trader-facing level ladder. Same-side depth strengthens a stacked level, while opposing depth can weaken the score and tooltip evidence.
- Result: Docker web image build passed after fixing the new hover label type, `docker compose exec web npm run lint` passed, Browser Use verified `/markets` BTC detail shows `COMBINED` and no old Positioning/Order Book selector, and web logs show the service ready. Full Compose startup remains blocked by the existing local `0007_reaction_only_cleanup.sql` checksum drift, so `web` was started with `--no-deps` on port `3001` for verification.

## 2026-05-16

- Request: move the local HyperPulse web URL off `localhost:3000`.
- Attempted: refreshed Agent OS, fetched/pulled the branch, inspected Docker Compose service bindings, pinned the local web host port to `3005`, rebuilt/recreated the `web` container, and verified the app in the in-app browser.
- Decision: keep the container listening on internal port `3000`, but bind the host to `http://localhost:3005` via `WEB_PORT` and align `NEXT_PUBLIC_APP_URL` with that local URL.
- Result: `docker compose up -d --build --no-deps web` passed, Browser Use verified `http://localhost:3005/` loads HyperPulse with no console errors, and web logs show the service ready.

## 2026-05-16

- Request: investigate why the chart's positioning view does not show the order-book zones.
- Attempted: queried the live `/api/market/reaction-levels?coin=BTC&interval=4h` payload, checked the current browser DOM, and traced the chart conversion path in `PriceChart.tsx`.
- Decision: the API already returns both order-book shelves and book-derived reaction zones, but the chart was still converting the payload with the positioning-only `oi_holding` overlay and the five-level picker could crowd pure book zones out. Switch the chart back to `confluence`, reserve visible slots for book zones, and update the badge/copy to `Combined`.
- Result: after Docker recovered, `docker compose build web`, `docker compose up -d --no-deps --force-recreate web`, and `docker compose exec web npm run lint` passed. Browser Use verified `/markets?asset=BTC` now shows `Combined`, the combined positioning/order-book copy, book-derived `Rejection` bands, and `Stacked` bands with no browser console errors. Recent web logs show the service ready.

## 2026-05-17

- Request: remove the local Docker Postgres path and make the local stack use Neon instead.
- Attempted: fetched latest `main`, fast-forwarded the branch, inspected Compose/database env paths, removed the root Compose `db` service and local connection-string fallbacks, moved `migrate` behind an explicit `tools` profile, and updated docs to state that local Docker expects Neon env values.
- Decision: keep `migrate` as an intentional schema tool for Neon, but stop app/worker startup from depending on it or creating a local database service.
- Result: `docker compose config --services` now lists only app/worker services by default; `docker compose --profile tools config --services` includes `migrate` when explicitly requested.

## 2026-05-17

- Request: diagnose production `400` errors from market candle/funding requests and a Privy CSP violation.
- Attempted: refreshed Agent OS, fetched/pulled the branch, traced the API validation paths, compared the failing timestamps to current time, checked the CSP header, and reviewed Privy's CSP guidance.
- Decision: keep future timestamp validation, but allow a 10-minute browser/server clock-skew tolerance for public market `endTime` values and clamp accepted skew to server time. Add Privy's required auth, iframe, WalletConnect, WalletLink, and Privy RPC sources to CSP.
- Result: `docker compose build web` passed, `web` was recreated on port `3005`, skewed `/api/market/funding` and `/api/market/candles` requests returned `200`, `/markets` returned `200`, CSP includes Privy/WalletConnect sources, and recent web logs show the service ready.

## 2026-05-17

- Request: make the main price chart use the more reliable Liquidity Map-style server candle fetch and add line-only pivot liquidity levels for reversal pivots and breakout-close retests.
- Attempted: added `/api/market/chart-context`, moved `PriceChart` candle loading to that server-owned payload, added reversal/body-pivot and breakout-close line detection, rendered pivot lines separately from Reaction Map zones, and hardened the market table's background reaction scan against single-asset fetch failures.
- Decision: keep Liquidity Map in place for now, but stop borrowing its shaded technical zones. The main chart now uses line labels for pivot levels so they can be identified without turning into zones.
- Result: Docker web build passed before the final background-scan hardening, Browser Use verified `/markets?asset=BTC` renders `12 pivot lines`, `Breakout`, `Pivot low`, `Pivot high`, and `78,741`. The chart-context API returns 541 BTC 4h candles and 12 pivot lines, including the `78,741` breakout-close level. Final rebuild/log verification was blocked by Docker Desktop engine 500/EOF failures.
- Follow-up: tightened pivot liquidity levels to only show fresh, untested lines. Any retest or break after the level is created now invalidates it, so stale breakout lines like the `78,741` BTC 4h level are removed after the May 13 tag. `docker compose build web` passed, `web` was recreated on port `3005`, the BTC 4h chart-context API now returns 6 active-only pivot lines with `has78741=false`, Browser Use verified `/markets?asset=BTC` shows `6 pivot lines` without `78,741`, and recent web logs show the service ready.

## 2026-05-18

- Request: change Reaction Map from per-source top-five ladders into five total strongest levels, prioritizing clustered confluence across technical lines, order book, and positioning.
- Attempted: refreshed Agent OS, fetched/pulled the branch, confirmed Docker Compose services, traced the chart selection path, changed visible Reaction Map selection to one five-level pool, boosted levels that overlap active pivot/breakout technical lines, and updated mixed-level reads/colors toward support/rejection with bull/bear coloring.
- Decision: keep the API payload broad enough to include the stored top-10 positioning ladder and book context, then let `PriceChart` pick the final user-facing levels after technical confluence is known. If the strongest candidates are too close together, show fewer crowded near-price pivots rather than filling every slot.
- Result: `docker compose build web`, `docker compose run --rm --no-deps web npm run lint`, API smokes for BTC reaction-levels/chart-context, Browser Use verification on `/markets?asset=BTC`, and recent web logs passed. Browser verification showed 5 spaced Reaction Map bands, `Combined` copy, `Technical + Book + Positioning` tooltip labeling, and near-price duplicate pivot labels reduced from 5 to 3. The browser still reports a generic React hydration warning in production mode; web runtime logs show the service ready.
- Follow-up: made mixed/confluence stricter by using each level's stored range when merging order-book and positioning levels, and capped chart-visible zone width from the recent average candle move. BTC browser verification showed the confluence band narrowed to `76,984-77,207` instead of a broad ambiguous range.
- Follow-up: made 5 a display ceiling instead of a target. Source-only levels now need enough score/priority to fill a slot, and final spacing expands with recent average move. BTC browser verification showed only one Reaction Map band when only one level cleared the stricter rules.
- Follow-up: simplified the Reaction Map zone tooltip to source label, range, support/rejection badge, and one plain-English read. Removed rank, flow/OI, recent flow, buy/sell, leverage proxy, stop/target, refresh, and caveat details from the hover card; click/tap now opens the same simple tooltip for touch users.
- Follow-up: clarified that BTC's surviving shelf is not pure order book by making confluent tooltip copy say `Book + positioning overlap here...` when both sources are present. The one-band BTC outcome is caused by the 4h selector suppressing nearby candidates inside the recent-average-move spacing gate, not by missing positioning data.
- Follow-up: fixed `reaction-map` duplicate-rank promote failures by serializing each asset/window write with a Postgres transaction advisory lock and deduping same-batch `zone_id` candidates before assigning ranks. `docker compose build reaction-map`, `node --check`, and the first full post-restart promote passed without `reaction_exposure_zones_active_rank_idx` errors.
- Follow-up: made the chart book-first by hiding standalone technical pivot lines on the perp Reaction Map surface and using pivots only as confluence ingredients. Strong, spaced order-book shelves can now fill empty ladder slots with lighter support/rejection reads when full confluence is sparse; BTC browser verification showed four reaction bands and zero standalone pivot labels.
- Follow-up: fast-forwarded `codex/fix-reaction-map-levels` onto the latest `origin/main` so the branch contains the five new main commits and replayed the local Reaction Map changes without merge conflicts. `docker compose build web reaction-map`, `docker compose run --rm --no-deps web npm run lint`, `docker compose run --rm --no-deps reaction-map node --check index.mjs`, service recreate, merge-tree verification, and fresh web/reaction-map logs passed after restarting Docker Desktop.

## 2026-05-19

- Request: keep Reaction Map levels consistent across chart timeframes while still letting smaller candles show how price is reacting.
- Attempted: fetched/pulled the branch, traced `PriceChart` Reaction Map selection, added adjacent-window context fetches, anchored visible levels to a stable `4h` swing map, and moved lower/higher timeframe inputs into confluence chips instead of separate replacement levels.
- Decision: timeframe buttons now change candles/zoom, not the core level map. The `4h` master levels are selected first; `1h`, `15m`, or `1d` only annotate/boost those levels when they overlap.
- Result: `docker compose build web` and `docker compose run --rm --no-deps web npm run lint` passed. Browser verification on `/markets?asset=BTC` showed identical five `4h+` Reaction Map levels on both `4h` and `1h`, with `1h reaction` and `5 MTF overlap` context badges and no console warnings/errors. Recent `web` logs show the service ready.
- Follow-up: fixed small-screen chart clipping by constraining the expanded market detail to the visible scrollport, adding `min-w-0` through the markets/chart containers, reserving a responsive lightweight-charts right price-scale width, and pulling Reaction Map level chips/tooltips inward from the price axis. `docker compose build web`, `docker compose run --rm --no-deps web npm run lint`, service recreate, CDP responsive checks at 900/720/390 px, and recent `web` logs passed.
- Follow-up: rebased `codex/fix-reaction-map-levels` onto latest `origin/main` so the branch includes the newest main commits before committing the responsive chart fix. When `main` later added the market pulse share card, resolved the one `PriceChart` conflict by keeping main's `15m` default candle interval while preserving the stable `4h` Reaction Map.

## 2026-05-22

- Request: add an always-readable liquidity/positioning ladder around price without inventing technical open-air targets, and make level strength simple enough to read at chart speed.
- Attempted: used a small agent-team review, traced `PriceChart` level selection and `/api/market/reaction-levels`, converted live bid/ask shelves into light chart levels, applied technical confluence before visible slot selection, protected at least one available upside and downside level, and added `Light` / `Medium` / `Strong` labels plus compact tooltip caveats.
- Decision: live order-book shelves are real but movable, so they now enter the chart as low-confidence `Book shelf` levels and only upgrade when confluence is present. Technical pivots remain confluence inputs, not invented upside targets.
- Result: `docker compose build web`, `docker compose run --rm --no-deps web npm run lint`, API smoke checks for HYPE reaction levels/chart context, and Browser verification on `/markets?asset=HYPE` and `/markets?asset=LIT` passed. HYPE showed five `Strong` levels across support/resistance; LIT showed `Strong` and `Medium` support/resistance labels, and the Medium tooltip included `Worth watching` plus the caveat `Orders can pull; positioning is inferred.`
- Follow-up: investigated why BTC showed a seemingly new `Strong` resistance around `77,962`. The live payload, event table, and browser DOM showed it is a carried-forward 4h inferred seller-positioning zone first created on May 21 at 12:26 AM ET, then rendered as `Book + Positioning + Technical` after nearby confluence. Added tooltip timing for first seen, last evidence, carried-forward state, and later technical confirmation so levels do not feel random or purely reactive.
