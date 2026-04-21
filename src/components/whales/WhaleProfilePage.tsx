"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Layers3,
  Search,
  Trash2,
  Wallet,
  Waves,
} from "lucide-react";
import { cn, formatCompact, formatPct, formatUSD, truncateAddress } from "@/lib/format";
import type { WhaleAlert, WhaleWalletProfile, WhaleWatchlistEntry } from "@/types";
import toast from "react-hot-toast";

function humanizeBucket(bucket: string) {
  return bucket.replace(/_/g, " ");
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

export default function WhaleProfilePage({
  address,
  initialAlertId = null,
}: {
  address: string;
  initialAlertId?: string | null;
}) {
  const [profile, setProfile] = useState<WhaleWalletProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<WhaleWatchlistEntry[]>([]);
  const [expandedAddress, setExpandedAddress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      setProfileLoading(true);
      try {
        const response = await fetch(`/api/whales/profile/${address}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load whale profile");
        const data = (await response.json()) as { profile: WhaleWalletProfile };
        setProfile(data.profile);
        setError(null);
      } catch (loadError) {
        console.error(loadError);
        setError("Failed to load whale profile.");
      } finally {
        setProfileLoading(false);
      }
    };
    loadProfile();
  }, [address]);

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

  const watchlisted = useMemo(
    () => (profile ? watchlist.find((entry) => entry.address.toLowerCase() === profile.address.toLowerCase()) ?? null : null),
    [profile, watchlist],
  );

  const selectedAlert = useMemo(() => {
    if (!profile) return null;
    return profile.activeAlerts.find((alert) => alert.id === initialAlertId) ?? profile.activeAlerts[0] ?? null;
  }, [initialAlertId, profile]);

  const alertsExportHref = `/api/whales/export?dataset=wallet-alerts&address=${address}`;
  const episodesExportHref = `/api/whales/export?dataset=wallet-episodes&address=${address}`;

  const addWatchlist = async () => {
    if (!profile) return;
    const response = await fetch("/api/whales/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: profile.address }),
    });
    if (response.ok) {
      const data = (await response.json()) as { entry: WhaleWatchlistEntry };
      setWatchlist((current) => [data.entry, ...current.filter((item) => item.address !== data.entry.address)]);
    }
  };

  const removeWatchlist = async () => {
    if (!profile) return;
    const response = await fetch(`/api/whales/watchlist/${profile.address}`, { method: "DELETE" });
    if (response.ok) {
      setWatchlist((current) => current.filter((item) => item.address.toLowerCase() !== profile.address.toLowerCase()));
    }
  };

  const handleCopyAddress = async () => {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(profile.address);
      toast.success("Wallet copied");
    } catch {
      toast.error("Failed to copy wallet");
    }
  };

  if (profileLoading) {
    return <div className="h-[900px] rounded-2xl border border-zinc-800 skeleton" />;
  }

  if (!profile) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-[#13171f] p-8 text-center">
        <Wallet className="mx-auto h-6 w-6 text-zinc-600" />
        <div className="mt-3 text-sm font-medium text-zinc-200">Wallet profile unavailable.</div>
        <div className="mt-2 text-sm leading-6 text-zinc-500">Try another address or return to the positioning monitor.</div>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 px-4 py-6 pb-20 md:px-6">
      <section className="rounded-2xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_34%),linear-gradient(180deg,#13171f,#0f1319)] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              <Link href="/whales" className="transition hover:text-zinc-300">HyperPulse</Link>
              {" > "}Whales{" > "} {truncateAddress(profile.address)}
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-emerald-400/80">Wallet Review</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">Positioning profile for {truncateAddress(profile.address)}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SmallPill label={truncateAddress(profile.address)} tone="neutral" />
              <SmallPill label={profile.realizedPnl30d >= 200_000 ? "Main tape eligible" : "Review-only wallet"} tone={profile.realizedPnl30d >= 200_000 ? "green" : "amber"} />
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-zinc-300">
              Review this wallet as a positioning input: crowding, imbalance, pressure, and current exposure. It is not surfaced on the main tape unless it clears the stricter quality gate.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCopyAddress}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
              >
                <Copy className="h-4 w-4" />
                Copy address
              </button>
              <button
                type="button"
                onClick={() => setExpandedAddress((current) => !current)}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
              >
                {expandedAddress ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {expandedAddress ? "Hide full address" : "Show full address"}
              </button>
              <Link
                href={alertsExportHref}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
              >
                <Download className="h-4 w-4" />
                Export alerts
              </Link>
              <Link
                href={episodesExportHref}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
              >
                <Download className="h-4 w-4" />
                Export episodes
              </Link>
            </div>
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <div className="font-mono text-sm text-zinc-200">{expandedAddress ? profile.address : truncateAddress(profile.address)}</div>
              <div className="mt-1 text-xs text-zinc-500">
                First seen {profile.firstSeenAt ? new Date(profile.firstSeenAt).toLocaleString() : "n/a"}
                {" · "}
                Last seen {profile.lastSeenAt ? new Date(profile.lastSeenAt).toLocaleString() : "n/a"}
              </div>
            </div>
          </div>

          <div className="space-y-3 xl:w-[340px]">
            {watchlisted ? (
              <button
                onClick={removeWatchlist}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
              >
                <Trash2 className="h-4 w-4" />
                Remove watchlist
              </button>
            ) : (
              <button
                onClick={addWatchlist}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200 transition hover:bg-emerald-500/15"
              >
                <BookmarkPlus className="h-4 w-4" />
                Add to watchlist
              </button>
            )}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Default feed eligibility</div>
              <div className={cn("mt-2 text-sm font-medium", profile.realizedPnl30d >= 200_000 ? "text-emerald-300" : "text-amber-300")}>
                {profile.realizedPnl30d >= 200_000 ? "Visible on main tape" : "Below default +$200K 30d gate"}
              </div>
              <div className="mt-2 text-xs leading-5 text-zinc-500">
                Wallets below the default quality floor can still be reviewed directly, but they are hidden from the quieter main feed and Telegram.
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {error}
        </div>
      )}

      {selectedAlert && (
        <section className="rounded-2xl border border-zinc-800 bg-[#13171f] p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Current trigger</div>
            <div className="text-xs text-zinc-500">
              Alert context from {new Date(selectedAlert.timestamp).toLocaleString()}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SmallPill label={alertTypeLabel(selectedAlert)} tone="neutral" />
            <SmallPill label={selectedAlert.conviction} tone={selectedAlert.conviction === "high" ? "green" : selectedAlert.conviction === "medium" ? "amber" : "neutral"} />
            <SmallPill label={selectedAlert.side === "short" ? "Short" : "Long"} tone={selectedAlert.side === "short" ? "red" : "green"} />
          </div>
          <div className="mt-3 text-lg font-semibold text-zinc-100">{selectedAlert.headline}</div>
          <div className="mt-2 text-sm text-zinc-300">{selectedAlert.confidenceLabel}</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm text-zinc-400">
            <div>Size <span className="ml-2 font-mono text-zinc-100">{formatCompact(selectedAlert.notionalUsd)}</span></div>
            <div>30d PnL <span className="ml-2 font-mono text-zinc-100">{selectedAlert.walletRealizedPnl30d == null ? "n/a" : formatUSD(selectedAlert.walletRealizedPnl30d)}</span></div>
            <div>Bucket <span className="ml-2 text-zinc-100">{humanizeBucket(selectedAlert.riskBucket)}</span></div>
          </div>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard label="Total P&L" value={formatCompact(profile.realizedPnl30d)} helper="realized 30d" icon={BarChart3 as typeof Activity} tone={profile.realizedPnl30d >= 0 ? "green" : "red"} />
        <KpiCard label="30D Volume" value={formatCompact(profile.baseline.volume30d)} helper="public fills" icon={Waves as typeof Activity} />
        <KpiCard label="Equity" value={formatCompact(profile.accountEquity)} helper="perps + spot USDC" icon={Wallet as typeof Activity} />
        <KpiCard label="Open Notional" value={formatCompact(profile.totalOpenNotionalUsd)} helper={`${profile.openPositionsCount} live positions`} icon={Layers3 as typeof Activity} />
        <KpiCard label="Win Rate" value={`${profile.directionalHitRate30d.toFixed(1)}%`} helper="30d grouped trades" icon={Activity} tone={profile.directionalHitRate30d >= 50 ? "green" : "neutral"} />
        <KpiCard label="Median Size" value={formatCompact(profile.medianTradeSize30d)} helper={`${profile.avgHoldHours30d.toFixed(1)}h avg hold`} icon={Search as typeof Activity} />
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-[#13171f]">
        <div className="border-b border-zinc-800 px-5 py-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Position Summary</div>
          <div className="mt-1 text-sm text-zinc-400">Live exposure and pressure points across the book.</div>
        </div>
        {profile.positions.length === 0 ? (
          <div className="px-5 py-6 text-sm text-zinc-500">No open Hyperliquid positions or spot balances right now.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px]">
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
        <section className="rounded-2xl border border-zinc-800 bg-[#13171f]">
          <div className="border-b border-zinc-800 px-5 py-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Grouped Trades</div>
            <div className="mt-1 text-sm text-zinc-400">Closed positioning episodes with fees and funding.</div>
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
                {profile.trades.slice(0, 12).map((trade) => (
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

        <section className="rounded-2xl border border-zinc-800 bg-[#13171f]">
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
                {profile.ledger.slice(0, 12).map((event) => (
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
  );
}
