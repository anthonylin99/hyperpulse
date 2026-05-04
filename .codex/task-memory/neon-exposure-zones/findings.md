# Findings

- Current branch: `well-pressure`; `git pull --ff-only` reports already up to date.
- Worktree was dirty before implementation:
  - `.codex/skill-data/skill-usage-log.md`
  - `CHANGES.md`
  - `src/components/PriceChart.tsx`
  - `src/lib/reactionLevelStore.ts`
  - `src/lib/reactionLevels.ts`
  - untracked `.env` (not read)
- Docker Compose services discovered: `db`, `reaction-map`, `web`.
- Live Neon `neondb` currently has old whale/positioning tables and no reaction exposure-zone tables.
- Existing `reaction-map` worker already ingests `activeAssetCtx`, `l2Book`, wide `l2Book`, and `trades`.
- Existing `/api/market/reaction-levels` writes `reaction_level_snapshots` opportunistically through `reactionLevelStore`; this must become read-only for persistent exposure-zone writes.

## Retention Matrix

| Table | First-rollout decision | Reason |
| --- | --- | --- |
| `schema_migrations` | Preserve | Migration runner source of truth. |
| `market_*` | Preserve | Current/future market collector inputs. |
| `whale_watchlist` | Preserve | User/ops curated state. |
| `whale_telegram_queue` | Preserve for rollout | Notification dedupe/state until replacement proven. |
| `positioning_*` | Disposable after cutover | Old generated positioning snapshots/digests. |
| `whale_alerts` | Replace after cutover | Superseded by `whale_alert_events`; keep temporarily for rollback. |
| `whale_profiles_current` | Replace after cutover | Superseded by structured current whale tables. |
| `whale_trade_episodes` | Disposable after cutover | Old event/blob style history. |
| `portfolio_trade_sizing_snapshots` | Preserve until UI dependency check | Potential portfolio feature dependency. |
| `research_daily_prices` | Disposable after dependency check | Not part of exposure zones/whale-performance v1. |
| `tracked_position_snapshots` | Replace after cutover | Superseded by `whale_positioning_current`. |
| `liq_heatmap_buckets` | Preserve until pressure routes switched | Current pressure/heatmap fallback may still read it. |
| `wallet_timing_scores` | Replace/backfill later | Superseded by whale-performance stats, but may contain useful derived scores. |

## Neon Destructive Cleanup

Production table drops are intentionally deferred until a Neon temp branch migration validates schema, worker writes, API reads, and UI smoke. The implementation may stage DROP statements in a temp-branch migration, but production removal requires the validated migration promotion step.
