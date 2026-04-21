"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Download,
  Search,
  ShieldAlert,
  Siren,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/format";
import type { PositioningAlert, PositioningDigestRun, WhaleWatchlistEntry } from "@/types";

type FeedResponse = {
  alerts: PositioningAlert[];
  digests: PositioningDigestRun[];
  nextCursor: number | null;
  summary: {
    alertCount: number;
    uniqueAssets: number;
    crowdingCount: number;
    liquidationCount: number;
    whaleCount: number;
    highSeverityCount: number;
    topSeverity: "high" | "medium" | "low";
  };
  workerConfigured: boolean;
  workerStatus: {
    updatedAt: number;
    payload: Record<string, unknown> | null;
  } | null;
};

const TIMEFRAME_OPTIONS = ["2h", "6h", "24h", "7d"] as const;
const VIEW_FILTERS = [
  { value: "all", label: "All" },
  { value: "crowding", label: "Crowding" },
  { value: "liquidation", label: "Liquidation" },
  { value: "whale", label: "Rare whale" },
] as const;
const SEVERITY_OPTIONS = ["all", "high", "medium", "low"] as const;

function workerFreshness(workerStatus: FeedResponse["workerStatus"]) {
  if (!workerStatus?.updatedAt) return "No heartbeat";
  const deltaMs = Date.now() - workerStatus.updatedAt;
  if (deltaMs < 10_000) return "Live now";
  if (deltaMs < 60_000) return `${Math.round(deltaMs / 1000)}s ago`;
  return `${Math.round(deltaMs / 60_000)}m ago`;
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCompactUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function SmallPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
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
    <div className="rounded-2xl border border-zinc-800 bg-[#13171f] px-4 py-3">
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

function buildFeedExportHref(args: {
  timeframe: string;
  severity: string;
  coin: string;
  viewFilter: string;
}) {
  const params = new URLSearchParams({
    dataset: "positioning-alerts",
    timeframe: args.timeframe,
    severity: args.severity,
    viewFilter: args.viewFilter,
  });
  if (args.coin.trim()) params.set("coin", args.coin.trim());
  return `/api/whales/export?${params.toString()}`;
}

function alertTypeLabel(alert: PositioningAlert) {
  switch (alert.alertType) {
    case "crowding":
      return "Crowding alert";
    case "liquidation_pressure":
      return "Liquidation pressure";
    case "high_conviction_whale":
      return "Top-wallet repeat";
    default:
      return alert.alertType;
  }
}

function regimeLabel(alert: PositioningAlert) {
  switch (alert.regime) {
    case "crowded_long":
      return "Crowded long";
    case "crowded_short":
      return "Crowded short";
    case "downside_magnet":
      return "Downside magnet";
    case "upside_magnet":
      return "Upside magnet";
    case "whale_conviction":
      return "Whale conviction";
    default:
      return alert.regime;
  }
}

function severityTone(severity: PositioningAlert["severity"]) {
  if (severity === "high") return "red";
  if (severity === "medium") return "amber";
  return "neutral";
}

function EmptyFeed({ workerConfigured }: { workerConfigured: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-[#13171f] p-8 text-center">
      <Activity className="mx-auto h-6 w-6 text-zinc-600" />
      <div className="mt-3 text-sm font-medium text-zinc-200">No positioning alerts in this window.</div>
      <div className="mt-2 text-sm leading-6 text-zinc-500">
        {workerConfigured
          ? "The worker is live, but crowding, liquidation, and rare whale thresholds are keeping the tape intentionally quiet."
          : "The positioning monitor is ready, but the worker is offline right now."}
      </div>
    </div>
  );
}

function WatchlistStrip({ watchlist }: { watchlist: WhaleWatchlistEntry[] }) {
  if (watchlist.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#13171f] px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Watchlist</div>
          <div className="mt-1 text-xs text-zinc-500">Pinned wallets for conviction review and export.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {watchlist.slice(0, 8).map((entry) => (
            <Link
              key={entry.address}
              href={`/whales/${entry.address}`}
              className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-left transition-colors hover:border-zinc-700 hover:text-zinc-100"
            >
              <div className="text-sm font-medium text-zinc-200">{entry.nickname ?? entry.address.slice(0, 6)}</div>
              <div className="mt-1 font-mono text-xs text-zinc-500">
                {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentDigests({ digests }: { digests: PositioningDigestRun[] }) {
  if (digests.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#13171f] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Recent Digests</div>
          <div className="mt-1 text-sm text-zinc-400">Telegram now sends a structured market update every two hours by default.</div>
        </div>
        <Link
          href="/api/whales/export?dataset=positioning-digests"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
        >
          <Download className="h-4 w-4" />
          Export digests
        </Link>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {digests.slice(0, 3).map((digest) => (
          <div key={digest.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-zinc-100">{digest.headline}</div>
              <div className="flex items-center gap-2">
                {digest.payload?.manual ? <SmallPill label="manual preview" tone="amber" /> : null}
                <SmallPill label={digest.telegramSentAt ? "sent" : "queued"} tone={digest.telegramSentAt ? "green" : "neutral"} />
              </div>
            </div>
            <div className="mt-2 text-xs text-zinc-500">{formatTimestamp(digest.createdAt)}</div>
            <div className="mt-3 space-y-2">
              {digest.summaryLines.slice(0, 4).map((line, index) => (
                <div key={`${digest.id}-${index}`} className="text-sm text-zinc-300">
                  {line}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function WhalesPage() {
  const hasLoadedFeedRef = useRef(false);
  const router = useRouter();
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAME_OPTIONS)[number]>("24h");
  const [severity, setSeverity] = useState<(typeof SEVERITY_OPTIONS)[number]>("all");
  const [viewFilter, setViewFilter] = useState<(typeof VIEW_FILTERS)[number]["value"]>("all");
  const [coin, setCoin] = useState("");
  const [searchAddress, setSearchAddress] = useState("");
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [watchlist, setWatchlist] = useState<WhaleWatchlistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

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
        if (viewFilter === "crowding") params.set("alertType", "crowding");
        if (viewFilter === "liquidation") params.set("alertType", "liquidation_pressure");
        if (viewFilter === "whale") params.set("alertType", "high_conviction_whale");
        const response = await fetch(`/api/whales/feed?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load positioning feed");
        const data = (await response.json()) as FeedResponse;
        if (!mounted) return;
        hasLoadedFeedRef.current = true;
        setFeed(data);
        setError(null);
      } catch (loadError) {
        console.error(loadError);
        if (mounted) setError("Failed to load positioning feed.");
      } finally {
        if (mounted) {
          setFeedLoading(false);
          setFeedRefreshing(false);
        }
      }
    };

    loadFeed();
    const interval = setInterval(loadFeed, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [coin, severity, timeframe, viewFilter]);

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

  const exportHref = useMemo(
    () => buildFeedExportHref({ timeframe, severity, coin, viewFilter }),
    [coin, severity, timeframe, viewFilter],
  );

  const onSearch = () => {
    const trimmed = searchAddress.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setError("Paste a valid Hyperliquid wallet address.");
      return;
    }
    router.push(`/whales/${trimmed}`);
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 px-4 py-6 pb-20 md:px-6">
      <section className="rounded-2xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_34%),linear-gradient(180deg,#13171f,#0f1319)] p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-400/80">HyperPulse Positioning Monitor</div>
            <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-zinc-100">
              Major-perp crowding, nearby tracked-book liquidation pockets, and rare tracked-wallet repeats.
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-300">
              Research tape only: this is not a market-wide liquidation map or a copy-trading feed. Telegram is digest-first with rare interrupts when positioning gets fragile.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-[360px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <input
                value={searchAddress}
                onChange={(event) => setSearchAddress(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && onSearch()}
                placeholder="Jump to wallet profile"
                className="w-full rounded-xl border border-zinc-800 bg-[#0a0c10] py-2.5 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/30 focus:outline-none"
              />
            </div>
            <button
              onClick={onSearch}
              className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200 transition hover:bg-emerald-500/15"
            >
              Open wallet
            </button>
            <Link
              href={exportHref}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-2.5 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Link>
          </div>
        </div>
      </section>

      {feed && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Active Alerts" value={feed.summary.alertCount.toString()} helper={`${timeframe} live window`} icon={Activity} />
          <SummaryCard label="Crowding" value={feed.summary.crowdingCount.toString()} helper="major perps only" icon={Waves} />
          <SummaryCard label="Liquidation" value={feed.summary.liquidationCount.toString()} helper="nearby tracked-book pockets only" icon={Siren} />
          <SummaryCard label="Top-Wallet Repeat" value={feed.summary.whaleCount.toString()} helper="tracked-wallet repeat/timing screen" icon={ShieldAlert} />
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
                <option key={option} value={option}>
                  {option === "all" ? "All severities" : option}
                </option>
              ))}
            </select>
            <input
              value={coin}
              onChange={(event) => setCoin(event.target.value.toUpperCase())}
              placeholder="Asset"
              className="w-24 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600"
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-zinc-800 bg-[#13171f]">
        <div className="border-b border-zinc-800 px-5 py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Live Signals</div>
              <div className="mt-1 text-sm text-zinc-400">
                Market structure first: crowding and nearby tracked-book liquidation pockets, then rare tracked-wallet repeats.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SmallPill label="2h digest default" tone="neutral" />
              {feedRefreshing && <SmallPill label="Refreshing" tone="neutral" />}
              <SmallPill
                label={feed?.workerConfigured ? workerFreshness(feed.workerStatus) : "Worker offline"}
                tone={feed?.workerConfigured ? "green" : "neutral"}
              />
            </div>
          </div>
        </div>

        {feedLoading ? (
          <div className="space-y-3 p-5">
            <div className="h-16 rounded-2xl border border-zinc-800 skeleton" />
            <div className="h-16 rounded-2xl border border-zinc-800 skeleton" />
            <div className="h-16 rounded-2xl border border-zinc-800 skeleton" />
          </div>
        ) : (feed?.alerts.length ?? 0) === 0 ? (
          <div className="p-5">
            <EmptyFeed workerConfigured={feed?.workerConfigured ?? false} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] table-fixed">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/35 text-left text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <th className="w-[120px] px-5 py-3 font-medium">Time</th>
                  <th className="w-[120px] px-4 py-3 font-medium">Asset</th>
                  <th className="w-[170px] px-4 py-3 font-medium">Alert type</th>
                  <th className="w-[150px] px-4 py-3 font-medium">Regime</th>
                  <th className="px-4 py-3 font-medium">Risk path</th>
                  <th className="w-[220px] px-4 py-3 font-medium">Context</th>
                  <th className="w-[150px] px-5 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {feed?.alerts.map((alert) => {
                  const actionHref =
                    alert.alertType === "high_conviction_whale" && alert.walletAddress
                      ? `/whales/${alert.walletAddress}?alert=${alert.id}`
                      : `/?tab=markets&asset=${alert.asset}`;
                  const actionLabel = alert.alertType === "high_conviction_whale" ? "Open wallet" : "Open market";

                  return (
                    <tr key={alert.id} className="border-b border-zinc-800/80 hover:bg-zinc-950/40">
                      <td className="px-5 py-3 align-top">
                        <div className="font-mono text-sm text-zinc-100">{formatTimestamp(alert.timestamp)}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-sm font-medium text-zinc-100">{alert.asset}</div>
                        <div className="mt-1 text-xs text-zinc-500">{alert.marketType === "hip3_spot" ? "Qualified HIP-3" : "Perp"}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-sm font-medium text-zinc-100">{alertTypeLabel(alert)}</div>
                        <div className="mt-2">
                          <SmallPill label={alert.severity} tone={severityTone(alert.severity)} />
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-sm text-zinc-200">{regimeLabel(alert)}</div>
                        {alert.walletLabel && (
                          <div className="mt-1 text-xs text-zinc-500">
                            {alert.walletLabel}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-sm text-zinc-300">{alert.whyItMatters}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="space-y-1 text-xs text-zinc-500">
                          {alert.fundingApr != null && <div>Funding: {formatPct(alert.fundingApr)}</div>}
                          {alert.oiChange1h != null && <div>OI 1h: {formatPct(alert.oiChange1h)}</div>}
                          {alert.oiChange4h != null && <div>OI 4h: {formatPct(alert.oiChange4h)}</div>}
                          {alert.trackedLiquidationClusterUsd != null && (
                            <div>
                              Tracked book: {formatCompactUsd(alert.trackedLiquidationClusterUsd)}
                              {alert.clusterPrice != null ? ` near ${alert.clusterPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ""}
                            </div>
                          )}
                          {alert.clusterDistancePct != null && <div>Distance: {formatPct(alert.clusterDistancePct)}</div>}
                          {alert.basisBps != null && <div>Basis: {alert.basisBps.toFixed(0)} bps</div>}
                          {alert.repeatedAdds6h != null && <div>Repeated adds: {alert.repeatedAdds6h} in 6h</div>}
                        </div>
                      </td>
                      <td className="px-5 py-3 align-top">
                        <div className="flex justify-end">
                          <Link
                            href={actionHref}
                            className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
                          >
                            {actionLabel}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
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

      <RecentDigests digests={feed?.digests ?? []} />

      <WatchlistStrip watchlist={watchlist} />
    </div>
  );
}
