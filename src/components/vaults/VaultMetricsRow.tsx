"use client";

import { StatTile } from "@/components/ui/StatTile";
import { formatCompact, formatPct } from "@/lib/format";
import { formatEasternDate } from "@/lib/time";
import type { VaultMetrics } from "@/types/vaults";

const MIN_SAMPLES = 30;

export function VaultMetricsRow({ metrics }: { metrics: VaultMetrics }) {
  const showRisk = metrics.dailyReturnSamples >= MIN_SAMPLES;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <StatTile
        label="TVL"
        value={formatCompact(metrics.tvl)}
        sub={
          metrics.tvlChange7dPct != null ? (
            <span className={metrics.tvlChange7dPct >= 0 ? "text-emerald-400" : "text-red-400"}>
              {formatPct(metrics.tvlChange7dPct)} 7d
            </span>
          ) : null
        }
      />
      <StatTile
        label="All-time return"
        value={metrics.returnAllTimePct != null ? formatPct(metrics.returnAllTimePct) : "—"}
        state={
          metrics.returnAllTimePct == null
            ? "neutral"
            : metrics.returnAllTimePct >= 0
              ? "success"
              : "danger"
        }
      />
      <StatTile
        label="30d return"
        value={metrics.return30dPct != null ? formatPct(metrics.return30dPct) : "—"}
        state={
          metrics.return30dPct == null
            ? "neutral"
            : metrics.return30dPct >= 0
              ? "success"
              : "danger"
        }
      />
      <StatTile
        label="Max drawdown (90d)"
        value={
          metrics.maxDrawdownPct != null
            ? `${(metrics.maxDrawdownPct * 100).toFixed(1)}%`
            : "—"
        }
        sub={
          metrics.maxDrawdownAt &&
          metrics.maxDrawdownFromEquity != null &&
          metrics.maxDrawdownToEquity != null ? (
            <>
              {formatCompact(metrics.maxDrawdownFromEquity)} →{" "}
              {formatCompact(metrics.maxDrawdownToEquity)} on{" "}
              {formatEasternDate(metrics.maxDrawdownAt)}
            </>
          ) : null
        }
        state={metrics.maxDrawdownPct ? "danger" : "neutral"}
      />
      <StatTile
        label="Sharpe (90d)"
        value={showRisk && metrics.sharpe90d != null ? metrics.sharpe90d.toFixed(2) : "—"}
        sub={!showRisk ? "Insufficient history" : null}
        state={
          showRisk && metrics.sharpe90d != null && metrics.sharpe90d >= 1 ? "success" : "neutral"
        }
      />
      <StatTile
        label="Calmar (90d)"
        value={showRisk && metrics.calmar90d != null ? metrics.calmar90d.toFixed(2) : "—"}
        sub={!showRisk ? "Insufficient history" : null}
        state={
          showRisk && metrics.calmar90d != null && metrics.calmar90d >= 1 ? "success" : "neutral"
        }
      />
    </div>
  );
}
