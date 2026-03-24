# HyperPulse — Progress & Phase Plan

**Repo**: https://github.com/anthonylin99/hyperpulse
**Live**: https://hyperscan-eight.vercel.app
**Stack**: Next.js 14, TypeScript, Tailwind, `@nktkas/hyperliquid@0.32.1`, `lightweight-charts`, `recharts`

---

## Phase 1 (COMPLETE) — Market Intelligence Dashboard

Everything below is built, deployed, and live on Vercel.

### Core Features
- **6-zone CSS Grid layout**: nav bar, funding flashcards, sortable market table, right sidebar (activity feed + portfolio placeholder)
- **Real-time data**: WebSocket (`allMids`) for live price updates, REST polling every 30s for full market data
- **190+ perp assets** from Hyperliquid mainnet via server-side API routes
- **Signal classification**: Extreme Longs (>50% APR), Crowded Long (10-50%), Neutral (-10 to +10%), Crowded Short (<-10%), Funding Arb (ETH-only <-10%)
- **Category filters**: L1, L2, DeFi, Meme, AI, Gaming, HL Native, Other — pill buttons above table
- **Search**: type-to-filter by asset name
- **$10M OI minimum filter**: checkbox toggle to hide small caps
- **TradingView price charts**: `lightweight-charts` candlestick with 5m/15m/1h/4h/1d intervals, volume bars, crosshair — opens inline when you click a row
- **7d/30d/60d funding rate history**: recharts line chart with timeframe selector in the expanded row detail
- **7d funding sparklines**: tiny inline charts in each table row (top 10 by OI)
- **Activity feed**: whale trade alerts (>$500K on BTC/ETH/SOL), OI spike detection (>5% change between polls)
- **Error banner**: shows when API calls fail, auto-retries
- **Row striping**: alternating zinc-950/zinc-900 for readability

### Architecture
```
src/
├── app/
│   ├── api/market/route.ts          — GET metaAndAssetCtxs (server-side)
│   ├── api/market/funding/route.ts  — GET fundingHistory per coin
│   ├── api/market/candles/route.ts  — GET candleSnapshot per coin+interval
│   ├── layout.tsx                   — MarketProvider wrapper
│   ├── page.tsx                     — 6-zone grid
│   └── globals.css                  — Dark theme, grid, animations
├── components/
│   ├── Nav.tsx                      — Top bar, live indicator, wallet stub
│   ├── FundingFlashcards.tsx        — Horizontal scroll major asset cards
│   ├── MarketTable.tsx              — Sortable table + filters + search
│   ├── AssetRow.tsx                 — Table row with sparkline + category badge
│   ├── AssetDetail.tsx              — Expandable: price chart + funding history
│   ├── PriceChart.tsx               — TradingView lightweight-charts candlestick
│   ├── SignalBadge.tsx              — Colored signal pill
│   ├── ActivityFeed.tsx             — Real-time event stream
│   ├── ActivityFeedItem.tsx         — Single activity entry
│   ├── ChartPanel.tsx               — Full-page chart (unused in v1, available)
│   ├── TradeDrawer.tsx              — Order form drawer (built, not wired)
│   ├── PortfolioPanel.tsx           — Account + positions (built, not wired)
│   ├── WalletConnect.tsx            — Connect button (built, not wired)
│   └── WalletModal.tsx              — Private key input modal (built, not wired)
├── context/
│   ├── MarketContext.tsx            — Market data, WebSocket, activity feed
│   └── WalletContext.tsx            — Wallet connection + portfolio (built, not wired)
├── lib/
│   ├── constants.ts                 — Asset category map, thresholds, colors
│   ├── format.ts                    — USD, compact, percent formatters
│   ├── hyperliquid.ts               — InfoClient + SubscriptionClient singletons
│   └── signals.ts                   — Signal classification logic
└── types/
    └── index.ts                     — MarketAsset, Signal, Position, AccountState, ActivityEntry
```

### Key API Details
- **Perps data**: `info.metaAndAssetCtxs()` — returns universe metadata + per-asset contexts (mark price, funding, OI, volume)
- **Funding history**: `info.fundingHistory({ coin, startTime, endTime })` — hourly funding rate snapshots
- **Candle data**: `info.candleSnapshot({ coin, interval, startTime, endTime })` — OHLCV candles
- **WebSocket**: `sub.allMids()` for real-time mid prices, `sub.trades({ coin })` for trade stream
- All API calls go through server-side Next.js routes (`/api/market/*`) to avoid CORS and keep the Hyperliquid SDK server-side

### Category Map
The Hyperliquid API has no category field. We maintain a static map in `src/lib/constants.ts` (`ASSET_CATEGORIES`). New assets default to "Other". The map covers ~150 assets across L1, L2, DeFi, Meme, AI, Gaming, HL Native.

---

## Phase 2 (NEXT) — Wallet Integration + HIP-3 Spot Markets

### 2A: Wallet Connection
Everything is already built (`WalletContext.tsx`, `WalletModal.tsx`, `WalletConnect.tsx`, `TradeDrawer.tsx`, `PortfolioPanel.tsx`). Just needs wiring:

1. **Add `WalletProvider` back to `layout.tsx`** — wrap children with it (was removed for v1 to simplify)
2. **Wire `Nav.tsx`** — replace disabled "Connect Wallet" button with `WalletConnect` component
3. **Wire `MarketTable.tsx`** — pass `walletConnected={isConnected}` from `useWallet()` to `AssetRow`
4. **Wire trade buttons** — when wallet connected, Long/Short buttons in `AssetRow` open `TradeDrawer` with the selected coin
5. **Wire `PortfolioPanel.tsx`** — replace "Coming Soon" in sidebar with real portfolio panel
6. **Test on mainnet** — user's API wallet: `0x1dae1974fe97c32d304a57c4056d90545d319f38`, main wallet: `0x509292a9d8348d6264B84f8F57E4C074148fCA24`

**Key architecture note**: Hyperliquid uses "agent wallets" (API wallets). The private key signs trades via `ExchangeClient`, but the **main wallet address** is needed for all info queries (`clearinghouseState`, etc.). `WalletContext` already handles this dual-address flow — `connect(apiPrivateKey, mainWalletAddress)`.

**Trade execution**: Market orders use IOC limit at `markPx * 1.005` (longs) / `* 0.995` (shorts). Uses `exchangeClient.order()`. See `TradeDrawer.tsx` for full implementation.

### 2B: HIP-3 Spot Markets (Stocks, Commodities, RWAs)
Hyperliquid's **spot market** (HIP-3) has tokenized stocks and commodities:
- **Stocks**: TSLA, NVDA, AAPL, MSFT, SPY, QQQ
- **Gold**: XAUT0, PAXG, HOLD (HyperGold)
- **Index**: USPYX (Unit SP500 xStock)

These are NOT in the perps API. Requires:

1. **New API route**: `/api/spot` — calls `info.spotMetaAndAssetCtxs()` to get spot market data
2. **New type**: `SpotAsset` interface (different fields than perps — no funding rate, no OI in same format)
3. **Extend MarketContext** or create `SpotContext` — fetch + expose spot assets
4. **Add "Spot" / "Perps" toggle** at the top of the market table
5. **New category filter**: "Stocks", "Commodities" (only applicable to spot)
6. **Spot-specific table columns**: replace Funding/OI with Bid/Ask, 24h volume, market cap if available

### 2C: Enhanced Activity Feed
- Subscribe to `userEvents` when wallet connected — detect user's own liquidations
- Add funding payment notifications for open positions
- Color-code by severity: whale (orange), liquidation (red), OI spike (yellow), funding (blue)

---

## Phase 3 — Polish & Performance

### 3A: WebSocket Optimization
- Debounce `allMids` updates to max 1/second via `requestAnimationFrame`
- Auto-reconnect with exponential backoff (1s → 2s → 4s → max 30s)
- Stale data indicator (yellow dot) when WS disconnects

### 3B: Price Flash Animations
- CSS keyframe flash on price update (green flash up, red flash down, 600ms fade)
- Already have `flash-up` / `flash-down` classes in `globals.css` — need to trigger them on WS price changes in `AssetRow`

### 3C: Mobile Responsiveness
- Current grid is desktop-only (1fr 380px)
- Need breakpoints: stack sidebar below table on <1024px, hide flashcards on <768px
- Trade drawer needs mobile-friendly full-screen mode

### 3D: Data Accuracy Verification
- Cross-check funding rates against Hyperliquid UI
- Verify OI calculation: `parseFloat(ctx.openInterest) * markPx` — confirm this is USD notional
- Add a "last updated" staleness warning if data is >60s old

---

## Phase 4 — Advanced Features

### 4A: Funding Rate Heatmap
- Grid view: assets on Y axis, time on X axis, color = funding rate
- Quick visual scan of which assets are paying highest/lowest funding

### 4B: Historical Analytics
- 30-day funding P&L calculator: "If you were short X and collecting funding, what would you have earned?"
- OI trend charts per asset (not just current snapshot)

### 4C: Alerts & Notifications
- Browser push notifications for whale trades, OI spikes
- Custom alert rules: "Notify me when ETH funding APR < -20%"

### 4D: Multi-Account Support
- Track multiple wallets
- Aggregated portfolio view

---

## Dev Notes

### Environment
- **Mainnet** (`IS_TESTNET = false` in `src/lib/hyperliquid.ts`)
- **Vercel auto-deploy** connected to `anthonylin99/hyperpulse` main branch
- **No env vars needed** — all Hyperliquid API calls are public (read-only). Private key is only stored client-side in sessionStorage when wallet is connected.

### Key Deps
| Package | Version | Purpose |
|---------|---------|---------|
| `@nktkas/hyperliquid` | 0.32.1 | Hyperliquid SDK (InfoClient, ExchangeClient, SubscriptionClient) |
| `lightweight-charts` | 5.1.0 | TradingView candlestick charts |
| `recharts` | 3.8.0 | Funding history line charts, sparklines |
| `viem` | 2.47.6 | Wallet signing (privateKeyToAccount) |
| `lucide-react` | 1.0.1 | Icons |
| `react-hot-toast` | 2.6.0 | Toast notifications |

### Collaborators
- **PogChan** — GitHub write access
