# Agent Brokerage UI Plan

Goal: make automated trading feel like a simple brokerage workflow, not a research dashboard.

## Product Shape

Use three modes:

- `Paper`: one-click approval writes to Shadow Book.
- `Testnet`: one-click approval writes a real execution intent for Hyperliquid testnet.
- `Live`: starts human-approved only; auto mode is gated by kill switch, limits, and account setup.

The default screen should be compact:

- Account/risk strip at the top.
- Trade queue as a dense table.
- Right-side detail drawer only when a row is selected.
- No per-asset cards.

## Main Screen

Top strip:

- Mode: Paper, Testnet, Live.
- Automation: Manual approval, Auto.
- Allocation per trade.
- Daily loss used.
- Open exposure.
- Kill switch.

Trade queue table:

- Asset
- Side
- Entry
- TP %
- SL %
- Allocation %
- Leverage
- Action

Row actions:

- `Approve`
- `Reject`
- `Edit`

Selected-row drawer:

- Signal source
- Why the trade exists
- Risk checks
- Size calculation
- TP/SL preview
- Audit history

## Backend Flow

1. Alert worker creates a signal.
2. Risk service sizes it and creates a trade intent.
3. UI shows pending intents at the configured allocation, starting at 5% of tradable cash/portfolio.
4. User approves, or auto mode approves if allowed.
5. Execution worker places entry plus reduce-only TP/SL.
6. Reconciler watches fills, cancels, open orders, and positions.

## Required Modules

- `src/app/agent/page.tsx`
- `src/components/agent/AgentDevPage.tsx`
- `src/components/agent/AgentTradeTable.tsx`
- `src/components/agent/AgentControlStrip.tsx`
- `src/components/agent/AgentTradeDrawer.tsx`
- `src/app/api/agent/intents/route.ts`
- `src/app/api/agent/intents/[id]/approve/route.ts`
- `src/app/api/agent/intents/[id]/reject/route.ts`
- `src/lib/agent/risk.ts`
- `src/lib/agent/sizing.ts`
- `src/lib/agent/intents.ts`
- `src/lib/agent/execution.ts`
- `workers/agent-executor/index.mjs`
- `workers/agent-reconciler/index.mjs`

## Rollout

1. DB-backed paper intents.
2. One-click paper approval.
3. Testnet execution worker.
4. Live human-approved execution.
5. Live auto mode with tiny limits.

## UI Rule

Match the Markets tab density: `h-8` rows, `text-xs`, `font-mono` values, compact controls, and details on demand.
