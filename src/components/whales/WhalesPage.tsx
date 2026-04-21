"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookmarkPlus,
  Copy,
  Database,
  Layers3,
  Search,
  ShieldAlert,
  Target,
  Trash2,
  Wallet,
  Waves,
} from "lucide-react";
import { cn, formatCompact, formatPct, formatUSD, truncateAddress } from "@/lib/format";
import type { WhaleAlert, WhaleWalletProfile, WhaleWatchlistEntry } from "@/types";
import toast from "react-hot-toast";

type FeedResponse = {
  alerts: WhaleAlert[];
  nextCursor: number | null;
  summary: {
    alertCount: number;
    uniqueWallets: number;
    depositLedCount: number;
    highSeverityCount: number;
    directionalCount: number;
    hedgeCount: number;
    hip3Count: number;
    topSeverity: "high" | "medium" | "low";
  };
  workerConfigured: boolean;
  workerStatus: {
    updatedAt: number;
    payload: Record<string, unknown> | null;
  } | null;
};

const TIMEFRAME_OPTIONS = ["1h", "6h", "24h", "7d"] as const;
const VIEW_FILTERS = [
  { value: "all", label: "All" },
  { value: "directional", label: "Directional" },
  { value: "deposit", label: "Flow-led" },
  { value: "stress", label: "Stress" },
  { value: "hedges", label: "Hedges" },
  { value: "hip3", label: "HIP-3" },
] as const;
const SEVERITY_OPTIONS = ["all", "high", "medium", "low"] as const;

function humanizeBucket(bucket: string) {
  return bucket.replace(/_/g, " ");
}

function formatMultipleLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "n/a";
  if (value < 0.1) return "<0.1x";
  return `${value.toFixed(1)}x`;
}

function workerFreshness(workerStatus: FeedResponse["workerStatus"]) {
  if (!workerStatus?.updatedAt) return "No heartbeat";
  const deltaMs = Date.now() - workerStatus.updatedAt;
  if (deltaMs < 10_000) return "Live now";
  if (deltaMs < 60_000) return `${Math.round(deltaMs / 1000)}s ago`;
  return `${Math.round(deltaMs / 60_000)}m ago`;
}

function formatAlertTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function alertTypeLabel(alert: WhaleAlert) {
  switch (alert.eventType) {
    case "deposit-led-long":
    case "deposit-led-short":
      return "Flow-led entry";
    case "aggressive-add":
      return "Directional add";
    case "flip":
      return "Position flip";
    case "reduce":
      return "Reduce";
    case "underwater-whale":
      return "Under pressure";
    case "liquidation-risk":
      return "Liquidation risk";
    default:
      return titleCase(alert.eventType);
  }
}

function alertDirectionLabel(alert: WhaleAlert) {
  if (alert.side === "mixed") return "Mixed";
  if (alert.directionality === "stress") return "Stress";
  return alert.side === "long" ? "Long" : "Short";
}

function directionTone(alert: WhaleAlert) {
  if (alert.directionality === "stress") return "amber";
  if (alert.side === "long") return "green";
  if (alert.side === "short") return "red";
  return "neutral";
}

function liveReason(alert: WhaleAlert) {
  if (alert.confidenceLabel?.trim()) return alert.confidenceLabel;
  return alert.evidence.summary;
}

function SmallPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "green" | "amber" | "red" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]",
        tone === "green" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
        tone === "amber" && "border-amber-500/25 bg-amber-500/10 text-amber-300",
        tone === "red" && "border-rose-500/25 bg-rose-500/10 text-rose-300",
        tone === "neutral" && "border-zinc-800 bg-zinc-950/70 text-zinc-400",
      )}
    >
      {label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#13171f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-zinc-100">{value}</div>
          <div className="mt-1 text-xs text-zinc-500">{helper}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-300">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof Activity;
  tone?: "neutral" | "green" | "red";
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#13171f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
          <div
            className={cn(
              "mt-3 font-mono text-[28px] font-semibold tracking-tight",
              tone === "green" && "text-emerald-300",
              tone === "red" && "text-rose-300",
              tone === "neutral" && "text-zinc-100",
            )}
          >
            {value}
          </div>
          <div className="mt-1 text-xs text-zinc-500">{helper}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-2 text-emerald-300">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function EmptyFeed({ workerConfigured }: { workerConfigured: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-[#13171f] p-8 text-center">
      <Activity className="mx-auto h-6 w-6 text-zinc-600" />
      <div className="mt-3 text-sm font-medium text-zinc-200">No whale alerts yet.</div>
      <div className="mt-2 text-sm leading-6 text-zinc-500">
        {workerConfigured
          ? "The worker is live, but nothing has crossed the live thresholds in the selected window."
          : "The whale dashboard is ready, but the worker is offline right now."}
      </div>
    </div>
  );
}

function OperationalFeed({
  alerts,
  selectedAddress,
  onSelect,
  workerConfigured,
  workerStatus,
  loading,
  refreshing,
}: {
  alerts: WhaleAlert[];
  selectedAddress: string | null;
  onSelect: (address: string) => void;
  workerConfigured: boolean;
  workerStatus: FeedResponse["workerStatus"];
  loading: boolean;
  refreshing: boolean;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#13171f]">
      <div className="border-b border-zinc-800 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Operational Feed</div>
            <div className="mt-2 text-lg font-semibold text-zinc-100">Institutional whale alerts</div>
            <div className="mt-1 text-sm text-zinc-400">
              Full-width tape for faster scanning. Select any row to load the wallet deep-dive below.
            </div>
          </div>
          <div className="flex items-center gap-2">
            {refreshing && <SmallPill label="Refreshing" tone="neutral" />}
            <SmallPill label={workerConfigured ? workerFreshness(workerStatus) : "Worker offline"} tone={workerConfigured ? "green" : "neutral"} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 p-5">
          <div className="h-20 rounded-2xl border border-zinc-800 skeleton" />
          <div className="h-20 rounded-2xl border border-zinc-800 skeleton" />
          <div className="h-20 rounded-2xl border border-zinc-800 skeleton" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="p-5">
          <EmptyFeed workerConfigured={workerConfigured} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1220px] table-fixed">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/35 text-left text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <th className="w-[110px] px-5 py-3 font-medium">Time</th>
                <th className="w-[180px] px-4 py-3 font-medium">Wallet</th>
                <th className="w-[190px] px-4 py-3 font-medium">Alert Type</th>
                <th className="w-[140px] px-4 py-3 font-medium">Conviction</th>
                <th className="w-[110px] px-4 py-3 font-medium">Asset</th>
                <th className="w-[120px] px-4 py-3 font-medium">Direction</th>
                <th className="w-[170px] px-4 py-3 font-medium">Notional Size</th>
                <th className="px-4 py-3 font-medium">Why It Passed</th>
                <th className="w-[140px] px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => {
                const active = selectedAddress?.toLowerCase() === alert.address.toLowerCase();
                return (
                  <tr
                    key={alert.id}
                    onClick={() => onSelect(alert.address)}
                    className={cn(
                      "cursor-pointer border-b border-zinc-800/80 transition-colors",
                      active ? "bg-emerald-500/[0.08]" : "hover:bg-zinc-950/50",
                    )}
                  >
                    <td className="px-5 py-4 align-top">
                      <div className="font-mono text-sm text-zinc-100">{formatAlertTimestamp(alert.timestamp)}</div>
                      <div className="mt-1 text-xs text-zinc-500">{humanizeBucket(alert.riskBucket)}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-mono text-sm text-zinc-100">{truncateAddress(alert.address)}</div>
                      <div className="mt-1 text-xs text-zinc-500">{alert.walletLabel || "Tracked wallet"}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="text-sm font-medium text-zinc-100">{alertTypeLabel(alert)}</div>
                      <div className="mt-1 text-xs text-zinc-500">{alert.headline}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap gap-2">
                        <SmallPill label={alert.conviction} tone={alert.conviction === "high" ? "green" : alert.conviction === "medium" ? "amber" : "neutral"} />
                        <SmallPill label={alert.severity} tone={alert.severity === "high" ? "red" : alert.severity === "medium" ? "amber" : "neutral"} />
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="text-sm font-medium text-zinc-100">{alert.coin}</div>
                      <div className="mt-1 text-xs text-zinc-500">{alert.marketType === "hip3_spot" ? "HIP-3" : "Perp"}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <SmallPill label={alertDirectionLabel(alert)} tone={directionTone(alert)} />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-mono text-sm text-zinc-100">{formatCompact(alert.notionalUsd)}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {alert.leverage ? `${alert.leverage.toFixed(1)}x lev` : "spot"} · {formatMultipleLabel(alert.sizeVsWalletAverage)} vs avg
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="text-sm text-zinc-300">{liveReason(alert)}</div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(alert.address);
                          }}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] transition-colors",
                            active
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                              : "border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100",
                          )}
                        >
                          View details
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function WatchlistStrip({
  watchlist,
  selectedAddress,
  onSelect,
}: {
  watchlist: WhaleWatchlistEntry[];
  selectedAddress: string | null;
  onSelect: (address: string) => void;
}) {
  if (watchlist.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#13171f] px-5 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Watchlist</div>
          <div className="mt-1 text-sm text-zinc-400">Pinned whales stay one click away while you scan the tape.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {watchlist.slice(0, 8).map((entry) => {
            const active = selectedAddress?.toLowerCase() === entry.address.toLowerCase();
            return (
              <button
                key={entry.address}
                onClick={() => onSelect(entry.address)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100",
                )}
              >
                <div className="text-sm font-medium">{entry.nickname || truncateAddress(entry.address)}</div>
                <div className="mt-1 font-mono text-xs text-zinc-500">{truncateAddress(entry.address)}</div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ProfilePanel({
  profile,
  loading,
  watchlisted,
  selectedAlert,
  onAddWatchlist,
  onRemoveWatchlist,
}: {
  profile: WhaleWalletProfile | null;
  loading: boolean;
  watchlisted: WhaleWatchlistEntry | null;
  selectedAlert: WhaleAlert | null;
  onAddWatchlist: (address: string) => Promise<void>;
  onRemoveWatchlist: (address: string) => Promise<void>;
}) {
  if (loading) {
    return <div className="h-[820px] rounded-2xl border border-zinc-800 skeleton" />;
  }

  if (!profile) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-[#13171f] p-8 text-center">
        <Wallet className="mx-auto h-6 w-6 text-zinc-600" />
        <div className="mt-3 text-sm font-medium text-zinc-200">Select a whale row or paste a wallet address.</div>
        <div className="mt-2 text-sm leading-6 text-zinc-500">
          The lower workspace expands into the full wallet profile with P&amp;L, open exposure, grouped trades, and ledger flow.
        </div>
      </section>
    );
  }

  const howGood =
    profile.realizedPnl30d > 0 && profile.directionalHitRate30d >= 55
      ? "Profitable and consistent"
      : profile.realizedPnl30d > 0
        ? "Profitable, still selective"
        : "Needs more confirmation";
  const styleTitle = profile.styleTags[0] ?? "Conviction trader";
  const focusTitle = profile.focusTags.slice(0, 2).join(" · ") || "Crypto beta";
  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(profile.address);
      toast.success("Whale wallet copied");
    } catch {
      toast.error("Failed to copy whale wallet");
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#13171f]">
      <div className="border-b border-zinc-800 px-5 py-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              HyperPulse &gt; Whale Tracker &gt; {truncateAddress(profile.address)}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {profile.styleTags.map((tag) => (
                <SmallPill key={tag} label={tag} tone="green" />
              ))}
              {profile.focusTags.map((tag) => (
                <SmallPill key={tag} label={tag} tone="neutral" />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold tracking-tight text-zinc-100">
                WHALE PROFILE: <span className="font-mono">{truncateAddress(profile.address)}</span>
              </h2>
              <button
                onClick={handleCopyAddress}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
                title="Copy full wallet address"
              >
                <Copy className="h-4 w-4" />
                Copy address
              </button>
            </div>
            <button
              onClick={handleCopyAddress}
              className="mt-4 flex w-full max-w-4xl items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-left transition hover:border-emerald-500/25"
              title="Click to copy full wallet address"
            >
              <span className="min-w-0 break-all font-mono text-sm text-zinc-200">{profile.address}</span>
              <Copy className="h-4 w-4 shrink-0 text-emerald-300" />
            </button>
            <div className="mt-3 text-sm text-zinc-500">
              First seen {profile.firstSeenAt ? new Date(profile.firstSeenAt).toLocaleString() : "n/a"}
              {" · "}
              Last seen {profile.lastSeenAt ? new Date(profile.lastSeenAt).toLocaleString() : "n/a"}
            </div>
            <p className="mt-4 max-w-5xl text-sm leading-7 text-zinc-300">{profile.narrative}</p>
          </div>

          <div className="space-y-3 xl:w-[340px]">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Current trigger</div>
              {selectedAlert ? (
                <>
                  <div className="mt-3 text-sm font-medium text-zinc-100">{selectedAlert.headline}</div>
                  <div className="mt-2 text-xs leading-5 text-zinc-400">{selectedAlert.detail}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <SmallPill label={alertTypeLabel(selectedAlert)} tone="neutral" />
                    <SmallPill label={alertDirectionLabel(selectedAlert)} tone={directionTone(selectedAlert)} />
                    <SmallPill label={selectedAlert.conviction} tone={selectedAlert.conviction === "high" ? "green" : selectedAlert.conviction === "medium" ? "amber" : "neutral"} />
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm text-zinc-500">No live trigger selected for this wallet.</div>
              )}
            </div>

            {watchlisted ? (
              <button
                onClick={() => onRemoveWatchlist(profile.address)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
              >
                <Trash2 className="h-4 w-4" />
                Remove watchlist
              </button>
            ) : (
              <button
                onClick={() => onAddWatchlist(profile.address)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200 transition hover:bg-emerald-500/15"
              >
                <BookmarkPlus className="h-4 w-4" />
                Add to watchlist
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            label="Total P&L"
            value={formatCompact(profile.realizedPnl30d)}
            helper="realized 30d"
            icon={BarChart3}
            tone={profile.realizedPnl30d >= 0 ? "green" : "red"}
          />
          <KpiCard label="30D Volume" value={formatCompact(profile.baseline.volume30d)} helper="public fills" icon={Waves} />
          <KpiCard label="Equity" value={formatCompact(profile.accountEquity)} helper="perps + spot USDC" icon={Wallet} />
          <KpiCard label="Open Notional" value={formatCompact(profile.totalOpenNotionalUsd)} helper={`${profile.openPositionsCount} live positions`} icon={Layers3} />
          <KpiCard label="Win Rate" value={`${profile.directionalHitRate30d.toFixed(1)}%`} helper="30d grouped trades" icon={Target} tone={profile.directionalHitRate30d >= 50 ? "green" : "neutral"} />
          <KpiCard label="Median Size" value={formatCompact(profile.medianTradeSize30d)} helper={`${profile.avgHoldHours30d.toFixed(1)}h avg hold`} icon={Database} />
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">How good</div>
            <div className="mt-3 text-lg font-semibold text-zinc-100">{howGood}</div>
            <div className="mt-2 text-sm leading-6 text-zinc-400">
              Win rate {profile.directionalHitRate30d.toFixed(1)}% with {formatUSD(profile.realizedPnl30d)} realized over the last 30 days.
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Style</div>
            <div className="mt-3 text-lg font-semibold text-zinc-100">{styleTitle}</div>
            <div className="mt-2 text-sm leading-6 text-zinc-400">
              Median size {formatCompact(profile.medianTradeSize30d)} with {profile.avgHoldHours30d.toFixed(1)}h average hold and {profile.averageLeverage.toFixed(1)}x average leverage.
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Focus</div>
            <div className="mt-3 text-lg font-semibold text-zinc-100">{focusTitle}</div>
            <div className="mt-2 text-sm leading-6 text-zinc-400">
              Favorite assets {profile.baseline.favoriteAssets.join(", ") || "n/a"} with dominant buckets {profile.baseline.dominantBuckets.map(humanizeBucket).join(", ") || "n/a"}.
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950/50">
          <div className="border-b border-zinc-800 px-5 py-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Position Summary</div>
            <div className="mt-1 text-sm text-zinc-400">Live exposure across perps and HIP-3 names.</div>
          </div>
          {profile.positions.length === 0 ? (
            <div className="px-5 py-6 text-sm text-zinc-500">No open Hyperliquid positions or spot balances right now.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/35 text-left text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    <th className="px-5 py-3 font-medium">Asset</th>
                    <th className="px-4 py-3 font-medium">Market</th>
                    <th className="px-4 py-3 font-medium">Notional</th>
                    <th className="px-4 py-3 font-medium">Lev</th>
                    <th className="px-4 py-3 font-medium">Liq Dist</th>
                    <th className="px-4 py-3 font-medium">U.PnL</th>
                    <th className="px-5 py-3 font-medium">Exposure</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.positions.map((position) => {
                    const exposurePct = profile.totalOpenNotionalUsd > 0 ? Math.min((position.notionalUsd / profile.totalOpenNotionalUsd) * 100, 100) : 0;
                    return (
                      <tr key={`${position.marketType}-${position.coin}-${position.side}`} className="border-b border-zinc-800/80">
                        <td className="px-5 py-4">
                          <div className="text-sm font-medium text-zinc-100">
                            {position.coin}
                            <span className={cn("ml-2 text-xs uppercase tracking-[0.12em]", position.side === "long" ? "text-emerald-300" : "text-rose-300")}>
                              {position.side}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">{humanizeBucket(position.riskBucket)}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-zinc-400">{position.marketType === "hip3_spot" ? position.assetClass : "Perp"}</td>
                        <td className="px-4 py-4">
                          <div className="font-mono text-sm text-zinc-100">{formatUSD(position.notionalUsd)}</div>
                          <div className="mt-1 text-xs text-zinc-500">{formatUSD(position.entryPx)} entry / {formatUSD(position.markPx)} mark</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-zinc-200">{position.marketType === "hip3_spot" ? "spot" : `${position.leverage.toFixed(1)}x`}</td>
                        <td className={cn("px-4 py-4 text-sm", (position.liquidationDistancePct ?? 100) < 10 ? "text-rose-300" : "text-zinc-400")}>
                          {position.liquidationDistancePct == null ? "n/a" : formatPct(position.liquidationDistancePct)}
                        </td>
                        <td className={cn("px-4 py-4 font-mono text-sm", position.unrealizedPnl >= 0 ? "text-emerald-300" : "text-rose-300")}>
                          {formatUSD(position.unrealizedPnl)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-2 flex-1 rounded-full bg-zinc-900">
                              <div className={cn("h-2 rounded-full", position.side === "long" ? "bg-emerald-400" : "bg-rose-400")} style={{ width: `${Math.max(exposurePct, 4)}%` }} />
                            </div>
                            <div className="w-14 text-right font-mono text-xs text-zinc-400">{exposurePct.toFixed(0)}%</div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950/50">
            <div className="border-b border-zinc-800 px-5 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Grouped Trades</div>
              <div className="mt-1 text-sm text-zinc-400">Round trips grouped with HyperPulse trade logic.</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/35 text-left text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    <th className="px-5 py-3 font-medium">Asset</th>
                    <th className="px-4 py-3 font-medium">Realized P&amp;L</th>
                    <th className="px-4 py-3 font-medium">Fees</th>
                    <th className="px-4 py-3 font-medium">Funding</th>
                    <th className="px-5 py-3 font-medium text-right">Hold</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.trades.slice(0, 8).map((trade) => (
                    <tr key={trade.id} className="border-b border-zinc-800/80">
                      <td className="px-5 py-4">
                        <div className="text-sm font-medium text-zinc-100">
                          {trade.coin} <span className={cn("ml-1 text-xs uppercase tracking-[0.12em]", trade.direction === "long" ? "text-emerald-300" : "text-rose-300")}>{trade.direction}</span>
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {formatUSD(trade.notionalUsd)} · {new Date(trade.entryTime).toLocaleDateString()} to {new Date(trade.exitTime).toLocaleDateString()}
                        </div>
                      </td>
                      <td className={cn("px-4 py-4 font-mono text-sm", trade.realizedPnl >= 0 ? "text-emerald-300" : "text-rose-300")}>{formatUSD(trade.realizedPnl)}</td>
                      <td className="px-4 py-4 font-mono text-sm text-zinc-300">{formatUSD(trade.fees)}</td>
                      <td className="px-4 py-4 font-mono text-sm text-zinc-300">{formatUSD(trade.funding)}</td>
                      <td className="px-5 py-4 text-right font-mono text-sm text-zinc-300">{(trade.durationMs / (1000 * 60 * 60)).toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950/50">
            <div className="border-b border-zinc-800 px-5 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Ledger</div>
              <div className="mt-1 text-sm text-zinc-400">Deposits, withdrawals, transfers, and non-funding balance moves.</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px]">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/35 text-left text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    <th className="px-5 py-3 font-medium">Data</th>
                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.ledger.slice(0, 10).map((event) => (
                    <tr key={event.id} className="border-b border-zinc-800/80">
                      <td className="px-5 py-4">
                        <div className="text-sm font-medium text-zinc-100">{event.label}</div>
                        <div className="mt-1 text-xs text-zinc-500">{new Date(event.time).toLocaleString()}</div>
                      </td>
                      <td className={cn("px-5 py-4 text-right font-mono text-sm", event.direction === "in" ? "text-emerald-300" : event.direction === "out" ? "text-rose-300" : "text-zinc-300")}>
                        {event.direction === "out" ? "-" : event.direction === "in" ? "+" : ""}
                        {formatUSD(event.amountUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

export default function WhalesPage({ initialAddress = null }: { initialAddress?: string | null }) {
  const hasLoadedFeedRef = useRef(false);
  const selectedAddressRef = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAME_OPTIONS)[number]>("24h");
  const [severity, setSeverity] = useState<(typeof SEVERITY_OPTIONS)[number]>("all");
  const [viewFilter, setViewFilter] = useState<(typeof VIEW_FILTERS)[number]["value"]>("directional");
  const [coin, setCoin] = useState("");
  const [riskBucket, setRiskBucket] = useState("");
  const [searchAddress, setSearchAddress] = useState(initialAddress ?? "");
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<WhaleWalletProfile | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(initialAddress);
  const [watchlist, setWatchlist] = useState<WhaleWatchlistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    selectedAddressRef.current = selectedAddress;
  }, [selectedAddress]);

  useEffect(() => {
    if (!initialAddress) return;
    setSelectedAddress(initialAddress);
    setSearchAddress(initialAddress);
  }, [initialAddress]);

  useEffect(() => {
    if (!selectedAddress) return;
    const currentAddress = searchParams.get("address");
    const currentTab = searchParams.get("tab");
    if (currentAddress?.toLowerCase() === selectedAddress.toLowerCase() && currentTab === "whales") return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "whales");
    params.set("address", selectedAddress);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams, selectedAddress]);

  useEffect(() => {
    let mounted = true;

    const loadFeed = async () => {
      if (!hasLoadedFeedRef.current) {
        setFeedLoading(true);
      } else {
        setFeedRefreshing(true);
      }
      try {
        const params = new URLSearchParams({ timeframe, severity });
        if (coin.trim()) params.set("coin", coin.trim().toUpperCase());
        if (riskBucket.trim()) params.set("riskBucket", riskBucket.trim());
        if (viewFilter === "stress") params.set("directionality", "stress");
        if (viewFilter === "hip3") params.set("hip3Only", "true");
        const response = await fetch(`/api/whales/feed?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load whale feed");
        const data = (await response.json()) as FeedResponse;

        if (!mounted) return;
        hasLoadedFeedRef.current = true;

        if (viewFilter === "deposit") {
          data.alerts = data.alerts.filter((alert) => alert.eventType.startsWith("deposit-led"));
        } else if (viewFilter === "directional") {
          data.alerts = data.alerts.filter(
            (alert) => alert.directionality === "directional_entry" || alert.directionality === "directional_add" || alert.eventType.startsWith("deposit-led"),
          );
        } else if (viewFilter === "hedges") {
          data.alerts = data.alerts.filter((alert) => alert.directionality === "hedge" || alert.directionality === "rotation");
        }

        setFeed(data);
        setError((current) => (current === "Failed to load whale feed." ? null : current));
        if (!selectedAddressRef.current && data.alerts[0]) {
          setSelectedAddress(data.alerts[0].address);
        }
      } catch (loadError) {
        console.error(loadError);
        if (mounted) setError("Failed to load whale feed.");
      } finally {
        if (mounted) {
          setFeedLoading(false);
          setFeedRefreshing(false);
        }
      }
    };

    loadFeed();
    const interval = setInterval(loadFeed, 20_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [coin, riskBucket, severity, timeframe, viewFilter]);

  useEffect(() => {
    const loadWatchlist = async () => {
      try {
        const response = await fetch("/api/whales/watchlist", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { watchlist: WhaleWatchlistEntry[] };
        setWatchlist(data.watchlist);
      } catch {
        // ignore
      }
    };
    loadWatchlist();
  }, []);

  useEffect(() => {
    if (!selectedAddress) return;
    const loadProfile = async () => {
      setProfileLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/whales/profile/${selectedAddress}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load whale profile");
        const data = (await response.json()) as { profile: WhaleWalletProfile };
        setProfile(data.profile);
      } catch (loadError) {
        console.error(loadError);
        setError("Failed to load whale profile.");
      } finally {
        setProfileLoading(false);
      }
    };
    loadProfile();
  }, [selectedAddress]);

  const watchlisted = useMemo(
    () => (profile ? watchlist.find((entry) => entry.address.toLowerCase() === profile.address.toLowerCase()) ?? null : null),
    [profile, watchlist],
  );

  const selectedAlert = useMemo(
    () => (selectedAddress && feed ? feed.alerts.find((alert) => alert.address.toLowerCase() === selectedAddress.toLowerCase()) ?? null : null),
    [feed, selectedAddress],
  );

  const addWatchlist = async (address: string) => {
    const response = await fetch("/api/whales/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    if (response.ok) {
      const data = (await response.json()) as { entry: WhaleWatchlistEntry };
      setWatchlist((current) => [data.entry, ...current.filter((item) => item.address !== data.entry.address)]);
    }
  };

  const removeWatchlist = async (address: string) => {
    const response = await fetch(`/api/whales/watchlist/${address}`, { method: "DELETE" });
    if (response.ok) {
      setWatchlist((current) => current.filter((item) => item.address.toLowerCase() !== address.toLowerCase()));
    }
  };

  const onSearch = () => {
    const trimmed = searchAddress.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setError("Paste a valid Hyperliquid wallet address.");
      return;
    }
    setSelectedAddress(trimmed);
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 px-4 py-6 pb-20 md:px-6">
      <section className="rounded-2xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),linear-gradient(180deg,#13171f,#0f1319)] p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-400/80">HyperPulse Whale Tracker</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100 md:text-4xl">
              Live whale operations board for Hyperliquid perps and HIP-3 flow.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
              Scan the full tape first, then drop straight into the wallet that matters. The feed is now built for fast review instead of a tiny sidebar.
            </p>
          </div>

          <div className="grid gap-3 xl:min-w-[420px]">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Wallet lookup</div>
                <SmallPill label={feed?.workerConfigured ? workerFreshness(feed.workerStatus) : "Worker offline"} tone={feed?.workerConfigured ? "green" : "neutral"} />
              </div>
              <div className="mt-3 flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                  <input
                    value={searchAddress}
                    onChange={(event) => setSearchAddress(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && onSearch()}
                    placeholder="Paste whale wallet address"
                    className="w-full rounded-xl border border-zinc-800 bg-[#0a0c10] py-2.5 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none"
                  />
                </div>
                <button
                  onClick={onSearch}
                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200 transition hover:bg-emerald-500/15"
                >
                  Load
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {feed && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Alerts" value={feed.summary.alertCount.toString()} helper={`${timeframe} window`} icon={Activity} />
          <SummaryCard label="Wallets" value={feed.summary.uniqueWallets.toString()} helper="qualified names on tape" icon={Wallet} />
          <SummaryCard label="Directional" value={feed.summary.directionalCount.toString()} helper="entries + adds" icon={BarChart3} />
          <SummaryCard label="High Severity" value={feed.summary.highSeverityCount.toString()} helper="top priority alerts" icon={ShieldAlert} />
          <SummaryCard label="HIP-3" value={feed.summary.hip3Count.toString()} helper="spot commodities + equities" icon={Layers3} />
        </section>
      )}

      <section className="rounded-2xl border border-zinc-800 bg-[#13171f] p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {TIMEFRAME_OPTIONS.map((value) => (
              <button
                key={value}
                onClick={() => setTimeframe(value)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm transition-colors",
                  timeframe === value
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:text-zinc-200",
                )}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {VIEW_FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setViewFilter(filter.value)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm transition-colors",
                  viewFilter === filter.value
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:text-zinc-200",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as (typeof SEVERITY_OPTIONS)[number])}
              className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-300"
            >
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option === "all" ? "All severities" : option}</option>
              ))}
            </select>
            <input
              value={coin}
              onChange={(event) => setCoin(event.target.value.toUpperCase())}
              placeholder="Asset"
              className="w-24 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600"
            />
            <input
              value={riskBucket}
              onChange={(event) => setRiskBucket(event.target.value.toLowerCase().replace(/\s+/g, "_"))}
              placeholder="Bucket"
              className="w-32 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600"
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {error}
        </div>
      )}

      <WatchlistStrip watchlist={watchlist} selectedAddress={selectedAddress} onSelect={setSelectedAddress} />

      <OperationalFeed
        alerts={feed?.alerts ?? []}
        selectedAddress={selectedAddress}
        onSelect={setSelectedAddress}
        workerConfigured={feed?.workerConfigured ?? false}
        workerStatus={feed?.workerStatus ?? null}
        loading={feedLoading}
        refreshing={feedRefreshing}
      />

      <ProfilePanel
        profile={profile}
        loading={profileLoading}
        watchlisted={watchlisted}
        selectedAlert={selectedAlert}
        onAddWatchlist={addWatchlist}
        onRemoveWatchlist={removeWatchlist}
      />
    </div>
  );
}
