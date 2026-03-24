# HyperPulse Poke Holes — Round 2 (Post-Density Pass)

Date: 2026-03-24  
Owner: Nightly follow-up engineer

## Scope
This review assumes current production behavior and focuses on launch-risk issues that could surprise active Hyperliquid traders.

## What shipped in this pass
- Denser HL-style layout and controls (nav, funding strip, table, sidebar, drawer).
- Green/cyan visual language consistency (removed remaining blue accents in core trading UI).
- Existing trust work retained (sentiment scope label, portfolio naming clarity, activity coalescing).

## Findings (ordered by severity)

## Critical
1. Mainnet is hardcoded across clients and API routes
- Impact: Users can place live trades even if team expects testnet-safe behavior.
- Evidence:
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/lib/hyperliquid.ts` (line 9)
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/app/api/market/route.ts`
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/app/api/market/funding/route.ts`
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/app/api/market/candles/route.ts`
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/app/api/market/orderbook/route.ts`
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/app/api/spot/route.ts`
- Recommendation: centralize env-controlled network mode and hard-fail on mixed network config.

2. Mark price is overwritten with mid-price in websocket updates
- Impact: Trade sizing, liquidation estimate, and risk fields may drift from HL mark semantics.
- Evidence:
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/context/MarketContext.tsx` (line 245)
- Recommendation: update `midPx` only; keep `markPx` sourced from canonical market snapshot.

## High
3. Order size string uses `toPrecision(6)` before submit
- Impact: scientific notation or coarse rounding can cause reject/mis-size on thin or high-price assets.
- Evidence:
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/components/TradeDrawer.tsx` (line 162)
- Recommendation: format `sz` with asset-specific decimal rules and explicit fixed-point trimming.

4. Order book is snapshot polling (5s), not streaming depth
- Impact: stale top-of-book during volatility; displayed spread and expected execution can be misleading.
- Evidence:
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/components/TradeDrawer.tsx` (lines 74-97)
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/app/api/market/orderbook/route.ts`
- Recommendation: migrate drawer depth to websocket stream with stale-age indicator.

5. Agent/API key material still persists in `sessionStorage`
- Impact: XSS exposure remains non-trivial even with agent permissions.
- Evidence:
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/context/WalletContext.tsx` (lines 232-233, 314-315, 353-356)
- Recommendation: CSP hardening + memory-only mode toggle + optional re-auth timer.

6. Browser wallet connect does not enforce chain/network expectations
- Impact: user may sign on wrong chain context, causing confusing approval/connect failures.
- Evidence:
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/context/WalletContext.tsx` (lines 266-277)
- Recommendation: check chain id explicitly and prompt/attempt network switch before approval.

## Medium
7. Funding history polling cadence may be too aggressive at scale
- Impact: top-10 funding history refetch every market poll can inflate API load and increase latency risk.
- Evidence:
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/context/MarketContext.tsx` (lines 209-212, 221-224)
- Recommendation: add per-coin TTL cache and stagger refresh.

8. Liquidation estimate is intentionally rough but unlabeled as approximate
- Impact: users may infer precision and over-trust displayed liq levels.
- Evidence:
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/components/TradeDrawer.tsx` (lines 106-110)
- Recommendation: label as rough estimate and add tooltip explaining assumptions.

9. Compliance text is advisory only, no geofence/control checks
- Impact: regulatory UX risk if interpreted as sufficient control.
- Evidence:
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/components/TradeDrawer.tsx` (footer disclaimer)
  - `/Users/anthony_lin_99/Documents/New project/hyperpulse/src/components/WalletModal.tsx` (footer disclaimer)
- Recommendation: add hard gating strategy decision (policy + product + legal).

## Low
10. Density gains improve scan speed but may reduce readability on smaller displays
- Impact: text can become cramped for some users.
- Evidence: recent compact sizing in nav/table/drawer/sidebar components.
- Recommendation: add user preference toggle (`Comfortable` vs `Compact`) in settings.

## Suggested next sprint order
1. Network mode centralization and safety guardrails.
2. Mark-price correctness and order-size formatting hardening.
3. Wallet security improvements (storage strategy + chain checks).
4. Streaming order-book depth and stale-data UX.
5. Performance/caching pass for funding history requests.
