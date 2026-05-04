# Neon Table Retention Matrix

Use `neondb` on the Neon `production` branch as the only app database. Apply destructive cleanup only after the temp branch passes build, API smoke, and Reaction Map verification.

## Keep

| Table | Reason |
| --- | --- |
| `schema_migrations` | Migration history. Never drop. |
| `reaction_context_snapshots` | Short-lived worker context used for OI deltas and dynamic cleanup ranges. |
| `reaction_trade_buckets` | Short-lived compact trade buckets used to build exposure zones. |
| `reaction_orderbook_buckets` | Short-lived compact book buckets used to build exposure zones. |
| `reaction_exposure_zones_current` | Product truth for current BTC/ETH/SOL top bull and bear zones. |
| `reaction_exposure_zone_events` | Durable zone lifecycle memory. |
| `whale_wallets_current` | Durable current wallet performance profile. |
| `whale_wallet_asset_stats` | Durable wallet x asset performance summary. |
| `whale_positioning_current` | Latest-only whale positioning snapshot. |
| `whale_alert_events` | Durable meaningful whale alert events. |
| `whale_watchlist` | User/product state that should survive the refactor. |
| `whale_telegram_queue` | Notification delivery state; preserve until notification pipeline is retired. |
| `whale_worker_status` | Worker observability/state; safe and tiny. |

## Preserve For One Rollout

| Table | Reason |
| --- | --- |
| `whale_alerts` | Legacy feed reads still use this while `whale_alert_events` dual-write rolls out. |
| `whale_profiles_current` | Legacy profile reads still use this while `whale_wallets_current` dual-write rolls out. |
| `whale_trade_episodes` | Profile episode views may still read this. |
| `liq_heatmap_buckets` | Existing whale/positioning surface may still read it. |
| `positioning_alerts` | Existing positioning API may still read it. |
| `positioning_market_snapshots` | Existing positioning API may still read it. |
| `wallet_timing_scores` | Feeds pre-move hit-rate fields in whale profiles. |

## Disposable After Verification

| Table | Drop after | Reason |
| --- | --- | --- |
| `positioning_digest_runs` | Telegram/digest workflow is confirmed retired or migrated. | Digest history is not product truth for exposure zones. |
| `portfolio_tracked_wallets` | Current UI/API dependency check is clean. | Old portfolio sizing storage is outside the new product model. |
| `portfolio_trade_sizing_snapshots` | Current UI/API dependency check is clean. | Old sizing snapshots are not needed for exposure zones or whale performance. |
| `tracked_position_snapshots` | `whale_positioning_current` and `liq_heatmap_buckets` replacement reads are verified. | Raw-ish historical positioning snapshots are too heavy for the 0.5 GB target. |
| `research_daily_prices` | No route depends on `/api/research/daily-prices`. | Daily price cache is unrelated to this refactor. |

## Production Cleanup SQL

Run this only on a verified Neon temp branch first, then production after approval.

```sql
drop table if exists positioning_digest_runs cascade;
drop table if exists portfolio_tracked_wallets cascade;
drop table if exists portfolio_trade_sizing_snapshots cascade;
drop table if exists tracked_position_snapshots cascade;
drop table if exists research_daily_prices cascade;
```

The first production rollout should not drop legacy whale feed/profile tables. Drop them only after the API reads move fully to `whale_alert_events`, `whale_wallets_current`, `whale_wallet_asset_stats`, and `whale_positioning_current`.
