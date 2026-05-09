# Memory Index

| Date | Type | Title | Affected files | Why it matters | Detail |
|---|---|---|---|---|---|
| 2026-05-08 | finding | Hyperliquid data boundaries | `workers/reaction-map/index.mjs`, `src/lib/reactionLevels.ts` | Prevents overclaiming inferred OI as exact positions | `findings.md#2026-05-08---data-truth` |
| 2026-05-08 | finding | Current Reaction Map shape | `src/lib/reactionLevelStore.ts`, `src/components/PriceChart.tsx` | Confirms this is a contract + UI semantics redesign, not only a display bug | `findings.md#2026-05-08---current-implementation-shape` |
| 2026-05-08 | finding | Health shows one active OI zone despite fresh rows | `scripts/reaction-map-health.mjs` | Explains why the user sees one nearby zone without implying no market flow | `findings.md#2026-05-08---live-local-health` |
| 2026-05-08 | artifact | Baseline implementation plan | `.codex/task-memory/reaction-map-positioning-redesign/implementation_plan.md` | Main approved-plan candidate for future execution | `implementation_plan.md` |
| 2026-05-09 | implementation | Structured Reaction Map delivered | `src/lib/reactionLevels.ts`, `src/lib/reactionLevelStore.ts`, `src/components/reaction-map/`, `src/components/PriceChart.tsx`, `workers/reaction-map/index.mjs`, `scripts/reaction-map-health.mjs` | Ships separate real order-book shelves, inferred positioning, and reaction/context UI | `progress.md#2026-05-09-implementation` |
