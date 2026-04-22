# HyperPulse Feature Evaluation — 2026-03-24

## Market Research Pain Points → Strategic Verdict

### BUILD (in priority order)

**1. Customizable Alerts (#2) — BUILD FIRST (Weeks 1-3)**
- Forces backend investment (Supabase DB + Auth, user accounts, notification pipeline)
- Creates signup loop: email/Telegram collection = accelerator metrics
- Converts dashboard from "visit when curious" to "always-on service"
- 5 alert types: funding threshold, OI spike, whale trade, liquidation proximity, price level
- Telegram bot delivery → spreads organically in trading groups
- Monetization: Free (3 alerts) → Pro $15-29/mo (unlimited + email + webhook)
- Effort: 2-3 weeks. Best ROI on the list.

**2. Behavioral Whale Tracking (#6) — BUILD SECOND (Weeks 8-12)**
- Upgrade existing whale feed: "big trade happened" → "this wallet has been right 12/15 times"
- Conviction scoring: win rate, hold time, PnL patterns per wallet
- "Smart money" leaderboard (viral content)
- Proprietary data moat — improves with time, network effect
- Monetization: Basic free → behavioral enrichment for paid tier ($20-50/mo)
- Effort: 6-8 weeks. Shares DB infrastructure with alerts.

**3. Vault/Copy Trade Due Diligence (#8) — BUILD ALONGSIDE (Weeks 4-7)**
- "Morningstar for HL vaults" — nobody does Sharpe/drawdown/win-rate for vaults
- HL API: `info.vaultDetails({ vaultAddress })` has historical PnL data
- Compute: Sharpe, Sortino, max drawdown, Calmar ratio, win rate
- Free vault ratings page drives SEO → advanced analytics for paid tier
- Potential B2B: vault operators pay for "verified analytics badge"
- Effort: 2-3 weeks. Shares statistical functions with PnL analytics.

**4. PnL Analytics / Trading Journal (#3) — BUILD IN PHASE 2 (Weeks 4-7)**
- Equity curves, win rate by asset, funding income breakdown
- HL API: `info.userFills()` + `info.userFunding()` for historical data
- "Share your equity curve" social cards for Twitter (viral distribution)
- TradesViz charges $25-50/mo — HL traders have zero alternative today
- Effort: 4-6 weeks. Needs the database from Phase 1.

### RESEARCH NOW, BUILD LATER

**5. Hidden Trigger Order Visibility (#4) — Phase 3+**
- Highest ceiling: Hydromancer charges $300+/mo for this
- HL public API does NOT expose trigger orders — need statistical inference from execution patterns
- Start collecting order book snapshots + execution data NOW for training data
- Hard ML/statistics work but creates deepest moat on the list
- Effort: 8-12 weeks. Bad V1 (inaccurate) destroys trust — validate approach first.

### QUICK WINS (this week)

**6. Fiat Onramp (#10 partial)**
- MoonPay/Transak widget: 1-2 days, they handle KYC, generates 0.25-0.5% referral revenue
- Removes biggest user acquisition barrier ("need USDC on Arbitrum")

**7. Configurable Slippage (#10 partial)**
- Current: fixed 0.5% in TradeDrawer.tsx. Add a dropdown. Half a day.

### SKIP

- **Mobile App (#1)** — PWA first, native later. 3-6 months for a solo dev, no new capability.
- **Cross-Exchange Funding (#5)** — Dilutes HL-native positioning. FundingView does this free.
- **Tax Reporting (#7)** — Admin utility, not a startup thesis. Offer CSV export instead.
- **API Rate Limits (#9)** — Not our problem. Budget $179/mo for private RPC as opex.

---

## Accelerator Roadmap

| Phase | Weeks | What | Why |
|-------|-------|------|-----|
| 1 | 1-3 | Backend + Alerts | Foundation: user signups, email collection, revenue |
| 2 | 4-7 | PnL Analytics + Vault DD | Retention layer: analytics + vault ratings |
| 3 | 8-12 | Whale Intelligence | Moat builder: behavioral scoring + smart money |
| 4 | 12+ | Hidden Orders + PWA | Premium features |

## Infrastructure Cost: ~$225/mo
- Supabase: Free → $25/mo
- Vercel Pro: $20/mo
- Telegram Bot: Free
- Resend (email): Free → $20/mo
- MoonPay: Free (rev share)
- Private HL RPC: $179/mo (Phase 2)

## Revenue Path
- Month 1: $500 MRR (Pro alerts)
- Month 3: $3K MRR (alerts + PnL analytics)
- Month 6: $10K MRR (full suite + whale intelligence)
- Month 12: $30K+ MRR

## The 30-Second Pitch
"HyperPulse is the intelligence layer for Hyperliquid — the fastest-growing perp DEX doing $5B+ daily volume. We give traders proprietary funding signals, behavioral whale tracking, and customizable alerts that nobody else provides for this ecosystem. We're building the Bloomberg Terminal for on-chain derivatives."

## Lock-In Mechanisms
1. Alert configurations (10 custom alerts = sticky user)
2. Trade history/equity curves (data trapped in HyperPulse)
3. Behavioral whale database (proprietary, improves over time)
4. Sentiment index trust (validated over time)

## Network Effects
1. Whale tracking: more users = more wallets tracked = better coverage
2. Vault ratings: more users = stronger reputation layer
3. Alert sharing: "this alert rule is printing" spreads in Discord

## Competitor Map
- ASXN/HyperScreener — analytics dashboard (main comp)
- CoinGlass — whale positions, liquidation maps
- HyperTracker — behavioral cohorts (API only, no UI)
- Otomato — alerts (general, not HL-focused)
- TradesViz — PnL journaling
- FundingView — cross-exchange funding (no alerts)
- Hydromancer — hidden trigger orders ($300+/mo)

**Nobody owns "funding intelligence + alerts + whale behavior" for HL. That's our lane.**
