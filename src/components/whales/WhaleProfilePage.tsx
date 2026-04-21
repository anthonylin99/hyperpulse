"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Layers3,
  Radar,
  Target,
  Trash2,
  Wallet,
  Waves,
} from "lucide-react";
import { cn, formatCompact, formatPct, formatUSD, truncateAddress } from "@/lib/format";
import type { WhaleAlert, WhalePositionSnapshot, WhaleWalletProfile, WhaleWatchlistEntry } from "@/types";
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
    <div className="rounded-3xl border border-zinc-800 bg-[#13171f] p-4">
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
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-2 text-emerald-300">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  eyebrow,
  title,
  helper,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  helper: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-[#13171f]">
      <div className="flex flex-col gap-3 border-b border-zinc-800 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{eyebrow}</div>
          <div className="mt-1 text-lg font-medium text-zinc-100">{title}</div>
          <div className="mt-1 text-sm text-zinc-400">{helper}</div>
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function PositionCard({
  position,
  totalOpenNotionalUsd,
}: {
  position: WhalePositionSnapshot;
  totalOpenNotionalUsd: number;
}) {
  const exposurePct = totalOpenNotionalUsd > 0 ? Math.min((position.notionalUsd / totalOpenNotionalUsd) * 100, 100) : 0;

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-base font-medium text-zinc-100">{position.coin}</div>
            <SmallPill label={position.side} tone={position.side === "long" ? "green" : "red"} />
            <SmallPill label={position.marketType === "hip3_spot" ? "Qualified HIP-3" : "Perp"} tone="neutral" />
          </div>
          <div className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">{humanizeBucket(position.riskBucket)}</div>
        </div>
        <div className={cn("text-right font-mono text-sm", position.unrealizedPnl >= 0 ? "text-emerald-300" : "text-rose-300")}>
          {formatUSD(position.unrealizedPnl)}
          <div className="mt-1 text-[11px] text-zinc-500">U.PnL</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Notional</div>
          <div className="mt-1 font-mono text-sm text-zinc-100">{formatUSD(position.notionalUsd)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Leverage</div>
          <div className="mt-1 font-mono text-sm text-zinc-100">
            {position.marketType === "hip3_spot" ? "spot" : `${position.leverage.toFixed(1)}x`}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Entry / Mark</div>
          <div className="mt-1 font-mono text-sm text-zinc-100">
            {formatUSD(position.entryPx)} / {formatUSD(position.markPx)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Liq distance</div>
          <div className={cn("mt-1 font-mono text-sm", (position.liquidationDistancePct ?? 100) < 10 ? "text-rose-300" : "text-zinc-100")}>
            {position.liquidationDistancePct == null ? "n/a" : formatPct(position.liquidationDistancePct)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-zinc-500">
          <span>Book share</span>
          <span>{exposurePct.toFixed(0)}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-zinc-900">
          <div
            className={cn("h-2 rounded-full", position.side === "long" ? "bg-emerald-400" : "bg-rose-400")}
            style={{ width: `${Math.max(exposurePct, 4)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function buildTimingLabel(profile: WhaleWalletProfile) {
  const hitRate4h = profile.preMoveHitRate4h ?? null;
  const hitRate1h = profile.preMoveHitRate1h ?? null;
  const sample = profile.preMoveSampleSize ?? 0;

  if (sample < 4) return "Timing model still warming up";
  if (hitRate4h != null && hitRate4h >= 60) return `${hitRate4h.toFixed(0)}% 4h pre-move hit rate`;
  if (hitRate1h != null && hitRate1h >= 55) return `${hitRate1h.toFixed(0)}% 1h pre-move hit rate`;
  return "No durable timing edge yet";
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
    return <div className="h-[900px] rounded-3xl border border-zinc-800 skeleton" />;
  }

  if (!profile) {
    return (
      <section className="rounded-3xl border border-zinc-800 bg-[#13171f] p-8 text-center">
        <Wallet className="mx-auto h-6 w-6 text-zinc-600" />
        <div className="mt-3 text-sm font-medium text-zinc-200">Wallet profile unavailable.</div>
        <div className="mt-2 text-sm leading-6 text-zinc-500">Try another address or return to the positioning monitor.</div>
      </section>
    );
  }

  const feedEligible = profile.realizedPnl30d >= 200_000;
  const timingLabel = buildTimingLabel(profile);
  const dominantAssets = profile.dominantAssets.slice(0, 4).join(" · ") || "No dominant assets yet";
  const favoriteAssets = profile.baseline.favoriteAssets.slice(0, 3).join(" · ") || "No favorite assets yet";
  const topBuckets = profile.bucketExposures
    .filter((bucket) => Math.abs(bucket.netNotionalUsd) > 0)
    .sort((a, b) => Math.abs(b.netNotionalUsd) - Math.abs(a.netNotionalUsd))
    .slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 px-4 py-6 pb-20 md:px-6">
      <section className="rounded-[28px] border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.08),transparent_28%),linear-gradient(180deg,#13171f,#0d1117)] p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_340px]">
          <div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              <Link href="/whales" className="inline-flex items-center gap-2 transition hover:text-zinc-300">
                <ArrowLeft className="h-3.5 w-3.5" />
                Positioning monitor
              </Link>
              <span>/</span>
              <span>{truncateAddress(profile.address)}</span>
            </div>

            <div className="mt-4 text-[11px] uppercase tracking-[0.24em] text-emerald-400/80">Tracked Wallet Dossier</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">
              {truncateAddress(profile.address)}
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-zinc-300">
              {profile.narrative || "Review this wallet as a positioning input rather than a copy-trading signal. Focus on crowding, pressure, and whether it consistently adds with conviction."}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <SmallPill label={feedEligible ? "Main tape eligible" : "Review-only wallet"} tone={feedEligible ? "green" : "amber"} />
              <SmallPill
                label={`${profile.directionalHitRate30d.toFixed(1)}% win rate`}
                tone={profile.directionalHitRate30d >= 50 ? "green" : "neutral"}
              />
              <SmallPill label={timingLabel} tone={timingLabel.includes("%") ? "green" : "neutral"} />
              {profile.repeatedAddCount6h ? (
                <SmallPill label={`${profile.repeatedAddCount6h} adds in 6h`} tone={profile.repeatedAddCount6h >= 4 ? "amber" : "neutral"} />
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950/55 p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Current trigger</div>
                {selectedAlert ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <SmallPill label={alertTypeLabel(selectedAlert)} tone="neutral" />
                      <SmallPill label={selectedAlert.side === "short" ? "Short" : "Long"} tone={selectedAlert.side === "short" ? "red" : "green"} />
                    </div>
                    <div className="mt-3 text-base font-medium text-zinc-100">{selectedAlert.headline}</div>
                    <div className="mt-2 text-sm leading-6 text-zinc-400">{selectedAlert.confidenceLabel}</div>
                  </>
                ) : (
                  <div className="mt-3 text-sm text-zinc-500">No active alert context on this wallet right now.</div>
                )}
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-950/55 p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Focus map</div>
                <div className="mt-3 text-base font-medium text-zinc-100">{dominantAssets}</div>
                <div className="mt-2 text-sm leading-6 text-zinc-400">
                  Favorite tape: {favoriteAssets}
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-950/55 p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Clock</div>
                <div className="mt-3 text-base font-medium text-zinc-100">
                  {profile.firstSeenAt ? new Date(profile.firstSeenAt).toLocaleDateString() : "n/a"} first seen
                </div>
                <div className="mt-2 text-sm leading-6 text-zinc-400">
                  Last active {profile.lastSeenAt ? new Date(profile.lastSeenAt).toLocaleString() : "n/a"}
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-3xl border border-zinc-800 bg-zinc-950/55 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Wallet controls</div>
            <div className="mt-3 rounded-2xl border border-zinc-800 bg-[#0a0c10] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Address</div>
                  <div className="mt-2 font-mono text-sm text-zinc-200 break-all">
                    {expandedAddress ? profile.address : truncateAddress(profile.address)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-2 text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
                  aria-label="Copy wallet address"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setExpandedAddress((current) => !current)}
                className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-400 transition hover:text-zinc-200"
              >
                {expandedAddress ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {expandedAddress ? "Hide full address" : "Show full address"}
              </button>
            </div>

            <div className="mt-3 grid gap-3">
              {watchlisted ? (
                <button
                  onClick={removeWatchlist}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-3 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove watchlist
                </button>
              ) : (
                <button
                  onClick={addWatchlist}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200 transition hover:bg-emerald-500/15"
                >
                  <BookmarkPlus className="h-4 w-4" />
                  Add to watchlist
                </button>
              )}

              <Link
                href={alertsExportHref}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-3 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
              >
                <Download className="h-4 w-4" />
                Export alerts
              </Link>
              <Link
                href={episodesExportHref}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-3 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
              >
                <Download className="h-4 w-4" />
                Export episodes
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-zinc-800 bg-[#0a0c10] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Eligibility gate</div>
                <div className={cn("mt-2 text-sm font-medium", feedEligible ? "text-emerald-300" : "text-amber-300")}>
                  {feedEligible ? "Passes default +$200K 30d gate" : "Below the default +$200K gate"}
                </div>
                <div className="mt-2 text-xs leading-5 text-zinc-500">
                  The main tape and Telegram stay quiet unless this wallet clears the stricter quality floor.
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-[#0a0c10] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Timing edge</div>
                <div className="mt-2 text-sm font-medium text-zinc-100">{timingLabel}</div>
                <div className="mt-2 text-xs leading-5 text-zinc-500">
                  Sample size {profile.preMoveSampleSize ?? 0} · 1h {profile.preMoveHitRate1h == null ? "n/a" : `${profile.preMoveHitRate1h.toFixed(0)}%`} · 4h{" "}
                  {profile.preMoveHitRate4h == null ? "n/a" : `${profile.preMoveHitRate4h.toFixed(0)}%`}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Realized P&L" value={formatCompact(profile.realizedPnl30d)} helper="30d closed performance" icon={BarChart3 as typeof Activity} tone={profile.realizedPnl30d >= 0 ? "green" : "red"} />
        <KpiCard label="30D Volume" value={formatCompact(profile.baseline.volume30d)} helper="public fills" icon={Waves as typeof Activity} />
        <KpiCard label="Equity" value={formatCompact(profile.accountEquity)} helper="perps + spot USDC" icon={Wallet as typeof Activity} />
        <KpiCard label="Open Notional" value={formatCompact(profile.totalOpenNotionalUsd)} helper={`${profile.openPositionsCount} live positions`} icon={Layers3 as typeof Activity} />
        <KpiCard label="Median Size" value={formatCompact(profile.medianTradeSize30d)} helper={`${profile.avgHoldHours30d.toFixed(1)}h avg hold`} icon={Target as typeof Activity} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_360px]">
        <SectionCard
          eyebrow="Current positioning"
          title="Live book and pressure map"
          helper="Open exposure, liquidation distance, and book concentration."
        >
          {profile.positions.length === 0 ? (
            <div className="text-sm text-zinc-500">No open Hyperliquid positions or spot balances right now.</div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {profile.positions.map((position) => (
                <PositionCard key={`${position.marketType}-${position.coin}-${position.side}`} position={position} totalOpenNotionalUsd={profile.totalOpenNotionalUsd} />
              ))}
            </div>
          )}
        </SectionCard>

        <div className="space-y-5">
          <SectionCard
            eyebrow="Positioning model"
            title="Why this wallet matters"
            helper="The goal is to review crowding, imbalance, and repeatable behavior rather than blindly follow fills."
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <Radar className="h-4 w-4 text-emerald-300" />
                  Core read
                </div>
                <div className="mt-2 text-sm leading-6 text-zinc-400">
                  {feedEligible
                    ? "Profitable enough for the main monitor, but still best used as a positioning clue rather than a direction predictor."
                    : "Useful for research and context, but filtered from the main tape because recent realized performance has not cleared the stricter gate."}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Dominant buckets</div>
                <div className="mt-3 space-y-3">
                  {topBuckets.length === 0 ? (
                    <div className="text-sm text-zinc-500">No meaningful open bucket concentration right now.</div>
                  ) : (
                    topBuckets.map((bucket) => {
                      const sharePct =
                        profile.totalOpenNotionalUsd > 0
                          ? (Math.abs(bucket.netNotionalUsd) / profile.totalOpenNotionalUsd) * 100
                          : 0;
                      return (
                        <div key={bucket.bucket}>
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-zinc-200">{humanizeBucket(bucket.bucket)}</span>
                            <span className={cn("font-mono", bucket.netNotionalUsd >= 0 ? "text-emerald-300" : "text-rose-300")}>
                              {formatUSD(bucket.netNotionalUsd)}
                            </span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-zinc-900">
                            <div
                              className={cn("h-2 rounded-full", bucket.netNotionalUsd >= 0 ? "bg-emerald-400" : "bg-rose-400")}
                              style={{ width: `${Math.max(Math.min(sharePct, 100), 6)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          eyebrow="Grouped trades"
          title="Closed episodes"
          helper="How this wallet has actually monetized its positioning over time."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/35 text-left text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <th className="px-0 py-3 font-medium">Asset</th>
                  <th className="px-4 py-3 font-medium">Entry / Exit</th>
                  <th className="px-4 py-3 font-medium">Fees</th>
                  <th className="px-4 py-3 font-medium">Funding</th>
                  <th className="px-0 py-3 font-medium text-right">P&amp;L / Hold</th>
                </tr>
              </thead>
              <tbody>
                {profile.trades.slice(0, 12).map((trade) => (
                  <tr key={trade.id} className="border-b border-zinc-800/80">
                    <td className="px-0 py-4">
                      <div className="text-sm font-medium text-zinc-100">
                        {trade.coin}{" "}
                        <span className={cn("ml-1 text-xs uppercase tracking-[0.12em]", trade.direction === "long" ? "text-emerald-300" : "text-rose-300")}>
                          {trade.direction}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {formatUSD(trade.notionalUsd)} · {new Date(trade.entryTime).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-sm text-zinc-300">
                      {formatUSD(trade.entryPx)} → {formatUSD(trade.exitPx)}
                    </td>
                    <td className="px-4 py-4 font-mono text-sm text-zinc-300">{formatUSD(trade.fees)}</td>
                    <td className="px-4 py-4 font-mono text-sm text-zinc-300">{formatUSD(trade.funding)}</td>
                    <td className="px-0 py-4 text-right">
                      <div className={cn("font-mono text-sm", trade.realizedPnl >= 0 ? "text-emerald-300" : "text-rose-300")}>
                        {formatUSD(trade.realizedPnl)}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">{(trade.durationMs / (1000 * 60 * 60)).toFixed(1)}h hold</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Ledger"
          title="Funding and capital moves"
          helper="Deposits, withdrawals, transfers, and balance events that change context."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/35 text-left text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  <th className="px-0 py-3 font-medium">Event</th>
                  <th className="px-0 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {profile.ledger.slice(0, 12).map((event) => (
                  <tr key={event.id} className="border-b border-zinc-800/80">
                    <td className="px-0 py-4">
                      <div className="text-sm font-medium text-zinc-100">{event.label}</div>
                      <div className="mt-1 text-xs text-zinc-500">{new Date(event.time).toLocaleString()}</div>
                    </td>
                    <td className={cn("px-0 py-4 text-right font-mono text-sm", event.direction === "in" ? "text-emerald-300" : event.direction === "out" ? "text-rose-300" : "text-zinc-300")}>
                      {event.direction === "out" ? "-" : event.direction === "in" ? "+" : ""}
                      {formatUSD(event.amountUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
