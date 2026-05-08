-- Keep the live Neon branch focused on Reaction Map current-state ingestion.
-- Older migrations created research, market-collector, portfolio, whale,
-- positioning, and legacy reaction snapshot tables that are not part of the
-- current OI Holding product path.

drop table if exists notification_queue cascade;
drop table if exists momentum_alert_events cascade;

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

drop table if exists portfolio_trade_sizing_snapshots cascade;
drop table if exists portfolio_tracked_wallets cascade;
drop table if exists research_daily_prices cascade;

drop table if exists feature_snapshots cascade;
drop table if exists level_observations cascade;
drop table if exists training_labels cascade;
drop table if exists model_predictions cascade;

drop table if exists market_funding_rates cascade;
drop table if exists market_context_snapshots cascade;
drop table if exists market_candles cascade;
drop table if exists market_assets cascade;

drop table if exists ingestion_checkpoints cascade;
drop table if exists worker_runs cascade;

drop table if exists reaction_level_snapshots cascade;
