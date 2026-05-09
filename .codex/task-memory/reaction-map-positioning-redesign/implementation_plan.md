# Reaction Map Positioning Redesign Implementation Plan

Date: 2026-05-08
Status: Baseline plan drafted, pending user approval before implementation

## Goal

Redesign HyperPulse Reaction Map so order-book liquidity, inferred OI positioning, and trade reaction context are separated clearly enough to help a retail Hyperliquid trader act, instead of showing one nearby red/green line that feels like an automatic no-trade warning.

## Product Contract

| Surface | Data truth | Promise | Must not claim |
|---|---|---|---|
| Order Book | Real Hyperliquid `l2Book` depth | Top 5 bid shelves and top 5 ask shelves when data is available | That resting liquidity will stay there |
| OI Positioning | Inferred from public trades plus total OI changes | Up to 5 buyer-initiated and up to 5 seller-initiated build zones per selected window | Exact global long/short position locations |
| Reaction Map | Confluence across book, flow, OI change, price behavior, and freshness | Where price may react and what confirms/invalidates the reaction | Standalone trade signals from OI alone |
| Trade Plan | Price behavior at/through zones | Trigger, invalidation, acceptance/rejection context | "Red above means never long" |

## Visual Target

```text
Markets / Asset Detail
--------------------------------------------------------------------------------
Price chart with Reaction Map overlays
  [Book] [Positioning] [Reaction]

Below/above chart overlay:
  - Book shelves use bid/ask language and location color.
  - Positioning zones use side/role color, not support/resistance color.
  - Reaction zones appear only when confluence passes the threshold.

Right or lower panel
--------------------------------------------------------------------------------
Order Book Shelves
Bid shelves                           Ask shelves
1. 79,000  $79.8M  stable             1. 81,000  $97.0M  refilled
2. 78,000  $78.2M  stable             2. 83,000  $57.1M  pulled
...

OI Positioning
Buyer-initiated builds                Seller-initiated builds
1. 79,600-79,750  Long defense        1. 80,050-80,250  Short defense
2. hidden: low confidence             2. hidden: stale
...

Selected zone read
Zone: Short defense at 80,050-80,250
Role: resistance unless accepted above
Long trigger: reclaim + hold above zone
Short invalidation: acceptance above zone
Confidence: medium; age: 14m; window: 1h
```

## Verified Data Boundaries

- Hyperliquid `l2Book` is a real book snapshot/feed and the HTTP snapshot returns up to 20 levels per side.
- Hyperliquid WebSocket `l2Book` includes bid/ask level arrays with price, size, and order count.
- Hyperliquid WebSocket `trades` includes public trade price, size, side, time, trade id, and buyer/seller users.
- Hyperliquid `activeAssetCtx` includes total `openInterest`, funding, mark price, mid price, and oracle price.
- Public trades do not directly expose whether a global trade opened a new long, closed a short, opened a short, or closed a long.
- User fill fields such as `dir` and `startPosition` are user-specific, not a global OI-at-price ladder.

References:
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions

## Current Local Evidence

- `workers/reaction-map/index.mjs` currently clusters public trade/book/context buckets into `reaction_exposure_zones_current`.
- `src/lib/reactionLevelStore.ts` reads current OI zones first, then merges raw stream book shelves into the payload.
- `src/lib/reactionLevels.ts` allows `MAX_OI_HOLDING_ZONES_PER_SIDE = 5`, but current serving data can still contain only one active zone.
- `src/components/PriceChart.tsx` splits visible levels by above/below current price, which still makes positioning zones feel like support/resistance.
- Local health check on 2026-05-08 showed fresh BTC/ETH/SOL stream rows but only one active OI zone per asset for the 15m serving window.

## Assumptions

- Keep the current no-vendor design. No Allium or paid position feed in this task.
- Keep the active production scope to BTC, ETH, and SOL unless the user approves wider asset coverage.
- Do not force five OI zones. Missing zones must be explained instead of manufactured.
- Keep existing Reaction Map database tables unless a migration is clearly required for durability, age tracking, or role classification.
- Use plain retail trader language. Avoid "calls", "puts", "gamma", and institutional jargon in UI.

## Work Slices

### 1. Lock The Data Contract

Type: AFK

Outcome: Shared types/API payload distinguish real book shelves from inferred positioning zones and confluence reaction zones.

Acceptance criteria:
- `/api/market/reaction-levels` exposes separate sections for `orderBook`, `positioning`, and `reactionZones` or equivalent backwards-compatible names.
- OI positioning payload includes `inferenceType`, `aggressorSkew`, `confidenceReason`, `ageMs`, `windowMs`, `role`, `hiddenReason`, and source caveat.
- Existing chart consumers continue to work during the transition.

Likely files:
- `src/types/index.ts`
- `src/lib/reactionLevels.ts`
- `src/lib/reactionLevelStore.ts`
- `src/app/api/market/reaction-levels/route.ts`

### 2. Make Order Book A Real 5x5 Shelf Product

Type: AFK

Outcome: Order Book view reliably shows top five bid shelves and top five ask shelves, sourced from real depth buckets, with stability metadata where available.

Acceptance criteria:
- BTC/ETH/SOL show up to 5 bid shelves and 5 ask shelves when enough book rows exist.
- Each shelf has price/range, side, notional, distance from mark, order count/sample count when available, and freshness.
- Empty or partial states explain data availability without implying no market flow.

Likely files:
- `workers/reaction-map/index.mjs`
- `src/lib/reactionLevelStore.ts`
- `src/lib/reactionLevels.ts`
- `src/components/PriceChart.tsx`

### 3. Reframe OI Holdings As Positioning

Type: AFK plus HITL copy review

Outcome: OI view becomes "Positioning" or "OI Positioning" and displays buyer-initiated/seller-initiated build zones with confidence, age, and current role.

Acceptance criteria:
- UI no longer labels inferred OI as exact "Long OI" / "Short OI" without caveat.
- Above/below price is secondary. Primary role uses positioning semantics:
  - buyer build below price: Long defense
  - buyer build above price: Trapped longs / breakeven supply
  - seller build above price: Short defense
  - seller build below price: Trapped shorts / squeeze fuel
  - OI decreased: Unwind zone, if implemented
- Missing zones show reason slots such as low confidence, stale, too close/noisy, or insufficient OI change.

Likely files:
- `src/lib/reactionLevels.ts`
- `src/lib/tradePlan.ts`
- `src/components/PriceChart.tsx`
- `src/components/MarketTable.tsx`

### 4. Add Multi-Window Positioning Context

Type: AFK, with HITL default-window decision

Outcome: Trader can distinguish immediate flow from larger trapped/defended areas.

Acceptance criteria:
- Positioning supports at least 15m, 1h, and 4h in the API and UI.
- 5m remains optional/scalper context; 24h can be planned but does not block initial release.
- Current selected chart interval and positioning window do not confuse one another.
- Wider windows reduce spot-hugging without hiding immediate 15m information.

Likely files:
- `workers/reaction-map/index.mjs`
- `docker-compose.reaction-map.yml`
- `src/app/api/market/reaction-levels/route.ts`
- `src/components/PriceChart.tsx`

### 5. Build Reaction Zones From Confluence

Type: AFK, serial after slices 1-4

Outcome: Reaction Map promotes zones only when multiple evidence sources overlap.

Acceptance criteria:
- Reaction zone scoring requires some combination of positioning, book shelf, recent volume node, price reaction, and freshness.
- OI alone can inform a selected-zone read but cannot become a high-confidence trade zone by itself.
- Trade plan copy describes behavior at the zone: reject, accept, reclaim, lose, retest.

Likely files:
- `src/lib/reactionLevels.ts`
- `src/lib/tradePlan.ts`
- `src/components/PriceChart.tsx`

### 6. Redesign The Chart/Panel UX

Type: HITL for visual acceptance, AFK implementation after approval

Outcome: User can tell at a glance whether they are looking at liquidity, positioning, or trade context.

Acceptance criteria:
- No single red/green OI line is presented as a standalone "do not trade" signal.
- Chart overlay uses distinct visual language:
  - Book: bid/ask shelves
  - Positioning: buyer/seller build roles
  - Reaction: accepted/rejected fight zones
- Selected zone panel includes trigger/invalidation text only when data supports it.
- UI copy passes the "would a smart user learn anything new?" test.

Likely files:
- `src/components/PriceChart.tsx`
- `src/components/MarketTable.tsx`
- `src/app/globals.css`
- Possibly new focused components under `src/components/reaction-map/`

### 7. Add Regression Seams And Health Checks

Type: AFK

Outcome: The behavior can be validated without relying only on browser impressions.

Acceptance criteria:
- Unit or script-level checks cover role classification:
  - buyer build below/above
  - seller build below/above
  - stale/hidden zone reasons
  - book 5x5 shelf selection
- `npm run reaction:health` or a companion check reports active positioning counts per side/window and order-book shelf counts.
- Browser check verifies BTC, ETH, SOL in Order Book and Positioning modes.

Likely files:
- `scripts/reaction-map-health.mjs`
- `src/lib/reactionLevels.ts`
- `package.json`
- test files if the repo test harness is added or already available

## Delivery Roles

| Role | Owner | Responsibility | Output |
|---|---|---|---|
| Architect / Tech Lead | Current agent | Plan, contracts, lane boundaries, verification gates | Approved plan |
| Data/Worker Owner | Pending | Worker bucket selection, windows, persistence, health metrics | Worker/API-ready data |
| API/Model Owner | Pending | Payload contract, scoring, role classification | Typed reaction model |
| UI Owner | Pending | Chart tabs, panels, visual role language, copy cleanup | Usable market UI |
| Integration Engineer | Pending | Shared files, merge order, Docker/browser validation | Integrated branch |
| Review Engineer | Pending | Final bug/regression review | Findings or approval |
| Human Approver | User | Product semantics and merge/release decision | Approval after visual proof |

## File Ownership Matrix

| Lane | Role | Owned files/directories | May read | Must not edit | Status |
|---|---|---|---|---|---|
| A | Data/Worker Owner | `workers/reaction-map/**`, `scripts/reaction-map-health.mjs`, `docker-compose.reaction-map.yml` | `src/lib/reactionLevelStore.ts`, migrations | UI components | parallel-safe after contract locks |
| B | API/Model Owner | `src/lib/reactionLevels.ts`, `src/lib/reactionLevelStore.ts`, `src/types/index.ts` | worker and UI files | chart layout/CSS except contract adapters | serial first |
| C | UI Owner | `src/components/PriceChart.tsx`, `src/components/MarketTable.tsx`, optional `src/components/reaction-map/**` | API/model types | worker, migrations, deploy scripts | parallel-safe after contract locks |
| D | Trade Plan Owner | `src/lib/tradePlan.ts` | model and UI files | worker/storage | serial after roles defined |
| Integration | Integration Engineer | shared routes, package scripts, docs, final conflict fixes | all lanes | none after lane merge begins | integration-only |

## Integration Order

1. Approve product vocabulary and default windows.
2. Lock the payload/type contract with backwards compatibility.
3. Land order-book 5x5 selection and health count reporting.
4. Land positioning role classification and hidden-slot reasons.
5. Land chart/panel UX against the new contract.
6. Land confluence-only Reaction zone scoring.
7. Run container build, lint/build, API smoke, health script, recent logs, and browser verification.
8. Final review against product contract and docs.

## Verification Plan

All commands run inside Docker Compose where applicable.

Commands:
- `docker compose ps --services`
- `docker compose exec web npm run lint`
- `docker compose exec web npm run build`
- `docker compose exec web npm run reaction:health`
- `docker compose logs --tail 120 web`
- If worker changes are included: `docker compose -f docker-compose.reaction-map.yml config --services`
- If local worker is available: `docker compose -f docker-compose.reaction-map.yml logs --tail 120 reaction-map`

API smoke:
- `/api/market/reaction-levels?coin=BTC&window=15m`
- `/api/market/reaction-levels?coin=BTC&window=1h`
- same for ETH and SOL
- Confirm order-book shelf counts and positioning zone counts separately.

Browser verification:
- Open `/markets?asset=BTC`, `/markets?asset=ETH`, `/markets?asset=SOL`.
- Verify Order Book mode shows bid/ask shelves, not OI copy.
- Verify Positioning mode shows buyer/seller roles, confidence, age, and missing-slot reasons.
- Verify selected zone panel explains acceptance/rejection without implying automatic no-trade.
- Verify mobile/narrow layout does not overlap chart, panel, or tooltip text.

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| OI positioning still hugs spot on short windows | User feels no new edge | Add multi-window view and missing-zone explanations |
| UI overclaims inferred data | Trust damage | Use buyer/seller-initiated wording and exact-position caveat everywhere |
| Forced five OI zones creates noise | Bad trade decisions | Show up to five and explain hidden slots |
| Shared chart/model files create conflicts | Slower integration | Lock contract first, keep UI and worker lanes disjoint |
| External worker not redeployed | Frontend stale or old semantics | Verification must include health age and worker deploy notes |
| Browser-only verification misses scoring regressions | Future drift | Add script or test seam for role and shelf selection |

## Approval Questions Before Implementation

1. Should the UI tab be named `Positioning`, `OI Positioning`, or keep `OI Holding` with stricter copy?
2. Should the first release support `15m + 1h + 4h`, or include `24h` immediately?
3. Should the chart default to `Reaction` mode, or keep the current combined view with clearer tabs?
