"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Database,
  Search,
  ShieldAlert,
  Waves,
  Wallet,
  BookmarkPlus,
  Trash2,
} from "lucide-react";
import { cn, formatCompact, formatPct, formatUSD, truncateAddress } from "@/lib/format";
import type { WhaleAlert, WhaleWalletProfile, WhaleWatchlistEntry } from "@/types";

type FeedResponse = {
  alerts: WhaleAlert[];
  nextCursor: number | null;
  summary: {
    alertCount: number;
    uniqueWallets: number;
    depositLedCount: number;
    highSeverityCount: number;
    topSeverity: "high" | "medium" | "low";
  };
  workerConfigured: boolean;
};

const TIMEFRAME_OPTIONS = ["1h", "6h", "24h", "7d"] as const;
const EVENT_OPTIONS = [
  { value: "all", label: "All events" },
  { value: "deposit-led-long", label: "Deposit-led long" },
  { value: "deposit-led-short", label: "Deposit-led short" },
  { value: "aggressive-add", label: "Aggressive add" },
  { value: "flip", label: "Flip" },
  { value: "reduce", label: "Reduce" },
  { value: "underwater-whale", label: "Underwater whale" },
  { value: "liquidation-risk", label: "Liquidation risk" },
] as const;
const SEVERITY_OPTIONS = ["all", "high", "medium", "low"] as const;

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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-zinc-100">{value}</div>
          <div className="mt-1 text-xs text-zinc-500">{helper}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-2 text-teal-300">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function SeverityChip({ severity }: { severity: WhaleAlert["severity"] }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
        severity === "high"
          ? "border-red-500/30 bg-red-500/10 text-red-300"
          : severity === "medium"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
            : "border-zinc-700 bg-zinc-800/80 text-zinc-400",
      )}
    >
      {severity}
    </span>
  );
}

function TagPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
      {label}
    </span>
  );
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
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full rounded-2xl border p-4 text-left transition-all",
        active
          ? "border-teal-500/30 bg-teal-500/[0.07] shadow-[0_0_0_1px_rgba(45,212,191,0.1)]"
          : "border-zinc-800 bg-zinc-900/70 hover:border-zinc-700 hover:bg-zinc-900",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityChip severity={alert.severity} />
            <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              {alert.coin} · {truncateAddress(alert.address)}
            </span>
          </div>
          <div className="mt-2 text-sm font-semibold text-zinc-100">{alert.headline}</div>
          <div className="mt-2 text-xs leading-5 text-zinc-400">{alert.detail}</div>
        </div>
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500 sm:grid-cols-4">
        <div>
          <div className="uppercase tracking-[0.14em] text-zinc-600">Notional</div>
          <div className="mt-1 text-zinc-200">{formatCompact(alert.notionalUsd)}</div>
        </div>
        <div>
          <div className="uppercase tracking-[0.14em] text-zinc-600">24h flow</div>
          <div className={cn("mt-1", alert.netFlow24hUsd >= 0 ? "text-emerald-300" : "text-red-300")}>
            {formatCompact(alert.netFlow24hUsd)}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-[0.14em] text-zinc-600">Leverage</div>
          <div className="mt-1 text-zinc-200">{alert.leverage ? `${alert.leverage.toFixed(1)}x` : "n/a"}</div>
        </div>
        <div>
          <div className="uppercase tracking-[0.14em] text-zinc-600">Seen</div>
          <div className="mt-1 text-zinc-200">
            {new Date(alert.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </div>
        </div>
      </div>
    </button>
  );
}

function EmptyFeed({ workerConfigured }: { workerConfigured: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 p-6 text-center">
      <Activity className="mx-auto h-6 w-6 text-zinc-600" />
      <div className="mt-3 text-sm font-medium text-zinc-200">No whale alerts yet.</div>
      <div className="mt-2 text-sm leading-6 text-zinc-500">
        {workerConfigured
          ? "The worker is configured, but nothing has crossed the unusual-flow thresholds in the selected window yet."
          : "The app-side tab is ready. Add Neon + the Railway worker to start persisting live whale episodes into this feed."}
      </div>
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
    return <div className="h-[720px] rounded-2xl border border-zinc-800 skeleton" />;
  }

  if (!profile) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-center">
        <Wallet className="mx-auto h-6 w-6 text-zinc-600" />
        <div className="mt-3 text-sm font-medium text-zinc-200">Select an alert or search a wallet.</div>
        <div className="mt-2 text-sm leading-6 text-zinc-500">
          The right pane becomes a research-grade whale profile with positions, trade history, ledger flow, and behavior tags.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-teal-950/20 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">Whale Profile</span>
              {profile.behaviorTags.map((tag) => (
                <TagPill key={tag} label={tag} />
              ))}
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
              {truncateAddress(profile.address)}
            </h2>
            <div className="mt-2 text-sm text-zinc-400">
              First seen {profile.firstSeenAt ? new Date(profile.firstSeenAt).toLocaleString() : "n/a"}
              {" · "}
              Last seen {profile.lastSeenAt ? new Date(profile.lastSeenAt).toLocaleString() : "n/a"}
            </div>
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
                className="inline-flex items-center gap-2 rounded-xl border border-teal-500/20 bg-teal-500/10 px-3 py-2 text-sm text-teal-200 hover:bg-teal-500/15"
              >
                <BookmarkPlus className="h-4 w-4" />
                Add to watchlist
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Account Equity" value={formatCompact(profile.accountEquity)} helper="Perps + spot USDC" icon={Wallet} />
          <SummaryCard label="Open Notional" value={formatCompact(profile.totalOpenNotionalUsd)} helper={`${profile.openPositionsCount} live positions`} icon={Waves} />
          <SummaryCard label="Unrealized" value={formatCompact(profile.unrealizedPnl)} helper={`Funding 30d ${formatCompact(profile.funding30d)}`} icon={AlertTriangle} />
          <SummaryCard label="Net 24h Flow" value={formatCompact(profile.netFlow24hUsd)} helper={`30d realized ${formatCompact(profile.realizedPnl30d)}`} icon={Database} />
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Open Positions</div>
        {profile.positions.length === 0 ? (
          <div className="mt-3 text-sm text-zinc-500">No open positions on Hyperliquid right now.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  <th className="px-3 py-2 font-medium">Asset</th>
                  <th className="px-3 py-2 font-medium">Side</th>
                  <th className="px-3 py-2 font-medium">Notional</th>
                  <th className="px-3 py-2 font-medium">Entry / Mark</th>
                  <th className="px-3 py-2 font-medium">Leverage</th>
                  <th className="px-3 py-2 font-medium">Liq Dist.</th>
                  <th className="px-3 py-2 font-medium">U.PnL</th>
                </tr>
              </thead>
              <tbody>
                {profile.positions.map((position) => (
                  <tr key={`${position.coin}-${position.side}`} className="border-b border-zinc-800/70">
                    <td className="px-3 py-3 font-medium text-zinc-100">{position.coin}</td>
                    <td className={cn("px-3 py-3", position.side === "long" ? "text-emerald-300" : "text-red-300")}>
                      {position.side}
                    </td>
                    <td className="px-3 py-3 text-zinc-200">{formatUSD(position.notionalUsd)}</td>
                    <td className="px-3 py-3 text-zinc-400">
                      {formatUSD(position.entryPx)} / {formatUSD(position.markPx)}
                    </td>
                    <td className="px-3 py-3 text-zinc-200">{position.leverage.toFixed(1)}x</td>
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

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Recent Trades</div>
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
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-500">
                  <div>Notional <span className="block text-zinc-200">{formatCompact(trade.notionalUsd)}</span></div>
                  <div>Fees <span className="block text-zinc-200">{formatUSD(trade.fees)}</span></div>
                  <div>Funding <span className="block text-zinc-200">{formatUSD(trade.funding)}</span></div>
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
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAME_OPTIONS)[number]>("24h");
  const [severity, setSeverity] = useState<(typeof SEVERITY_OPTIONS)[number]>("all");
  const [eventType, setEventType] = useState<(typeof EVENT_OPTIONS)[number]["value"]>("all");
  const [coin, setCoin] = useState("");
  const [searchAddress, setSearchAddress] = useState("");
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<WhaleWalletProfile | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WhaleWatchlistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFeed = async () => {
      setFeedLoading(true);
      try {
        const params = new URLSearchParams({ timeframe, severity, eventType });
        if (coin.trim()) params.set("coin", coin.trim().toUpperCase());
        const response = await fetch(`/api/whales/feed?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load whale feed");
        const data = (await response.json()) as FeedResponse;
        setFeed(data);
        if (!selectedAddress && data.alerts[0]) {
          setSelectedAddress(data.alerts[0].address);
        }
      } catch (loadError) {
        console.error(loadError);
        setError("Failed to load whale feed.");
      } finally {
        setFeedLoading(false);
      }
    };

    loadFeed();
    const interval = setInterval(loadFeed, 20_000);
    return () => clearInterval(interval);
  }, [coin, eventType, severity, timeframe, selectedAddress]);

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
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20 space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-teal-950/20 p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">Whales</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">
              Monitor unusual Hyperliquid flow, then drill into the wallet behind it.
            </h1>
            <p className="mt-3 text-sm leading-7 text-zinc-300">
              HyperPulse watches for deposit-led positioning, aggressive adds, underwater whales, and liquidation risk — then turns the address into a profile with positions, ledger flow, and recent trade history.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 xl:min-w-[360px]">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Wallet lookup</div>
            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  value={searchAddress}
                  onChange={(event) => setSearchAddress(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && onSearch()}
                  placeholder="Paste whale wallet address"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-2.5 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-teal-500/30 focus:outline-none"
                />
              </div>
              <button
                onClick={onSearch}
                className="rounded-xl border border-teal-500/20 bg-teal-500/10 px-4 py-2.5 text-sm text-teal-200 hover:bg-teal-500/15"
              >
                Load
              </button>
            </div>
          </div>
        </div>
      </section>

      {feed && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Alerts" value={feed.summary.alertCount.toString()} helper={`${timeframe} window`} icon={Activity} />
          <SummaryCard label="Wallets" value={feed.summary.uniqueWallets.toString()} helper="unique whales in feed" icon={Wallet} />
          <SummaryCard label="Deposit-led" value={feed.summary.depositLedCount.toString()} helper="alerts tied to net inflow" icon={Database} />
          <SummaryCard label="High severity" value={feed.summary.highSeverityCount.toString()} helper={`Top severity ${feed.summary.topSeverity}`} icon={ShieldAlert} />
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
                    ? "border-teal-500/30 bg-teal-500/10 text-teal-200"
                    : "border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:text-zinc-200",
                )}
              >
                {value}
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
            <select
              value={eventType}
              onChange={(event) => setEventType(event.target.value as (typeof EVENT_OPTIONS)[number]["value"])}
              className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-300"
            >
              {EVENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              value={coin}
              onChange={(event) => setCoin(event.target.value.toUpperCase())}
              placeholder="Coin"
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
                <div className="mt-1 text-sm text-zinc-400">Live unusual-flow episodes for Hyperliquid whales.</div>
              </div>
              {feed?.workerConfigured ? (
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-300">
                  Worker live
                </span>
              ) : (
                <span className="rounded-full border border-zinc-700 bg-zinc-950/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  Worker not configured
                </span>
              )}
            </div>
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
