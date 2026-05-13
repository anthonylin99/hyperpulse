"use client";

import { StatTile } from "@/components/ui/StatTile";
import { formatCompact, formatPct } from "@/lib/format";
import { formatEasternDate } from "@/lib/time";
import type { VaultMetrics } from "@/types/vaults";

const MIN_SAMPLES = 30;

const TVL_SOURCE_LABEL: Record<VaultMetrics["tvlSource"], string> = {
  account_value: "Vault equity",
  summary_tvl: "Vault summary TVL",
  followers_sum: "Follower equity sum",
  unavailable: "Source unavailable",
};

export function VaultMetricsRow({ metrics }: { metrics: VaultMetrics }) {
  const showRisk = metrics.dailyReturnSamples >= MIN_SAMPLES;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <StatTile
        label="Vault equity / TVL"
        value={formatCompact(metrics.tvl)}
        sub={
          metrics.tvlChange7dPct != null ? (
            <>
              <span className={metrics.tvlChange7dPct >= 0 ? "text-emerald-400" : "text-red-400"}>
                {formatPct(metrics.tvlChange7dPct)} 7d
              </span>
              <span className="ml-1 text-zinc-500">· {TVL_SOURCE_LABEL[metrics.tvlSource]}</span>
            </>
          ) : (
            TVL_SOURCE_LABEL[metrics.tvlSource]
          )
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
          metrics.maxDrawdownAt ? <>P&L-return trough on {formatEasternDate(metrics.maxDrawdownAt)}</> : null
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
