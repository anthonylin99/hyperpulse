# Neon Table Retention Matrix

Use `neondb` on the Neon `production` branch as the only app database. Apply destructive cleanup only after the temp branch passes build, API smoke, and Reaction Map verification.

## Current Worker-Only Target

For a Reaction Map-only deployment, the app does not need the legacy whale, Telegram, digest, alert, portfolio sizing, or research tables. Keep only the tables that either serve Reaction Map directly or preserve migration history.

| Table | Keep? | Reason |
| --- | --- | --- |
| `schema_migrations` | Yes | Migration history. Never drop. |
| `reaction_context_snapshots` | Yes | Worker context for OI deltas, current price, and cleanup ranges. |
| `reaction_trade_buckets` | Yes | Compact public trade flow used to rank inferred holding zones. |
| `reaction_orderbook_buckets` | Yes | Compact book shelves used for the Order Book overlay. |
| `reaction_exposure_zones_current` | Yes | Serving table for current BTC/ETH/SOL bull and bear OI zones. |
| `reaction_exposure_zone_events` | Yes | Durable zone lifecycle memory for rank/status changes. |
| `reaction_level_snapshots` | No | Legacy aggregate snapshots. Current API reads worker current zones and compact buckets instead. |

## Production Snapshot

Read-only Neon audit from the worker container on 2026-05-04:

| Group | Tables | Current read |
| --- | --- | --- |
| Reaction serving path | `reaction_context_snapshots`, `reaction_trade_buckets`, `reaction_orderbook_buckets`, `reaction_exposure_zones_current`, `reaction_exposure_zone_events` | Keep. |
| Reaction legacy | `reaction_level_snapshots` | Not used by current API path; safe candidate after verification. |
| Whale/feed legacy | `whale_alerts`, `whale_profiles_current`, `whale_trade_episodes`, `whale_telegram_queue`, `whale_worker_status`, `wallet_timing_scores`, `whale_alert_events`, `whale_wallets_current`, `whale_wallet_asset_stats`, `whale_positioning_current`, `whale_watchlist` | Historical only. The active app redirects whale routes and no longer runs the whale indexer. |
| Positioning/telegram legacy | `positioning_alerts`, `positioning_market_snapshots`, `positioning_digest_runs`, `tracked_position_snapshots`, `liq_heatmap_buckets` | Not needed for Reaction Map-only worker. Some legacy routes/scripts still reference them if those surfaces remain enabled. |

Active 15m current-zone rows during the audit:

| Asset | Active zones |
| --- | --- |
| BTC | 1 bull, 1 bear |
| ETH | 1 bull, 1 bear |
| SOL | 1 bear |

This is expected with the current compact product model: the worker stores up to five bull zones and five bear zones per asset/window, not exactly five. If only one side has enough clustered flow near the current market, fewer rows are stored.

## Drop Candidates For Reaction-Only Mode

This cleanup is now encoded as `migrations/0007_reaction_only_cleanup.sql`. Run it only after the Reaction Map API and worker have been verified against the target branch.

```sql
drop table if exists positioning_alerts cascade;
drop table if exists positioning_digest_runs cascade;
drop table if exists positioning_market_snapshots cascade;
drop table if exists tracked_position_snapshots cascade;
drop table if exists liq_heatmap_buckets cascade;
drop table if exists wallet_timing_scores cascade;
drop table if exists whale_alert_events cascade;
drop table if exists whale_alerts cascade;
drop table if exists whale_positioning_current cascade;
drop table if exists whale_profiles_current cascade;
drop table if exists whale_telegram_queue cascade;
drop table if exists whale_trade_episodes cascade;
drop table if exists whale_wallet_asset_stats cascade;
drop table if exists whale_wallets_current cascade;
drop table if exists whale_watchlist cascade;
drop table if exists whale_worker_status cascade;
drop table if exists reaction_level_snapshots cascade;
```

Before production cleanup, verify these two things on the temp branch:

1. `/api/market/reaction-levels?coin=BTC&window=15m` returns current zones and book levels.
2. The worker can run one flush cycle and write to `reaction_context_snapshots`, `reaction_trade_buckets`, `reaction_orderbook_buckets`, `reaction_exposure_zones_current`, and `reaction_exposure_zone_events`.

## Cleanup Applied

On 2026-05-05, the legacy drop list above was applied to the current Neon database after an explicit confirmation. Neon branch tooling was not available in the local session, so the SQL was first tested in a production transaction and rolled back, then applied in a committed transaction.

The first cleanup revealed two code paths that could keep the DB from staying clean:

- The retired whale store used to open the DB and recreate whale/positioning tables. It is no longer imported by the active web/runtime path.
- The reaction worker retention sweep still deleted from legacy `reaction_level_snapshots`. That sweep dependency was removed.

Remaining user tables after cleanup:

| Table |
| --- |
| `reaction_context_snapshots` |
| `reaction_exposure_zone_events` |
| `reaction_exposure_zones_current` |
| `reaction_orderbook_buckets` |
| `reaction_trade_buckets` |

`schema_migrations` was listed as a keep table in the retention model, but it was not present as a user table in this Neon database at cleanup time.

## Re-Creation Guard

If non-Reaction tables reappear, the usual cause is an older deployed worker or app route still running schema-creating code. The repository now gates those writers behind explicit env flags:

| Surface | Re-enable flag |
| --- | --- |
| Momentum alert worker/store | `ENABLE_MOMENTUM_ALERTS=true` |
| Market collector | `ENABLE_MARKET_COLLECTOR=true` |
| Research/portfolio store schema writes | `ENABLE_RESEARCH_STORE_WRITES=true` |
| Portfolio sizing capture script | `ENABLE_PORTFOLIO_CAPTURE=true` |

Use `npm run reaction:health` from a container with Neon env access to verify only the Reaction Map tables remain and BTC/ETH/SOL level refresh ages stay fresh.
