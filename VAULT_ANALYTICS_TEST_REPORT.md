# Vault Analytics — Test Report

Spec sections referenced: §8.1 Functional, §8.2 Metric correctness, §8.3 Edge cases, §8.4 Performance.

## Pre-test setup

- Populate `src/lib/vaultSeed.ts` with at least 10 real vault addresses from
  https://app.hyperliquid.xyz/vaults before running these checks. The list page
  shows an empty-state notice if the seed is empty.
- Run `npm run dev` and open http://localhost:3000/vaults.

---

## §8.1 Functional tests

| Check | Status | Notes |
|---|---|---|
| List page loads with ≥10 vaults | _pending_ | Confirm row count after seeding |
| Sort works on every column | _pending_ | Click each column header; verify sort flip |
| Filters work independently | _pending_ | Toggle each chip; row count changes as expected |
| Filters combined | _pending_ | All three on (default) vs. all off |
| Detail loads for vault >180d old | _pending_ | Address tested: `____` |
| Detail loads for vault <30d old | _pending_ | Confirm Sharpe/Calmar show "Insufficient history". Address: `____` |
| Detail loads for negative-return vault | _pending_ | UI does not crash. Address: `____` |
| Operator track record renders + links to /portfolio | _pending_ | Click-through verified |
| Address copy-to-clipboard | _pending_ | Toast fires + clipboard contains full address |
| Smoke /markets, /portfolio, /alerts, /docs | _pending_ | No regressions observed |

---

## §8.2 Metric correctness

Vault used for hand-verification: **`____`**

Pulled `accountValueHistory` from raw API on **YYYY-MM-DD HH:MM ET**.

| Metric | UI value | Hand-computed | Diff |
|---|---|---|---|
| 30d return | `____%` | `____%` | `____%` |
| Max drawdown (90d) | `____%` | `____%` | `____%` |
| Sharpe (90d) | `____` | `____` | `____` |

Tolerance threshold: 0.1%. Methodology of hand calculation:
1. Curl `https://api.hyperliquid.xyz/info` with `{"type":"vaultDetails","vaultAddress":"<addr>"}`.
2. Extract `portfolio[allTime].accountValueHistory`.
3. In notebook: trim to last 90 days, compute daily returns, apply spec §5 formulas.

---

## §8.3 Edge cases

| Case | Status | Notes |
|---|---|---|
| 0 TVL but historical activity | _pending_ | TVL column shows $0; sortable; no NaN |
| Operator address = vault address | _pending_ | Renders normally; no special-case crash |
| Vault with 1–2 fills | _pending_ | Strategy fingerprint shows "Not enough trades" |
| Paused vault (no 30d fills) | _pending_ | Fingerprint shows "operator may be paused" |
| Hyperliquid API 5xx | _pending_ | List page shows red error card; detail shows error card |

---

## §8.4 Performance

| Check | Target | Measured | Status |
|---|---|---|---|
| `/vaults` first-load | <3s | `__ms` | _pending_ |
| `/vaults/[address]` first-load (1yr history) | <2s | `__ms` | _pending_ |
| No N+1 in vault list | parallel | confirmed via Network tab | _pending_ |

The list aggregator uses `Promise.all` across the seed list in
`src/lib/vaults.ts`. Server-side response cached at the CDN with
`s-maxage=300, stale-while-revalidate=900`.

---

## Build & regression

- `npm run build` exit code: `__`
- `npm run lint` exit code: `__`
- Existing pages (/markets, /portfolio, /alerts, /docs) smoke-tested: _pending_

---

## Outstanding follow-ups (out of scope this PR)

- Auto-discover vault addresses from the leaderboard endpoint (replace seed list).
- Switch return/drawdown math to `pnlHistory`-based to remove flow distortion.
- Vault performance alerts via Telegram.
- Side-by-side vault comparison view.
- Backfill historical TVL data beyond what the API exposes.
