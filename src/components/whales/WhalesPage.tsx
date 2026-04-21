"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Copy,
  Download,
  Layers3,
  Search,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { cn, formatCompact, truncateAddress } from "@/lib/format";
import type { WhaleAlert, WhaleWatchlistEntry } from "@/types";
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
  { value: "hip3", label: "Qualified HIP-3" },
] as const;
const SEVERITY_OPTIONS = ["all", "high", "medium", "low"] as const;

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

function humanizeBucket(bucket: string) {
  return bucket.replace(/_/g, " ");
}

function formatMultipleLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "n/a";
  if (value < 0.1) return "<0.1x";
  return `${value.toFixed(1)}x`;
}

function alertTypeLabel(alert: WhaleAlert) {
  switch (alert.eventType) {
    case "deposit-led-long":
    case "deposit-led-short":
      return "Flow-led positioning";
    case "aggressive-add":
      return "Positioning add";
    case "flip":
      return "Flip";
    case "reduce":
      return "Reduce";
    case "underwater-whale":
      return "Stress";
    case "liquidation-risk":
      return "Liquidation risk";
    default:
      return alert.headline;
  }
}

function displaySide(alert: WhaleAlert) {
  if (alert.directionality === "stress") return "Stress";
  return alert.side === "short" ? "Short" : "Long";
}

function confidenceTone(confidence: WhaleAlert["conviction"]) {
  if (confidence === "high") return "green";
  if (confidence === "medium") return "amber";
  return "neutral";
}

function directionTone(alert: WhaleAlert) {
  if (alert.directionality === "stress") return "amber";
  return alert.side === "short" ? "red" : "green";
}

function severityAccent(severity: WhaleAlert["severity"]) {
  if (severity === "high") return "before:bg-rose-400";
  if (severity === "medium") return "before:bg-amber-400";
  return "before:bg-emerald-400";
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
  riskBucket: string;
  viewFilter: string;
}) {
  const params = new URLSearchParams({
    dataset: "alerts",
    timeframe: args.timeframe,
    severity: args.severity,
    viewFilter: args.viewFilter,
  });
  if (args.coin.trim()) params.set("coin", args.coin.trim());
  if (args.riskBucket.trim()) params.set("riskBucket", args.riskBucket.trim());
  return `/api/whales/export?${params.toString()}`;
}

function EmptyFeed({ workerConfigured }: { workerConfigured: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-[#13171f] p-8 text-center">
      <Activity className="mx-auto h-6 w-6 text-zinc-600" />
      <div className="mt-3 text-sm font-medium text-zinc-200">No qualified positioning alerts yet.</div>
      <div className="mt-2 text-sm leading-6 text-zinc-500">
        {workerConfigured
          ? "The worker is live, but no wallets passed the tighter quality and event thresholds in this window."
          : "The positioning monitor is ready, but the worker is offline right now."}
      </div>
    </div>
  );
}

function WalletCell({ alert }: { alert: WhaleAlert }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(alert.address);
      toast.success("Wallet copied");
    } catch {
      toast.error("Failed to copy wallet");
    }
  };

  return (
    <div className="group/wallet rounded-lg border border-transparent px-2 py-1.5 transition hover:border-zinc-800 hover:bg-zinc-950/60">
      <div className="flex items-center gap-2">
        <Link
          href={`/whales/${alert.address}?alert=${alert.id}`}
          className="font-mono text-sm text-zinc-100 transition hover:text-emerald-200"
        >
          {truncateAddress(alert.address)}
        </Link>
        <button
          type="button"
          onClick={handleCopy}
          className="text-zinc-500 transition hover:text-emerald-300 md:opacity-0 md:group-hover/wallet:opacity-100"
          title="Copy wallet"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-1 text-xs text-zinc-500">{humanizeBucket(alert.riskBucket)}</div>
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
          <div className="mt-1 text-xs text-zinc-500">Pinned wallets for direct review and CSV export.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {watchlist.slice(0, 8).map((entry) => (
            <Link
              key={entry.address}
              href={`/whales/${entry.address}`}
              className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-left transition-colors hover:border-zinc-700 hover:text-zinc-100"
            >
              <div className="text-sm font-medium text-zinc-200">{entry.nickname || truncateAddress(entry.address)}</div>
              <div className="mt-1 font-mono text-xs text-zinc-500">{truncateAddress(entry.address)}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function OperationalFeed({
  alerts,
  workerConfigured,
  workerStatus,
  loading,
  refreshing,
}: {
  alerts: WhaleAlert[];
  workerConfigured: boolean;
  workerStatus: FeedResponse["workerStatus"];
  loading: boolean;
  refreshing: boolean;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#13171f]">
      <div className="border-b border-zinc-800 px-5 py-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Operational Feed</div>
            <div className="mt-1 text-sm text-zinc-400">
              Crowding, imbalance, and squeeze context from wallets above the default +$200K 30d gate.
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
          <div className="h-16 rounded-2xl border border-zinc-800 skeleton" />
          <div className="h-16 rounded-2xl border border-zinc-800 skeleton" />
          <div className="h-16 rounded-2xl border border-zinc-800 skeleton" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="p-5">
          <EmptyFeed workerConfigured={workerConfigured} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] table-fixed">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/35 text-left text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <th className="w-[110px] px-5 py-3 font-medium">Time</th>
                <th className="w-[190px] px-4 py-3 font-medium">Wallet</th>
                <th className="w-[190px] px-4 py-3 font-medium">Alert</th>
                <th className="w-[130px] px-4 py-3 font-medium">Confidence</th>
                <th className="w-[120px] px-4 py-3 font-medium">Asset</th>
                <th className="w-[110px] px-4 py-3 font-medium">Side</th>
                <th className="w-[170px] px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Why it matters</th>
                <th className="w-[130px] px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr
                  key={alert.id}
                  className={cn(
                    "relative border-b border-zinc-800/80 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 hover:bg-zinc-950/40",
                    severityAccent(alert.severity),
                  )}
                >
                  <td className="px-5 py-3 align-top">
                    <div className="font-mono text-sm text-zinc-100">{formatAlertTimestamp(alert.timestamp)}</div>
                    <div className="mt-1 text-xs text-zinc-500">{alert.marketType === "hip3_spot" ? "Qualified HIP-3" : "Perp"}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <WalletCell alert={alert} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="text-sm font-medium text-zinc-100">{alertTypeLabel(alert)}</div>
                    <div className="mt-1 line-clamp-1 text-xs text-zinc-500">{alert.headline}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <SmallPill label={alert.conviction} tone={confidenceTone(alert.conviction)} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="text-sm font-medium text-zinc-100">{alert.coin}</div>
                    <div className="mt-1 text-xs text-zinc-500">{humanizeBucket(alert.riskBucket)}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <SmallPill label={displaySide(alert)} tone={directionTone(alert)} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-mono text-sm text-zinc-100">{formatCompact(alert.notionalUsd)}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {alert.leverage ? `${alert.leverage.toFixed(1)}x lev` : "spot"} · {formatMultipleLabel(alert.sizeVsWalletAverage)} vs avg
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="line-clamp-1 text-sm text-zinc-300">{alert.confidenceLabel}</div>
                  </td>
                  <td className="px-5 py-3 align-top">
                    <div className="flex justify-end">
                      <Link
                        href={`/whales/${alert.address}?alert=${alert.id}`}
                        className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
                      >
                        Open profile
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function WhalesPage() {
  const hasLoadedFeedRef = useRef(false);
  const router = useRouter();
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAME_OPTIONS)[number]>("24h");
  const [severity, setSeverity] = useState<(typeof SEVERITY_OPTIONS)[number]>("all");
  const [viewFilter, setViewFilter] = useState<(typeof VIEW_FILTERS)[number]["value"]>("directional");
  const [coin, setCoin] = useState("");
  const [riskBucket, setRiskBucket] = useState("");
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
        setError(null);
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

  const exportHref = useMemo(
    () => buildFeedExportHref({ timeframe, severity, coin, riskBucket, viewFilter }),
    [coin, riskBucket, severity, timeframe, viewFilter],
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
            <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-zinc-100">High-signal whale tape for crowding and imbalance.</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-300">
              Use this to spot crowded trades, squeeze setups, and positioning imbalances. It is intentionally stricter and quieter than a generic smart-money tracker.
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
          <SummaryCard label="Alerts" value={feed.summary.alertCount.toString()} helper={`${timeframe} qualified window`} icon={Activity} />
          <SummaryCard label="Wallets" value={feed.summary.uniqueWallets.toString()} helper="30d PnL above $200K" icon={Wallet} />
          <SummaryCard label="High Priority" value={feed.summary.highSeverityCount.toString()} helper="stress or outsized positioning" icon={ShieldAlert} />
          <SummaryCard label="Qualified HIP-3" value={feed.summary.hip3Count.toString()} helper="curated stocks, metals, and energy" icon={Layers3} />
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
      <OperationalFeed
        alerts={feed?.alerts ?? []}
        workerConfigured={feed?.workerConfigured ?? false}
        workerStatus={feed?.workerStatus ?? null}
        loading={feedLoading}
        refreshing={feedRefreshing}
      />

      <WatchlistStrip watchlist={watchlist} />
    </div>
  );
}
