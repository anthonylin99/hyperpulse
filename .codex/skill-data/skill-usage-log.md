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
