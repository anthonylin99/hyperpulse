# HyperPulse Nightly Handoff — 2026-03-24

## Summary
This handoff captures what was completed today, what remains risky, and what tomorrow's engineer should challenge before further rollout.

---

## Progress Completed Today

### 1. Wallet connect reliability + UX
- Hardened wallet input validation and surfaced real error reasons in modal.
- Added browser-wallet-first flow (no private key paste required):
  - connect injected wallet,
  - generate local agent key,
  - approve agent on Hyperliquid,
  - trade with agent key.
- Added explicit provider selection to avoid wallet hijacking:
  - MetaMask
  - Rabby
  - Coinbase
- Fixed agent approval name bug (`agentName` length <= 16).

### 2. HIP-3 spot data fix
- Fixed spot parser so it no longer shows only PURR.
- Correctly maps `@id` markets via token-index metadata.
- Spot mode now resolves full available HIP-3 universe from API response.

### 3. Trading panel improvements
- Clarified buying power vs margin usage in drawer.
- Added order-book snapshot panel (best bid/ask + spread + top levels).
- Added historical funding context (regime and percentile-like framing).

### 4. Portfolio/account value correction
- Switched displayed perp account value to cross-margin summary.
- Added spot USDC visibility (total + hold) in portfolio panel.
- Clarified that perp buying power is `withdrawable`, not total wallet USDC.

### 5. Activity + UI compaction
- Added dedupe guardrails for activity feed entries.
- Reduced top strip noise: majors-only cards and denser layout.
- Trade column behavior updated:
  - hidden entirely when disconnected,
  - visible only when wallet connected.

### 6. Proprietary sentiment index
- Added HyperPulse 0-100 sentiment slider (fear/neutral/greed).
- Inputs include:
  - funding regime,
  - signal bias,
  - breadth,
  - volatility breadth,
  - MA-style funding regime trend.
- Added in-app methodology disclosure popup (info icon) with public weights and live component values.

---

## Challenges Encountered

1. **Injected wallet collisions**
- Default EIP-1193 provider selection frequently opened Coinbase unexpectedly.
- Mitigation: explicit provider buttons + deterministic auto-pick order.

2. **Hyperliquid spot metadata shape**
- HIP-3 universe includes many non-canonical `@id` pairs; naive filtering dropped most assets.
- Mitigation: decode by token indices + market index.

3. **Balance interpretation mismatch**
- User expectation matched Hyperliquid UI “available to trade,” while app showed isolated summary path.
- Mitigation: use cross-margin summary and expose spot-vs-perp context.

4. **Deploy latency/queue variance**
- Vercel production deploys intermittently sat in queued/building states longer than expected.

---

## Struggles / Friction Points

1. **Semantic mismatch risk**
- Labels like “Account Value,” “Buying Power,” and “Available” are easy to misread across cross/isolated/spot contexts.

2. **Model trust risk (sentiment index)**
- Without explicit transparency, users can interpret score divergence as “wrong model” instead of different data universe.
- Added disclosure, but calibration confidence remains moderate.

3. **Scope creep pressure**
- Significant functionality added across wallet auth, market data normalization, execution UX, and analytics in one iteration cycle.
- Regression risk rises with each coupled change.

---

## To-Do (Tomorrow, Priority Order)

1. **Privy-native login integration (high priority)**
- Add Privy SDK flow so email-based Hyperliquid users can connect/sign without extension selection.
- Keep agent-approval model (no key paste).

2. **Spot trading execution path (high priority)**
- Spot table currently data-rich but not fully integrated with spot order placement from same UX path.
- Wire spot asset IDs and ticket behavior explicitly.

3. **Sentiment calibration panel (medium)**
- Add toggle presets:
  - HL-native only (current)
  - hybrid with macro overlay (if external feeds added)
- Add weight controls for internal QA only.

4. **Activity feed signal quality (medium)**
- Add event bucketing/coalescing rather than just signature dedupe.
- Improve severity scoring and reduce low-value churn.

5. **Metric naming hardening (medium)**
- Rename fields in UI for unambiguous meaning:
  - `Perp Cross Value`
  - `Perp Withdrawable`
  - `Spot USDC`

6. **Connection observability (medium)**
- Add analytics/events for connect failures by provider and approval stage.

---

## Poke Holes (Devil’s Advocate Review)

1. **Sentiment index may overfit HL microstructure**
- It can show greed while macro risk is fear; this is expected but still dangerous if users assume broad-market equivalence.
- Action: add explicit “scope” badge beside score at all times.

2. **Agent key lifecycle is still MVP-grade**
- Session storage is better than server storage but still exposed to XSS risk.
- Action: evaluate stronger key protection and strict CSP/XSS hardening.

3. **Order book snapshot is polling, not true depth stream**
- Snapshot every few seconds can be stale in fast markets.
- Action: migrate to websocket depth updates for trade drawer.

4. **Wallet provider detection is heuristic-based**
- Extension ecosystems change quickly; provider flags can break.
- Action: add fallback diagnostics and error hints when selection fails.

5. **Cross vs isolated nuances can still surprise users**
- Even with improved labels, account/balance logic can diverge from what users expect in different HL views.
- Action: add a compact “data source” tooltip next to each portfolio metric.

6. **Feature concentration risk**
- Multiple critical systems changed in short succession (auth, execution, analytics, UI).
- Action: run structured regression test pass before any major public demo.

---

## Current Branch/Deploy Notes
- Latest local changes include: trade-column visibility conditional on connected wallet.
- Runbook for tomorrow:
  1. `npm run lint`
  2. `npm run build`
  3. smoke connect flow across MetaMask/Rabby/Coinbase
  4. smoke spot list loading and funding slider popup
  5. verify production alias health on Vercel inspect
