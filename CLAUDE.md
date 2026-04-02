# CLAUDE.md — HyperPulse Developer Guide

HyperPulse is a portfolio analytics and trade review dashboard for **Hyperliquid perps traders**. It's a self-reflection tool for retail traders — not institutional/tradfi. Avoid jargon, acronyms, and metrics that don't map to what retail traders actually think about.

**Live**: https://hyperpulse-gold.vercel.app
**Repo**: https://github.com/anthonylin99/hyperpulse
**Vercel project**: `hyperpulse` under team `anthony-lins-projects-b27963d8`

---

## Quick Start

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build (always run before committing)
npm run lint    # ESLint
```

No `.env` file needed. All data comes from Hyperliquid's public on-chain API via `@nktkas/hyperliquid` SDK — no API keys, no secrets, no database.

---

## Architecture Overview

### Stack
- **Framework**: Next.js 14 (App Router) with React 18
- **Styling**: Tailwind CSS 3.4 — zinc-950 base, teal-500/600 accents, emerald-400 (profit), red-400 (loss)
- **Charts**: Recharts (portfolio analytics), lightweight-charts (market price charts)
- **Hyperliquid SDK**: `@nktkas/hyperliquid` v0.32.1 — used server-side in API routes and client-side in WalletContext
- **Wallet**: `viem` for browser wallet integration, private key accounts for API wallet mode
- **Notifications**: `react-hot-toast`
- **Icons**: `lucide-react`
- **Fonts**: Geist Sans + Geist Mono (local)

### Data Flow

```
Hyperliquid L1 (on-chain)
        │
        ▼
Next.js API Routes (server-side SDK)
        │
        ▼
React Contexts (client-side state)
        │
        ▼
Components (render)
```

1. **API Routes** (`src/app/api/`) — Server-side proxies to Hyperliquid SDK. Each creates its own `HttpTransport` + `InfoClient`. All are `force-dynamic`.
2. **Contexts** — Three providers wrap the app (in `layout.tsx`): `MarketProvider` > `WalletProvider` > `PortfolioProvider`.
3. **Components** — Pure presentation. Pull data from contexts via hooks.

### No Auth, No Database
- Wallet connection via browser wallet (MetaMask/Rabby) or API private key
- All state in React contexts + `localStorage` + `sessionStorage`
- Read-only mode: just enter any wallet address to view analytics

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── market/           # Market-wide data
│   │   │   ├── route.ts          # All perps metadata + market data
│   │   │   ├── candles/route.ts  # OHLCV candle data
│   │   │   ├── funding/route.ts  # Funding rate history
│   │   │   └── orderbook/route.ts
│   │   ├── spot/route.ts     # Spot market data
│   │   └── user/             # Per-user data
│   │       ├── fills/route.ts    # Trade fill history (userFillsByTime)
│   │       ├── funding/route.ts  # Funding payments received/paid
│   │       ├── ledger/route.ts   # Deposits, withdrawals, transfers (userNonFundingLedgerUpdates)
│   │       ├── state/route.ts    # Clearinghouse state (balances, positions)
│   │       └── candles/route.ts  # Per-user candle data
│   ├── layout.tsx            # Root layout — providers, fonts, metadata
│   ├── page.tsx              # Main page — tab switching (Portfolio / Markets)
│   ├── globals.css           # Tailwind + skeleton animations + dashboard grid
│   ├── icon.svg              # Favicon (teal pulse icon)
│   └── fonts/                # Geist font files
│
├── components/
│   ├── portfolio/            # Portfolio tab (16 components)
│   │   ├── ConnectPrompt.tsx     # Landing page — connect wallet
│   │   ├── DashboardHeader.tsx   # Equity display, wallet switcher, refresh button
│   │   ├── PositionsTable.tsx    # Live open positions (from WalletContext)
│   │   ├── RiskStrip.tsx         # 5 risk metric cards (margin, leverage, liq distance)
│   │   ├── StatsGrid.tsx         # 12 performance stat cards
│   │   ├── EquityCurve.tsx       # Equity + drawdown chart (Recharts)
│   │   ├── PnLWaterfall.tsx      # Per-trade P&L waterfall chart
│   │   ├── BenchmarkPanel.tsx    # Performance vs BTC/ETH benchmark
│   │   ├── Recommendations.tsx   # Dynamic action plan based on stats
│   │   ├── PerformanceHeatmap.tsx # Hour-of-day / day-of-week P&L heatmap
│   │   ├── AssetBreakdown.tsx    # P&L by asset (clickable for detail)
│   │   ├── AssetDetailModal.tsx  # Per-coin trade detail modal
│   │   ├── MonthlyPnL.tsx        # Monthly performance cards
│   │   ├── FundingAnalysis.tsx   # Funding paid vs earned (collapsible per-coin)
│   │   ├── InsightsPanel.tsx     # Auto-generated trading insights
│   │   └── TradeJournal.tsx      # Full trade log (sortable, filterable, notes, CSV export)
│   │
│   ├── Nav.tsx               # Top navigation bar
│   ├── MarketTable.tsx       # Markets tab — sortable asset table
│   ├── FundingFlashcards.tsx # Markets tab — top funding rates
│   ├── ActivityFeed.tsx      # Markets tab — liquidations, whale trades
│   ├── PortfolioPanel.tsx    # Markets tab — sidebar portfolio summary
│   ├── TradeDrawer.tsx       # Slide-out trade execution panel
│   ├── PriceChart.tsx        # TradingView-style price chart (lightweight-charts)
│   ├── AssetDetail.tsx       # Market detail view for selected asset
│   ├── WalletConnect.tsx     # Wallet connection UI
│   └── WalletModal.tsx       # Modal wrapper for wallet connect
│
├── context/
│   ├── WalletContext.tsx      # Wallet state, account polling (15s), positions
│   ├── PortfolioContext.tsx   # Trade history, analytics computation, caching
│   └── MarketContext.tsx      # Market data, WebSocket subscriptions
│
├── lib/
│   ├── analytics.ts          # Core: groupFillsIntoTrades, computePortfolioStats, etc.
│   ├── insights.ts           # Auto-generated insights from stats
│   ├── format.ts             # formatUSD, formatPct, truncateAddress, cn()
│   ├── constants.ts          # Asset categories, poll intervals, color tokens
│   ├── hyperliquid.ts        # Shared SDK client instances (server-side)
│   ├── savedWallets.ts       # localStorage CRUD for saved wallet addresses
│   ├── tradeNotes.ts         # localStorage CRUD for trade journal notes
│   ├── order.ts              # Order placement helpers
│   ├── signals.ts            # Market signal computation
│   ├── fundingRegime.ts      # Funding rate regime classification
│   └── proprietaryIndex.ts   # Custom market index calculation
│
└── types/
    └── index.ts              # All TypeScript interfaces
```

---

## Key Contexts (How State Works)

### WalletContext (`src/context/WalletContext.tsx`)
- **Purpose**: Wallet connection + live account state
- **Polling**: `clearinghouseState` + `spotClearinghouseState` every 15 seconds (`POLL_INTERVAL_PORTFOLIO`)
- **State**: `address`, `apiAddress`, `isReadOnly`, `accountState` (positions, equity, margin), `exchangeClient`
- **Connection modes**:
  1. **API Wallet**: Private key + main address (stored in `sessionStorage`)
  2. **Browser Wallet**: MetaMask/Rabby/Coinbase — generates ephemeral agent key, approved on-chain
  3. **Read-Only**: Just an address — no trading, just analytics
- **Key pattern**: `parsePositions()` derives `markPx` from `entryPx + unrealizedPnl/szi` (Hyperliquid API doesn't return mark price directly in clearinghouse state)
- **Buying power**: `crossAccountValue - crossMarginUsed` (matches Hyperliquid UI "Available Balance")
- **Account value**: `marginSummary.accountValue` (cross + isolated perps) + `spotUsdcTotal`

### PortfolioContext (`src/context/PortfolioContext.tsx`)
- **Purpose**: Historical trade analytics (computed once on connect, cached)
- **Data pipeline**:
  1. Fetch all-time fills (`/api/user/fills?startTime=0&aggregateByTime=true`)
  2. Fetch all-time funding (`/api/user/funding?startTime=0`)
  3. Fetch deposit/withdrawal ledger (`/api/user/ledger?startTime=0`)
  4. `groupFillsIntoTrades()` → round-trip trades from raw fills
  5. `mergeFundingIntoTrades()` → attach funding costs to trades
  6. `computePortfolioStats()` → 25+ metrics (win rate, Sharpe, drawdown, etc.)
  7. `computeEquityCurve()`, `computeByAsset()`, `computeByTimeOfDay()`, `computeByDayOfWeek()`
  8. `generateInsights()` → automated trading advice
- **Caching**: Results cached in `localStorage` as `hp_cache_{address}` — restored instantly on revisit
- **Auto-refresh**: Every 12 hours via `setInterval`, plus manual refresh button in DashboardHeader
- **Loading strategy**: Full skeleton only on first fetch (`hasFetchedRef`). Subsequent refreshes are silent — no UI flash.
- **Starting balance**: Derived from ledger deposits/withdrawals. Falls back to `accountValue - totalPnl` estimation.

### MarketContext (`src/context/MarketContext.tsx`)
- **Purpose**: Real-time market data for the Markets tab
- **Polling**: Market metadata every 30s (`POLL_INTERVAL_MARKET`)
- **WebSocket**: Subscription client for real-time price updates

---

## Analytics Engine (`src/lib/analytics.ts`)

### `groupFillsIntoTrades(fills: Fill[]): RoundTripTrade[]`
Groups raw fills into round-trip trades. Uses Hyperliquid's `dir` field ("Open Long", "Close Long", etc.) to track position open/close. Accumulates fills per coin until position size reaches 0.

### `mergeFundingIntoTrades(trades, funding): RoundTripTrade[]`
Assigns funding payments to the trade that was open during that time window.

### `computePortfolioStats(trades, funding, startBal): PortfolioStats`
Computes 25+ metrics including:
- Win rate, profit factor, payoff ratio
- Sharpe ratio, Sortino ratio, Calmar ratio
- Max drawdown (% and period)
- Expectancy, Kelly Criterion
- Longest win/loss streaks
- Average trade duration (winners vs losers)

### `computeEquityCurve(trades, startBal): EquityPoint[]`
Running equity and drawdown from peak, used by the EquityCurve chart.

### `computeByAsset / computeByTimeOfDay / computeByDayOfWeek`
Breakdown aggregations for heatmaps and asset analysis.

---

## localStorage Keys

| Key | Purpose |
|-----|---------|
| `hp_saved_wallets` | Array of saved wallet addresses + nicknames |
| `hp_cache_{address}` | Cached fills + funding data for instant load |
| `hp_notes_{address}` | Trade journal notes (per-trade, keyed by trade ID) |

## sessionStorage Keys

| Key | Purpose |
|-----|---------|
| `hp_api_key` | API wallet private key (current session only) |
| `hp_main_address` | Main wallet address (current session only) |

---

## API Routes Reference

All routes are `GET` with query parameters. All use `@nktkas/hyperliquid` SDK server-side.

| Route | Params | SDK Method | Notes |
|-------|--------|------------|-------|
| `/api/user/fills` | `address`, `startTime?`, `aggregateByTime?` | `userFillsByTime` / `userFills` | All-time trade history |
| `/api/user/funding` | `address`, `startTime?` | `userFunding` | Funding payments |
| `/api/user/ledger` | `address`, `startTime?`, `endTime?` | `userNonFundingLedgerUpdates` | Deposits, withdrawals, transfers |
| `/api/user/state` | `address` | `clearinghouseState` | Current positions + margin |
| `/api/user/candles` | `coin`, `interval`, `startTime?`, `endTime?` | `candleSnapshot` | Price history |
| `/api/market` | — | `meta`, `metaAndAssetCtxs`, `allMids` | All perps metadata |
| `/api/market/candles` | `coin`, `interval`, `startTime?`, `endTime?` | `candleSnapshot` | Market candles |
| `/api/market/funding` | `coin`, `startTime?`, `endTime?` | `fundingHistory` | Funding rate history |
| `/api/market/orderbook` | `coin` | `l2Book` | Order book |
| `/api/spot` | — | `spotMeta`, `spotMetaAndAssetCtxs` | Spot market data |

---

## Page Layout (Portfolio Tab)

When connected with trades:
```
DashboardHeader     — equity, wallet switcher, refresh/disconnect buttons
PositionsTable      — live open positions (from WalletContext, updates every 15s)
RiskStrip           — margin %, buying power, avg leverage, nearest liq, position count
StatsGrid           — 12 performance cards
EquityCurve         — equity + drawdown chart
PnLWaterfall | BenchmarkPanel   — 2-column
Recommendations     — dynamic action plan
PerformanceHeatmap | AssetBreakdown  — 2-column
MonthlyPnL          — monthly performance cards
FundingAnalysis | InsightsPanel  — 2-column
TradeJournal        — full trade log with notes
```

---

## Design Principles

1. **Retail trader language**: No "1R", no "Kelly Criterion" in UI text. Use plain English. "Your average winner is 2x your average loser" not "Payoff ratio: 2.0".
2. **Hyperliquid-accurate**: Only reference features Hyperliquid actually supports. No trailing stop-losses. Available balance = `crossAccountValue - crossMarginUsed`.
3. **No UI flash**: Use `useRef` for values that change frequently but shouldn't trigger re-renders. Loading spinners only on first fetch.
4. **Color coding**: Profit = `text-emerald-400`, Loss = `text-red-400`. Always. No exceptions.
5. **Skeleton loading**: Use the `.skeleton` CSS class in `globals.css` for loading placeholders. Show when `loading && trades.length === 0`.
6. **Dynamic, not hardcoded**: All recommendations, insights, and stats are computed from the connected wallet's actual data.

---

## Common Pitfalls & Lessons Learned

### Hyperliquid API Quirks
- **`clearinghouseState`** returns `crossMarginSummary` (cross only) AND `marginSummary` (cross + isolated). Use `marginSummary.accountValue` for total perps equity.
- **Mark price** is NOT in clearinghouse state. Derive it: `entryPx + (unrealizedPnl / abs(szi))` for longs, `entryPx - (unrealizedPnl / abs(szi))` for shorts.
- **Ledger `delta`** is a discriminated union — check `delta.type` ("deposit", "withdraw", "internalTransfer", "send") before reading `delta.usdc`.
- **`userFillsByTime`** with `startTime=0` returns all-time history. This can be large for active traders.
- **Funding entries** have `usdc` field where negative = paid out by trader, positive = received.

### React Patterns Used
- **`useRef` for frequently-changing values**: `accountValueRef` in PortfolioContext prevents `fetchData` from re-triggering every 15s when wallet polls.
- **`hasFetchedRef`**: Prevents loading flash on silent background refreshes.
- **CSS `:has()` selector**: `body:has(.dashboard-grid) { overflow: hidden; }` — only locks scroll on Markets tab grid layout, Portfolio tab scrolls normally.

### Build & Deploy
- Always `npm run build` before committing — catches TypeScript errors and unused imports that `npm run dev` silently ignores.
- Deploy is automatic via Vercel on push to `main`.
- The ESLint warning about `PositionsTable.tsx` exhaustive-deps is known and intentional (positions array reference from wallet context).

---

## Trade Journal Features

- **Sortable columns**: Click column headers to sort
- **Filters**: All / Winners / Losers buttons + per-coin dropdown
- **Notes**: Click pencil icon on any trade to add a personal note (saved to localStorage). Teal dot indicates trades with notes.
- **CSV Export**: Includes all trade data + notes. Proper escaping for commas/quotes in note text.
- **Summary footer**: Total P&L, avg P&L, total fees, total volume — updates with active filters.

---

## Wallet Switcher

Users can save multiple wallet addresses (localStorage `hp_saved_wallets`). Each wallet gets:
- Auto-generated nickname ("Wallet 1", "Wallet 2")
- Rename capability
- Quick-switch dropdown in DashboardHeader
- `lastUsed` timestamp tracking

When switching wallets, the app calls `connectReadOnly()` which re-fetches all data for the new address.

---

## What's NOT Here (Intentionally)

- **No database**: All data is on-chain via Hyperliquid API
- **No authentication**: Wallet address IS the identity
- **No server-side state**: API routes are pure proxies
- **No environment variables**: Everything uses public Hyperliquid endpoints
- **No trailing stop-losses**: Hyperliquid doesn't support them — don't reference them in recommendations
- **No auto-publish or push**: Never push to remote or deploy without explicit user confirmation

---

## Local Dev Workflow (What to Do Each Time)

1. `npm install` (only when deps change)
2. `npm run dev`
3. Connect a wallet address (read-only is safest for testing)
4. Verify the three main states:
   - No wallet connected (landing screen)
   - Read-only wallet connected (full analytics + no trading)
   - Live wallet connected (trade drawer enabled)
5. `npm run build` before any commit — catches type errors and unused imports

If anything breaks, see **Troubleshooting** below.

---

## Key Files You’ll Touch Most

**Context / data**
- `/Users/anthony_lin_99/code/hyperpulse/src/context/WalletContext.tsx`
- `/Users/anthony_lin_99/code/hyperpulse/src/context/PortfolioContext.tsx`
- `/Users/anthony_lin_99/code/hyperpulse/src/context/MarketContext.tsx`

**Analytics**
- `/Users/anthony_lin_99/code/hyperpulse/src/lib/analytics.ts`
- `/Users/anthony_lin_99/code/hyperpulse/src/lib/insights.ts`
- `/Users/anthony_lin_99/code/hyperpulse/src/lib/format.ts`

**UI (Portfolio tab)**
- `/Users/anthony_lin_99/code/hyperpulse/src/components/portfolio/StatsGrid.tsx`
- `/Users/anthony_lin_99/code/hyperpulse/src/components/portfolio/EquityCurve.tsx`
- `/Users/anthony_lin_99/code/hyperpulse/src/components/portfolio/TradeJournal.tsx`

**Markets tab**
- `/Users/anthony_lin_99/code/hyperpulse/src/components/MarketTable.tsx`
- `/Users/anthony_lin_99/code/hyperpulse/src/components/PriceChart.tsx`
- `/Users/anthony_lin_99/code/hyperpulse/src/components/TradeDrawer.tsx`

---

## Definitions (So You Don’t Change the Meaning)

These are the canonical interpretations used in analytics and UI:

- **Account value**: `marginSummary.accountValue + spotUsdcTotal`
- **Available balance**: `crossAccountValue - crossMarginUsed`
- **Win rate**: % of round‑trip trades with positive PnL (after fees + funding)
- **Payoff ratio**: Avg winner PnL / Avg loser absolute PnL
- **Profit factor**: Gross profits / Gross losses
- **Max drawdown**: Peak‑to‑trough % of equity curve, based on realized + funding PnL
- **Expectancy**: (Win rate × Avg winner) − (Loss rate × Avg loser)
- **Funding cost**: Sum of funding entries during the trade window (negative means paid)

If you modify these definitions, also update UI labels, tooltips, and insights logic so they stay consistent.

---

## Caching & Performance

- **Initial load**: All historical data fetched once per wallet. This is the slowest step.
- **Cache**: `localStorage["hp_cache_{address}"]` stores fills + funding to avoid re-fetch on revisit.
- **Refresh**: Every 12 hours automatically + manual refresh button.
- **No flashing**: Use `hasFetchedRef` to avoid showing skeletons after the first load.
- **Large history**: Heavy traders can have thousands of fills. Avoid N² loops in analytics.

If you add new cached fields, version the cache key to avoid breaking old data (`hp_cache_v2_{address}`).

---

## Testing & Validation (Manual)

There are no automated tests yet. Use these manual checks:

1. **Fresh wallet** (no history): Stats should show zeros and not crash.
2. **Heavy wallet** (large history): Load time still reasonable, charts render.
3. **Funding-heavy trader**: Funding analysis and net PnL still correct.
4. **Spot-only wallet**: Should not break perps views; positions table empty.
5. **Wallet switch**: Switching wallets updates *all* panels and clears old data.

If you add new analytics, validate it on at least two wallets with different behaviors.

---

## Troubleshooting

**Build fails on `next build` but dev works**
- This is common; production build is stricter. Fix TypeScript + lint errors.

**Trade counts differ from Hyperliquid UI**
- Check `groupFillsIntoTrades()` logic. Hyperliquid treats partial closes as separate "round trips" sometimes.

**Weird mark price / liquidation distance**
- Ensure `markPx` is derived from `entryPx` and `unrealizedPnl`. Hyperliquid doesn’t send mark directly.

**Funding analysis empty**
- Make sure `/api/user/funding` is being called with correct `address`.

**No data on refresh**
- Check `localStorage` for corrupt cache. Delete `hp_cache_{address}` and reload.

---

## Conventions & Style

- **UI copy**: Short, direct, no trading jargon. Write like you’re explaining to a smart retail trader.
- **Colors**: Profit always emerald, loss always red.
- **Numbers**: Use `formatUSD` and `formatPct` from `/Users/anthony_lin_99/code/hyperpulse/src/lib/format.ts`.
- **Components**: Keep pure. Contexts handle data, components render.
- **State**: Avoid prop-drilling; use contexts.
- **Performance**: Prefer memoized arrays + derived data to avoid rerenders.

---

## Roadmap (Short / Medium / Long Term)

**Short term**
- Improve data accuracy around partial fills and fee attribution
- Add tooltips to explain each risk metric in plain English

**Medium term**
- Add automated tests for analytics functions
- Add exportable PDF report for portfolio review

**Long term**
- Multi‑wallet comparison (side‑by‑side)
- Personal performance goals and progress tracking
- Optional paid tier with cloud‑saved notes

This is a guide, not a promise — adjust as product goals evolve.

---

## If You’re New to Hyperliquid

Hyperliquid is a decentralized perp exchange. Key concepts to know:
- **Perps**: Futures-like contracts without expiry
- **Funding**: Periodic payments between longs and shorts
- **Cross vs isolated**: Cross uses a shared margin pool; isolated is per‑position
- **Agent wallet**: For browser wallets, Hyperliquid creates an agent key approved on‑chain

HyperPulse must reflect how Hyperliquid actually works — don’t invent features.

---

## Contact & Ownership

Primary owner: Anthony Lin. If you’re unsure about changes that affect trading logic, analytics definitions, or UX copy, ask first. This app is about trust and accuracy — we’d rather ship slowly than mislead users.
