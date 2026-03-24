# HyperPulse PM Brief — Hypothetical Hyperliquid Trader Interview

Date: 2026-03-24  
Author: Engineering handoff continuation

## Persona Snapshot
- Role: Active perp + spot trader on Hyperliquid (4-20 trades/day)
- Style: Momentum + mean reversion around funding extremes
- Risk profile: Medium-high; uses leverage but is liquidation-aware
- Workflow: Scans opportunities first, executes fast, validates risk before click

## Interview Notes (Simulated, Trader Lens)
### What they are trying to do
- Find mispriced funding quickly across majors and high-OI alts.
- Compare current funding vs recent history to decide if current regime is stretched.
- Execute from the same screen without context switching to another terminal.
- Validate practical constraints before placing order: available buying power, margin impact, liquidation sensitivity, and rough fees.

### What frustrates them
- Ambiguous wallet/account labels (cross value vs withdrawable vs spot balance).
- Signals/sentiment without clear scope or methodology context can feel arbitrary.
- Duplicative activity feed events create noise and reduce trust.
- Connect flow unpredictability (wrong extension opens) reduces confidence during volatile moments.

### What they explicitly value
- Fast top-line scan: BTC/ETH/SOL/HYPE funding + sentiment pulse.
- One-click access to order book context before order placement.
- Historical funding framing (percentile/regime) not just point-in-time rate.
- Transparent indicator math (public weights, components, live values).

## Prioritized Needs (PM View)
## P0 (must-have for daily trading trust)
- Clear capital semantics:
  - `Perp Cross Value`
  - `Perp Withdrawable`
  - `Spot USDC`
  - with source-context hints inline.
- Sentiment transparency:
  - always-visible scope badge (`HL-native`) to prevent macro equivalence confusion.
- Activity quality:
  - coalesce repetitive feed events (e.g., same signature) into one line with count.

## P1 (important for execution confidence)
- Spot trade path parity with perp drawer conventions.
- Wallet connect reliability with deterministic provider selection + clear failure diagnostics.
- Better compactness/density in top strip while preserving readability.

## P2 (strategic quality)
- Websocket depth for trade drawer instead of polling snapshots.
- Optional sentiment calibration presets (HL-native only vs hybrid macro overlay).
- Connection observability dashboard (provider failures by stage).

## Product Requirements to Engineering
1. Add scope clarity in sentiment UI
- Requirement: score must always communicate that it is Hyperliquid-native microstructure.
- Acceptance: badge visible at all times and methodology modal repeats scope statement.

2. Normalize account language
- Requirement: all portfolio metrics use unambiguous naming and source hints.
- Acceptance: no generic “Account Value/Buying Power” labels remain in portfolio summary.

3. Reduce feed noise with coalescing
- Requirement: repeated identical events should increment a count rather than create stacked duplicates.
- Acceptance: repeated event shows `xN`, newest timestamp refreshes, feed length cap retained.

## Success Metrics (first pass)
- Fewer support questions about balance semantics.
- Lower observed duplicate-event ratio in activity panel.
- Higher conversion from “connect wallet” to “place order” in same session.
- Fewer complaints about “sentiment feels wrong” after scope disclosure.

## Risks / Poke Holes
- Overfitting to HL-only data may still diverge materially from macro fear regimes.
- Agent-key lifecycle remains MVP-grade and vulnerable to client-side compromise if XSS occurs.
- Poll-based order book may understate slippage risk in fast markets.
- Feature density can regress usability without strict visual hierarchy.

## Immediate Engineering Actions (Tonight)
1. Ship sentiment scope badge + scope note reinforcement.
2. Rename and annotate core portfolio metrics.
3. Coalesce duplicate activity events into counted entries.
4. Keep lint/build green and include in nightly report.
