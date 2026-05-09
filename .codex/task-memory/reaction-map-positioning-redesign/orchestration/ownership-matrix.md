# Ownership Matrix

| Lane | Role | Owned files/directories | May read | Must not edit | Status |
|---|---|---|---|---|---|
| A | Data/Worker Owner | `workers/reaction-map/**`, `scripts/reaction-map-health.mjs`, `docker-compose.reaction-map.yml` | `src/lib/reactionLevelStore.ts`, `src/lib/reactionLevels.ts` | UI components | parallel-safe after contract locks |
| B | API/Model Owner | `src/lib/reactionLevels.ts`, `src/lib/reactionLevelStore.ts`, `src/types/index.ts` | worker and UI files | chart layout/CSS except adapters | serial first |
| C | UI Owner | `src/components/PriceChart.tsx`, `src/components/MarketTable.tsx`, optional `src/components/reaction-map/**` | API/model types | worker, migrations, deploy scripts | parallel-safe after contract locks |
| D | Trade Plan Owner | `src/lib/tradePlan.ts` | model and UI files | worker/storage | serial after role model |
| Integration | Integration Engineer | shared routes, package scripts, docs, final conflict fixes | all lanes | none after lane merge begins | integration-only |
