## 2026-04-12

- Request summary: reset local `main` and `origin/main` to commit `29bf91a36c36d0dae9c178156be78b19764c3596`.
- Skills used: `verification-gate`.
- What helped: verifying the current branch was clean, fetching before rewriting refs, and resolving the target SHA directly before force-pushing.
- Friction or missing capability: none.
- Recommendation: keep.

## 2026-04-29

- Request summary: sync latest `main`, create `well-pressure`, and verify local/deployment path before levels feature work.
- Skills used: `prompt-master`, `brainstorming`, `verification-gate`, `caveman`.
- What helped: prompt normalization kept scope to branch/setup, verification caught lack of Compose file, and browser/tool discovery documented the Playwright fallback.
- Friction or missing capability: Browser Use did not surface through tool discovery; Playwright MCP generated temp logs that needed cleanup.
- Recommendation: keep.

## 2026-04-29

- Request summary: implement Levels + Pressure v1 and retire Factors.
- Skills used: `verification-gate`, `ui-ux-pro-max`, `webapp-testing`, `caveman`.
- What helped: repo evidence kept pressure chart-native and avoided pretending public trades expose leverage or liquidation prices.
- Friction or missing capability: factor removal touched many surfaces; text search fallback was slower because `rg` was unavailable.
- Recommendation: keep.

## 2026-04-29

- Request summary: make Browser Use bootstrap guidance durable in user-level AGENTS and installed webapp-testing skills.
- Skills used: `verification-gate`, `webapp-testing`, `browser-use:browser`, `caveman`.
- What helped: local evidence showed Browser Use works through `mcp__node_repl__js` plus `browser-client.mjs` with backend `iab`.
- Friction or missing capability: Browser Use has no separate callable namespace, so agents can misclassify it as unavailable when only Playwright MCP is visible.
- Recommendation: upgrade.

## 2026-04-30

- Request summary: make leveraged long/short liquidation clusters drive market-page and chart support/resistance instead of candle-pivot test levels.
- Skills used: `prompt-master`, `brainstorming`, `verification-gate`, `ui-ux-pro-max`, `webapp-testing`, `browser-use:browser`, `caveman`.
- What helped: pressure-level helper kept table, API, and chart logic aligned around one ranked leverage model; Browser Use caught the chart getting squeezed by the footer before handoff.
- Friction or missing capability: Docker runner image does not include the public smoke script, so the smoke check had to use `docker compose exec web node -e` against the running app.
- Recommendation: keep.

## 2026-04-30

- Request summary: implement LFX v1 with free request-time APIs and no deployment/service changes.
- Skills used: `prompt-master`, `brainstorming`, `verification-gate`, `ui-ux-pro-max`, `webapp-testing`, `browser-use:browser`, `caveman`.
- What helped: the LFX helper kept API, table badges, chart lines, and scenario labels on one domain model while Browser Use verified the visible copy.
- Friction or missing capability: Docker image export returned one transient EOF and port 3000 was already allocated, so verification used a temporary web port.
- Recommendation: keep.

## 2026-04-30

- Request summary: add explanations and justification to each LFX level.
- Skills used: `prompt-master`, `brainstorming`, `verification-gate`, `ui-ux-pro-max`, `webapp-testing`, `browser-use:browser`, `caveman`.
- What helped: using the existing LFX data model made it easy to add evidence once and render it in the chart without adding services.
- Friction or missing capability: latest pull conflicted with upstream chart precision work, requiring another merge pass.
- Recommendation: keep.

## 2026-04-30

- Request summary: fix 1d candle fetch, convert LFX levels into ranges, simplify evidence copy, and add chart attraction guidance.
- Skills used: `prompt-master`, `brainstorming`, `verification-gate`, `ui-ux-pro-max`, `webapp-testing`, `browser-use:browser`, `caveman`.
- What helped: Browser Use made the stale `Leverage / Crowd` label and final 1d chart state visible after the API smoke passed.
- Friction or missing capability: `rg` was unavailable/blocked, so repo search used slower PowerShell `Select-String`.
- Recommendation: keep.

## 2026-04-30

- Request summary: replace the LFX attraction map with directional chart arrows and hover/tap tooltips on the chart ranges.
- Skills used: `verification-gate`, `ui-ux-pro-max`, `webapp-testing`, `browser-use:browser`, `caveman`.
- What helped: Browser Use DOM and interaction checks caught tooltip focus behavior and confirmed old attraction/row copy was gone.
- Friction or missing capability: Browser Use screenshots timed out after reload, so verification used DOM/interaction assertions instead.
- Recommendation: keep.

## 2026-05-01

- Request summary: add near-current leverage context so chart can surface 77k-style decision pockets, not only outer LFX ranges.
- Skills used: `prompt-master`, `brainstorming`, `verification-gate`, `ui-ux-pro-max`, `webapp-testing`, `browser-use:browser`, `caveman`.
- What helped: inspecting the pressure model showed mark-anchored tiers were the reason nearby projected liquidation pockets were missing.
- Friction or missing capability: Browser Use timed out and then blocked the page interaction through its security policy, so final verification stayed at Docker build and route smoke.
- Recommendation: keep.

## 2026-05-01

- Request summary: fix detached-looking LFX chart overlays so visible levels move with chart prices.
- Skills used: `verification-gate`, `ui-ux-pro-max`, `webapp-testing`, `browser-use:browser`, `caveman`.
- What helped: inspecting the chart effect showed range bands were visible DOM overlays while chart-native series only drew partial historical lines.
- Friction or missing capability: none.
- Recommendation: keep.

## 2026-05-01

- Request summary: add Rejection, Break, and Pivot hover reads to LFX chart levels.
- Skills used: `prompt-master`, `brainstorming`, `verification-gate`, `visual-first-product-thinking`, `ui-ux-pro-max`, `webapp-testing`, `browser-use:browser`.
- What helped: existing LFX zone types already carried enough pressure/depth information to classify the hover read without adding a new API.
- Friction or missing capability: Browser Use/node REPL is lazy-loaded through tool discovery; before discovery it can look unavailable even though it is installed.
- Recommendation: keep.

## 2026-05-01

- Request summary: prevent LFX chart wheel scrolling from pulling the page and increase visible level-strength contrast.
- Skills used: `verification-gate`, `ui-ux-pro-max`, `webapp-testing`, `browser-use:browser`.
- What helped: Browser Use reproduced the scroll jump and then verified the chart remained in view after the lock was added.
- Friction or missing capability: CUA scroll has to start from an actually visible chart area; an early test from the page top produced a false negative.
- Recommendation: keep.

## 2026-05-01

- Request summary: tighten near-flow quality so random near-price projections do not show as useful levels.
- Skills used: `prompt-master`, `brainstorming`, `verification-gate`, `webapp-testing`, `browser-use:browser`.
- What helped: tracing `buildLocalProjectedLfxLevels` showed near flow was estimated from recent candle entries and was being ranked too heavily by closeness to mark.
- Friction or missing capability: no unit test harness exists for `pressureLevels`, so verification relied on Docker build plus live browser inspection.
- Recommendation: add focused tests for LFX level filtering once a test runner is introduced.

## 2026-05-02

- Request summary: stop market-inferred leverage tiers from showing as permanent ranked buy/sell flow ranges.
- Skills used: `prompt-master`, `brainstorming`, `verification-gate`, `ui-ux-pro-max`, `webapp-testing`.
- What helped: separating moving stress context from actionable flow labels matched the user's mental model and avoided inventing confidence.
- Friction or missing capability: still no automated visual or unit test harness for LFX chart semantics.
- Recommendation: add pressure-level unit tests before further signal logic expansion.

## 2026-05-02

- Request summary: run a debated agent-team review of the best level model from open interest, open trades, and volume.
- Skills used: `spin-up-agent-team`, `prompt-master`, `brainstorming`, `online-research`.
- What helped: specialists independently converged that aggregate OI confirms pressure but does not locate levels; challenger pushed for strict provenance before more scoring.
- Friction or missing capability: true market-wide open-position entry/liquidation distribution is not exposed by public Hyperliquid data.
- Recommendation: build observed volume/acceptance levels first, add OI-delta confirmation only after storing OI snapshots.

## 2026-05-02

- Request summary: explain current HyperPulse storage/tracking for trader positions and evaluate whether Allium is needed/costed for production liquidation heatmaps.
- Skills used: `prompt-master`, `verification-gate`, `online-research`.
- What helped: repo data-infra docs and whale-indexer code already show the split between market snapshots, tracked-wallet JSON profiles, and alert-level liquidation clusters.
- Friction or missing capability: HyperPulse does not yet have normalized per-position snapshot tables, so heatmap aggregation would need a new storage layer or external provider.
- Recommendation: add normalized tracked-position snapshots before paying for full provider coverage.

## 2026-05-02

- Request summary: implement zero-spend tracked-wallet v1 with normalized position snapshots, liquidation heatmap buckets, and honest tracked trader labeling.
- Skills used: `prompt-master`, `brainstorming`, `verification-gate`, `repo-execution`, `coding-discipline`, `backend-dev-guidelines`, `webapp-testing`.
- What helped: existing whale profiles already carried current positions, so the fastest useful path was normalizing those profiles and rebuilding bucket aggregates on the existing positioning cycle.
- Friction or missing capability: local Browser Use surfaced an existing production hydration warning, and local whale data is empty until the whale indexer collects profiles/snapshots.
- Recommendation: next add a small seeded integration test for bucket aggregation and then run the whale indexer long enough to inspect real tracked trader pockets.

## 2026-05-02

- Request summary: make LFX chart wheel zoom anchor the y-axis to the cursor point.
- Skills used: `prompt-master`, `verification-gate`, `repo-execution`, `webapp-testing`.
- What helped: lightweight-charts exposes `coordinateToPrice` and price-scale `setVisibleRange`, which made the fix small and local to `PriceChart`.
- Friction or missing capability: Browser Use runtime bootstrapped, but the in-app browser pane was unavailable for final visual verification.
- Recommendation: rerun a manual scroll-zoom check in the app pane once Browser Use has an active pane again.

## 2026-05-02

- Request summary: revert the LFX chart y-axis wheel zoom behavior.
- Skills used: `coding-discipline`, `verification-gate`, `repo-execution`, `webapp-testing`.
- What helped: the previous zoom addition was isolated to `PriceChart`, so the revert stayed surgical.
- Friction or missing capability: Browser Use worked after bootstrapping from the known plugin path, but the production preview still reports unrelated console errors.
- Recommendation: keep the chart wheel behavior native unless we later add a dedicated zoom mode or modifier key.

## 2026-05-02

- Request summary: implement the no-vendor Hyperliquid Reaction Level Map from public market streams, OI changes, book depth, trade flow, and tracked-wallet samples.
- Skills used: `executing-plans`, `docker-compose-runtime-discovery`, `ui-ux-pro-max`, `holistic-linting`, `webapp-testing`, `browser-use:browser`.
- What helped: Docker Compose verification caught a strict-null issue and Browser Use confirmed the BTC detail panel uses cautious Reaction Map copy and the Book/Positioning/Stress controls.
- Friction or missing capability: Browser Use bootstrap needed a `nodeRepl.cwd` path fallback because `process` and `homeDir` were unavailable; the existing production runner image also needed source files copied in before `docker compose exec web npm run build` could pass.
- Recommendation: add a small scorer fixture test and a worker reconnect/retry hardening pass before expanding beyond the default BTC/ETH/SOL/HYPE assets.

## 2026-05-02

- Request summary: fix Reaction Map clustering so levels show farther shelves above and below spot instead of only nearby buckets.
- Skills used: `coding-discipline`, `verification-gate`, `webapp-testing`, `browser-use:browser`.
- What helped: comparing API output against stored book buckets showed the bug was both ingestion granularity and nearest-level display selection.
- Friction or missing capability: Browser Use still needs the Node REPL path fallback in this desktop session, but it verified the 1h chart after rebuild.
- Recommendation: add scorer fixtures that assert per-side spacing and deeper shelf selection for BTC-like books.

## 2026-05-03

- Request summary: add an OI Holding Reaction Map toggle without changing the database schema.
- Skills used: `brainstorming`, `coding-discipline`, `verification-gate`, `webapp-testing`, `browser-use:browser`.
- What helped: existing `reaction_trade_buckets` and `reaction_context_snapshots` already had enough data to compute top flow/OI holding buckets without a migration.
- Friction or missing capability: local 15m OI deltas can be tiny, so the UI now leads with flow concentration while showing inferred OI build as evidence.
- Recommendation: validate this on a longer live Neon-backed run before deciding whether to persist a dedicated `reaction_oi_holding_buckets` table.

## 2026-05-03

- Request summary: hide OI Holding when inferred levels are clustered around spot and avoid adding worker/runtime bloat.
- Skills used: `coding-discipline`, `verification-gate`, `webapp-testing`.
- What helped: keeping the fix inside `reactionLevels` and `PriceChart` made the behavior honest without changing the database or worker stack.
- Friction or missing capability: Docker Desktop initially was not reachable and the default web port was already occupied, so validation used the rebuilt Compose web container on port `3004`.
- Recommendation: keep OI Holding hidden until a longer-running production collector can prove useful, spaced holding zones.

## 2026-05-03

- Request summary: implement Neon exposure-zone and whale-performance refactor with top bull/bear zones, worker-owned persistence, dynamic cleanup, and production cleanup planning.
- Skills used: `prompt-master`, `brainstorming`, `planning-with-files`, `executing-plans`, `spin-up-agent-team`, `verification-gate`, `repo-execution`, `coding-discipline`, `docker-compose-runtime-discovery`, `backend-dev-guidelines`, `ui-ux-pro-max`, `webapp-testing`.
- What helped: the existing reaction worker and raw bucket tables were close enough that zone promotion could be added as a compact worker-owned layer without replacing the public-stream ingestion path.
- Friction or missing capability: Neon connector cleanup was blocked by reauthentication, Browser Use did not expose the required Node REPL runtime in this session, and the production web image does not include `scripts/public-smoke.mjs`.
- Recommendation: reauthenticate Neon, apply the temp-branch cleanup SQL, and add a container-visible API smoke script for future production-image checks.
