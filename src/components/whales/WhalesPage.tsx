"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
  { value: "deposit", label: "Deposit-led" },
  { value: "stress", label: "Stress" },
  { value: "hedges", label: "Hedges" },
  { value: "hip3", label: "HIP-3" },
] as const;
const SEVERITY_OPTIONS = ["all", "high", "medium", "low"] as const;

function humanizeBucket(bucket: string) {
  return bucket.replace(/_/g, " ");
}

function workerFreshness(workerStatus: FeedResponse["workerStatus"]) {
  if (!workerStatus?.updatedAt) return "No heartbeat";
  const deltaMs = Date.now() - workerStatus.updatedAt;
  if (deltaMs < 10_000) return "Live now";
  if (deltaMs < 60_000) return `${Math.round(deltaMs / 1000)}s ago`;
  return `${Math.round(deltaMs / 60_000)}m ago`;
}

function formatMultipleLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "n/a";
  if (value < 0.1) return "<0.1x";
  return `${value.toFixed(1)}x`;
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
  icon: typeof Waves;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[linear-gradient(180deg,rgba(12,17,16,0.98),rgba(10,12,12,0.96))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-zinc-100">{value}</div>
          <div className="mt-1 text-xs text-zinc-500">{helper}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/8 p-2 text-emerald-300">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function SmallPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "green" | "amber" | "red" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em]",
        tone === "green" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
        tone === "amber" && "border-amber-500/20 bg-amber-500/10 text-amber-300",
        tone === "red" && "border-red-500/20 bg-red-500/10 text-red-300",
        tone === "neutral" && "border-zinc-700 bg-zinc-950/70 text-zinc-400",
      )}
    >
      {label}
    </span>
  );
}

function SeverityChip({ severity }: { severity: WhaleAlert["severity"] }) {
  return <SmallPill label={severity} tone={severity === "high" ? "red" : severity === "medium" ? "amber" : "neutral"} />;
}

function ConvictionChip({ conviction }: { conviction: WhaleAlert["conviction"] }) {
  return <SmallPill label={`${conviction} conviction`} tone={conviction === "high" ? "green" : conviction === "medium" ? "amber" : "neutral"} />;
}

function MarketChip({ alert }: { alert: WhaleAlert }) {
  const label = alert.marketType === "hip3_spot" ? `HIP-3 · ${alert.assetClass}` : `Perp · ${alert.assetClass}`;
  return <SmallPill label={label} tone={alert.marketType === "hip3_spot" ? "amber" : "neutral"} />;
}

function AlertFeedItem({
  alert,
  active,
  onSelect,
}: {
  alert: WhaleAlert;
  active: boolean;
  onSelect: () => void;
}) {
  const handleCopyAddress = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(alert.address);
      toast.success("Whale wallet copied");
    } catch {
      toast.error("Failed to copy whale wallet");
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group w-full rounded-2xl border p-4 text-left transition-all",
        active
          ? "border-emerald-500/30 bg-emerald-500/[0.07] shadow-[0_0_0_1px_rgba(16,185,129,0.10)]"
          : "border-zinc-800 bg-[linear-gradient(180deg,rgba(14,17,17,0.96),rgba(12,13,14,0.94))] hover:border-zinc-700 hover:bg-zinc-900",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityChip severity={alert.severity} />
            <ConvictionChip conviction={alert.conviction} />
            <MarketChip alert={alert} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
            <span className="inline-flex items-center gap-2 rounded-full border border-transparent px-2 py-1 transition group-hover:border-zinc-800 group-hover:bg-zinc-950/60">
              <span title={alert.address}>{truncateAddress(alert.address)}</span>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="opacity-70 transition hover:text-emerald-300 group-hover:opacity-100"
                title="Copy full wallet address"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </span>
            <span>·</span>
            <span>{humanizeBucket(alert.riskBucket)}</span>
            <span>·</span>
            <span>{new Date(alert.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          </div>
          <div className="mt-2 text-sm font-semibold text-zinc-100">{alert.headline}</div>
          <div className="mt-2 text-xs leading-5 text-zinc-400">{alert.evidence.summary}</div>
        </div>
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-500 sm:grid-cols-4">
        <div>
          <div className="uppercase tracking-[0.14em] text-zinc-600">Notional</div>
          <div className="mt-1 text-zinc-200">{formatCompact(alert.notionalUsd)}</div>
        </div>
        <div>
          <div className="uppercase tracking-[0.14em] text-zinc-600">Size vs avg</div>
          <div className="mt-1 text-zinc-200">{formatMultipleLabel(alert.sizeVsWalletAverage)}</div>
        </div>
        <div>
          <div className="uppercase tracking-[0.14em] text-zinc-600">Offset</div>
          <div className="mt-1 text-zinc-200">{(alert.offsetRatio * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div className="uppercase tracking-[0.14em] text-zinc-600">24h flow</div>
          <div className={cn("mt-1", alert.netFlow24hUsd >= 0 ? "text-emerald-300" : "text-red-300")}>
            {formatCompact(alert.netFlow24hUsd)}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyFeed({ workerConfigured }: { workerConfigured: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 p-6 text-center">
      <Activity className="mx-auto h-6 w-6 text-zinc-600" />
      <div className="mt-3 text-sm font-medium text-zinc-200">No whale alerts yet.</div>
      <div className="mt-2 text-sm leading-6 text-zinc-500">
        {workerConfigured
          ? "The worker is live, but nothing has crossed the directional-flow thresholds in the selected window yet."
          : "The Whales tab is ready. Add Neon + the Railway worker to persist live whale episodes into this feed."}
      </div>
    </div>
  );
}

function EvidenceCard({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-3 text-lg font-semibold text-zinc-100">{title}</div>
      <div className="mt-2 text-sm leading-6 text-zinc-400">{detail}</div>
    </div>
  );
}

function ProfilePanel({
  profile,
  loading,
  watchlisted,
  onAddWatchlist,
  onRemoveWatchlist,
}: {
  profile: WhaleWalletProfile | null;
  loading: boolean;
  watchlisted: WhaleWatchlistEntry | null;
  onAddWatchlist: (address: string) => Promise<void>;
  onRemoveWatchlist: (address: string) => Promise<void>;
}) {
  if (loading) {
    return <div className="h-[900px] rounded-2xl border border-zinc-800 skeleton" />;
  }

  if (!profile) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-center">
        <Wallet className="mx-auto h-6 w-6 text-zinc-600" />
        <div className="mt-3 text-sm font-medium text-zinc-200">Select an alert or search a wallet.</div>
        <div className="mt-2 text-sm leading-6 text-zinc-500">
          The right pane becomes a research-grade whale profile with positions, directional episodes, grouped trades, ledger flow, and bucket exposures.
        </div>
      </div>
    );
  }

  const howGood =
    profile.realizedPnl30d > 0 && profile.directionalHitRate30d >= 55
      ? "Profitable and consistent"
      : profile.realizedPnl30d > 0
        ? "Profitable, still noisy"
        : "Needs confirmation";
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
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_32%),linear-gradient(180deg,rgba(12,17,16,0.98),rgba(10,12,12,0.96))] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.30)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-emerald-400/80">Whale Profile</span>
              {profile.styleTags.map((tag) => (
                <SmallPill key={tag} label={tag} tone="green" />
              ))}
              {profile.focusTags.map((tag) => (
                <SmallPill key={tag} label={tag} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold tracking-tight text-zinc-100">{truncateAddress(profile.address)}</h2>
              <button
                onClick={handleCopyAddress}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-300 transition hover:border-emerald-500/30 hover:text-white"
                title="Copy full wallet address"
              >
                <Copy className="h-4 w-4" />
                Copy address
              </button>
            </div>
            <button
              onClick={handleCopyAddress}
              className="mt-3 flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] px-4 py-3 text-left transition hover:border-emerald-500/30 hover:bg-emerald-500/[0.08]"
              title="Click to copy full wallet address"
            >
              <span className="min-w-0 break-all font-mono text-sm text-emerald-100">{profile.address}</span>
              <Copy className="h-4 w-4 shrink-0 text-emerald-300" />
            </button>
            <div className="mt-2 text-sm text-zinc-400">
              First seen {profile.firstSeenAt ? new Date(profile.firstSeenAt).toLocaleString() : "n/a"}
              {" · "}
              Last seen {profile.lastSeenAt ? new Date(profile.lastSeenAt).toLocaleString() : "n/a"}
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300">{profile.narrative}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {watchlisted ? (
              <button
                onClick={() => onRemoveWatchlist(profile.address)}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-300 hover:text-white"
              >
                <Trash2 className="h-4 w-4" />
                Remove watchlist
              </button>
            ) : (
              <button
                onClick={() => onAddWatchlist(profile.address)}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/15"
              >
                <BookmarkPlus className="h-4 w-4" />
                Add to watchlist
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard label="Total P&L" value={formatCompact(profile.realizedPnl30d)} helper="realized 30d" icon={BarChart3} />
          <SummaryCard label="30d Volume" value={formatCompact(profile.baseline.volume30d)} helper="public fills" icon={Waves} />
          <SummaryCard label="Equity" value={formatCompact(profile.accountEquity)} helper="perps + spot USDC" icon={Wallet} />
          <SummaryCard label="Open Notional" value={formatCompact(profile.totalOpenNotionalUsd)} helper={`${profile.openPositionsCount} live positions`} icon={Layers3} />
          <SummaryCard label="Win Rate" value={`${profile.directionalHitRate30d.toFixed(1)}%`} helper="30d grouped trades" icon={Activity} />
          <SummaryCard label="Median Size" value={formatCompact(profile.medianTradeSize30d)} helper={`${profile.avgHoldHours30d.toFixed(1)}h avg hold`} icon={Database} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <EvidenceCard
          label="How Good"
          title={howGood}
          detail={`Win rate ${profile.directionalHitRate30d.toFixed(1)}% · realized ${formatUSD(profile.realizedPnl30d)} over the last 30 days.`}
        />
        <EvidenceCard
          label="Style"
          title={styleTitle}
          detail={`Median size ${formatCompact(profile.medianTradeSize30d)} · avg hold ${profile.avgHoldHours30d.toFixed(1)}h · avg leverage ${profile.averageLeverage.toFixed(1)}x.`}
        />
        <EvidenceCard
          label="Focus"
          title={focusTitle}
          detail={`Favorite assets ${profile.baseline.favoriteAssets.join(", ") || "n/a"} · dominant buckets ${profile.baseline.dominantBuckets.map(humanizeBucket).join(", ") || "n/a"}.`}
        />
      </section>

      {profile.activeAlerts.length > 0 && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Recent directional episodes</div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {profile.activeAlerts.slice(0, 4).map((alert) => (
              <div key={alert.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <ConvictionChip conviction={alert.conviction} />
                  <SeverityChip severity={alert.severity} />
                  <SmallPill label={alert.marketType === "hip3_spot" ? "HIP-3" : "Perp"} tone="neutral" />
                </div>
                <div className="mt-3 text-sm font-semibold text-zinc-100">{alert.headline}</div>
                <div className="mt-2 text-xs leading-5 text-zinc-400">{alert.evidence.summary}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-500">
                  <div>Notional <span className="block text-zinc-200">{formatCompact(alert.notionalUsd)}</span></div>
                  <div>Size vs avg <span className="block text-zinc-200">{alert.sizeVsWalletAverage.toFixed(1)}x</span></div>
                  <div>Bucket <span className="block text-zinc-200">{humanizeBucket(alert.riskBucket)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Open Positions</div>
              <div className="mt-1 text-sm text-zinc-400">Live exposure across perps and HIP-3 names.</div>
            </div>
            <div className="text-xs text-zinc-500">{profile.openPositionsCount} positions</div>
          </div>
          {profile.positions.length === 0 ? (
            <div className="mt-4 text-sm text-zinc-500">No open Hyperliquid positions or spot balances right now.</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                    <th className="px-3 py-2 font-medium">Asset</th>
                    <th className="px-3 py-2 font-medium">Market</th>
                    <th className="px-3 py-2 font-medium">Bucket</th>
                    <th className="px-3 py-2 font-medium">Notional</th>
                    <th className="px-3 py-2 font-medium">Entry / Mark</th>
                    <th className="px-3 py-2 font-medium">Lev</th>
                    <th className="px-3 py-2 font-medium">Liq Dist.</th>
                    <th className="px-3 py-2 font-medium">U.PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.positions.map((position) => (
                    <tr key={`${position.marketType}-${position.coin}-${position.side}`} className="border-b border-zinc-800/60">
                      <td className="px-3 py-3 font-medium text-zinc-100">
                        {position.coin}
                        <span className={cn("ml-2 text-xs", position.side === "long" ? "text-emerald-300" : "text-red-300")}>
                          {position.side}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-zinc-400">{position.marketType === "hip3_spot" ? position.assetClass : "Perp"}</td>
                      <td className="px-3 py-3 text-zinc-400">{humanizeBucket(position.riskBucket)}</td>
                      <td className="px-3 py-3 text-zinc-200">{formatUSD(position.notionalUsd)}</td>
                      <td className="px-3 py-3 text-zinc-400">{formatUSD(position.entryPx)} / {formatUSD(position.markPx)}</td>
                      <td className="px-3 py-3 text-zinc-200">{position.marketType === "hip3_spot" ? "spot" : `${position.leverage.toFixed(1)}x`}</td>
                      <td className={cn("px-3 py-3", (position.liquidationDistancePct ?? 100) < 10 ? "text-red-300" : "text-zinc-400")}>
                        {position.liquidationDistancePct == null ? "n/a" : formatPct(position.liquidationDistancePct)}
                      </td>
                      <td className={cn("px-3 py-3", position.unrealizedPnl >= 0 ? "text-emerald-300" : "text-red-300")}>
                        {formatUSD(position.unrealizedPnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Bucket Exposures</div>
          <div className="mt-1 text-sm text-zinc-400">Net stance by risk bucket, so we can separate conviction from hedging.</div>
          <div className="mt-4 space-y-3">
            {profile.bucketExposures.length === 0 ? (
              <div className="text-sm text-zinc-500">No meaningful bucket exposure yet.</div>
            ) : (
              profile.bucketExposures.map((bucket) => (
                <div key={bucket.bucket} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">{humanizeBucket(bucket.bucket)}</div>
                      <div className="mt-1 text-xs text-zinc-500">Long {formatCompact(bucket.longNotionalUsd)} · Short {formatCompact(bucket.shortNotionalUsd)}</div>
                    </div>
                    <div className={cn("text-sm font-semibold", bucket.netNotionalUsd >= 0 ? "text-emerald-300" : "text-red-300")}>
                      {bucket.netNotionalUsd >= 0 ? "+" : "-"}{formatCompact(Math.abs(bucket.netNotionalUsd))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Grouped Trades</div>
              <div className="mt-1 text-sm text-zinc-400">Round trips grouped with HyperPulse’s trade logic.</div>
            </div>
            <div className="text-xs text-zinc-500">{profile.trades.length} trades</div>
          </div>
          <div className="mt-4 space-y-3">
            {profile.trades.slice(0, 8).map((trade) => (
              <div key={trade.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-100">{trade.coin} {trade.direction}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {new Date(trade.entryTime).toLocaleDateString()} → {new Date(trade.exitTime).toLocaleDateString()}
                    </div>
                  </div>
                  <div className={cn("text-sm font-semibold", trade.realizedPnl >= 0 ? "text-emerald-300" : "text-red-300")}>
                    {formatUSD(trade.realizedPnl)}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-zinc-500">
                  <div>Notional <span className="block text-zinc-200">{formatCompact(trade.notionalUsd)}</span></div>
                  <div>Fees <span className="block text-zinc-200">{formatUSD(trade.fees)}</span></div>
                  <div>Funding <span className="block text-zinc-200">{formatUSD(trade.funding)}</span></div>
                  <div>Hold <span className="block text-zinc-200">{(trade.durationMs / (1000 * 60 * 60)).toFixed(1)}h</span></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Ledger</div>
          <div className="mt-1 text-sm text-zinc-400">Deposits, withdrawals, transfers, and non-funding balance moves.</div>
          <div className="mt-4 space-y-2">
            {profile.ledger.slice(0, 10).map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-zinc-100">{event.label}</div>
                  <div className="mt-1 text-xs text-zinc-500">{new Date(event.time).toLocaleString()}</div>
                </div>
                <div className={cn(event.direction === "in" ? "text-emerald-300" : event.direction === "out" ? "text-red-300" : "text-zinc-400")}>
                  {event.direction === "out" ? "-" : event.direction === "in" ? "+" : ""}
                  {formatUSD(event.amountUsd)}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function WhalesPage() {
  const hasLoadedFeedRef = useRef(false);
  const selectedAddressRef = useRef<string | null>(null);
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAME_OPTIONS)[number]>("24h");
  const [severity, setSeverity] = useState<(typeof SEVERITY_OPTIONS)[number]>("all");
  const [viewFilter, setViewFilter] = useState<(typeof VIEW_FILTERS)[number]["value"]>("directional");
  const [coin, setCoin] = useState("");
  const [riskBucket, setRiskBucket] = useState("");
  const [searchAddress, setSearchAddress] = useState("");
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<WhaleWalletProfile | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WhaleWatchlistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    selectedAddressRef.current = selectedAddress;
  }, [selectedAddress]);

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
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 pb-20">
      <section className="rounded-2xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_30%),linear-gradient(180deg,rgba(12,17,16,0.98),rgba(10,12,12,0.96))] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-400/80">Whales</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">
              Track directional whale flow across crypto and HIP-3, then inspect the wallet behind it.
            </h1>
            <p className="mt-3 text-sm leading-7 text-zinc-300">
              HyperPulse classifies large Hyperliquid moves as directional entries, hedges, rotations, or stress. The goal is simple: surface real conviction, demote noise, and let you see which buckets whales are actually pressing.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 xl:min-w-[380px]">
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
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-2.5 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none"
                />
              </div>
              <button
                onClick={onSearch}
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200 hover:bg-emerald-500/15"
              >
                Load
              </button>
            </div>
          </div>
        </div>
      </section>

      {feed && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Alerts" value={feed.summary.alertCount.toString()} helper={`${timeframe} window`} icon={Activity} />
          <SummaryCard label="Directional" value={feed.summary.directionalCount.toString()} helper="entries + adds" icon={BarChart3} />
          <SummaryCard label="Deposit-led" value={feed.summary.depositLedCount.toString()} helper="net inflow episodes" icon={Database} />
          <SummaryCard label="Hedges" value={feed.summary.hedgeCount.toString()} helper="overlay + rotation" icon={ShieldAlert} />
          <SummaryCard label="HIP-3" value={feed.summary.hip3Count.toString()} helper="spot stocks, oil, commodities" icon={Layers3} />
        </section>
      )}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-4">
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

      <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-4">
          {watchlist.length > 0 && (
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Watchlist</div>
              <div className="mt-3 space-y-2">
                {watchlist.slice(0, 6).map((entry) => (
                  <button
                    key={entry.address}
                    onClick={() => setSelectedAddress(entry.address)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2.5 text-left hover:border-zinc-700"
                  >
                    <div>
                      <div className="text-sm font-medium text-zinc-100">{entry.nickname || truncateAddress(entry.address)}</div>
                      <div className="mt-1 text-xs text-zinc-500">{truncateAddress(entry.address)}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-zinc-600" />
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Alert Feed</div>
                <div className="mt-1 text-sm text-zinc-400">Directional flow episodes with hedge suppression and HIP-3 context.</div>
              </div>
              {feed?.workerConfigured ? (
                <SmallPill label={workerFreshness(feed.workerStatus)} tone="green" />
              ) : (
                <SmallPill label="Worker offline" tone="neutral" />
              )}
            </div>
            {feedRefreshing && (
              <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                Refreshing…
              </div>
            )}
            <div className="mt-4 space-y-3">
              {feedLoading ? (
                <div className="space-y-3">
                  <div className="h-36 rounded-2xl border border-zinc-800 skeleton" />
                  <div className="h-36 rounded-2xl border border-zinc-800 skeleton" />
                </div>
              ) : feed && feed.alerts.length > 0 ? (
                feed.alerts.map((alert) => (
                  <AlertFeedItem
                    key={alert.id}
                    alert={alert}
                    active={selectedAddress?.toLowerCase() === alert.address.toLowerCase()}
                    onSelect={() => setSelectedAddress(alert.address)}
                  />
                ))
              ) : (
                <EmptyFeed workerConfigured={feed?.workerConfigured ?? false} />
              )}
            </div>
          </section>
        </div>

        <ProfilePanel
          profile={profile}
          loading={profileLoading}
          watchlisted={watchlisted}
          onAddWatchlist={addWatchlist}
          onRemoveWatchlist={removeWatchlist}
        />
      </div>
    </div>
  );
}
