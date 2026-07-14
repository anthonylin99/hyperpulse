"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMarket } from "@/context/MarketContext";
import { cn, formatCompactUsd, formatPct } from "@/lib/format";
import { withNetworkParam } from "@/lib/hyperliquid";
import { normalizeMarketCoin } from "@/lib/marketCoins";
import { POLL_INTERVAL_MARKET } from "@/lib/constants";
import { SectionEyebrow } from "@/components/trading-ui";
import type { CrowdingDeskPayload, PositioningStressAlert } from "@/lib/crowding";

function marketAssetElementId(asset: string) {
  return `market-asset-${asset.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function severityTone(severity: PositioningStressAlert["severity"]) {
  if (severity === "extreme") return "border-red-400/35 bg-red-500/10 text-red-200";
  if (severity === "high") return "border-orange-400/35 bg-orange-500/10 text-orange-200";
  if (severity === "medium") return "border-amber-400/35 bg-amber-500/10 text-amber-200";
  return "border-zinc-700 bg-zinc-900/70 text-zinc-300";
}

function sideText(alert: PositioningStressAlert): string {
  if (alert.side === "longs_crowded") return "Longs paying";
  if (alert.side === "shorts_crowded") return "Shorts paying";
  return "No crowded side";
}

function AlertRow({ alert, onSelect }: { alert: PositioningStressAlert; onSelect: (asset: string, event: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <Link
      href={`/markets?asset=${encodeURIComponent(alert.asset)}`}
      onClick={(event) => onSelect(alert.asset, event)}
      className="block rounded-lg border border-zinc-800 bg-zinc-950/45 px-3 py-2 hover:border-zinc-700"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-zinc-100">{alert.displayName}</span>
            <span className={cn("rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em]", severityTone(alert.severity))}>
              {alert.severity}
            </span>
          </div>
          <div className="mt-1 text-xs font-medium text-zinc-200">{alert.label}</div>
        </div>
        <div className="shrink-0 text-right font-mono text-xs text-zinc-300">{alert.score.toFixed(0)}</div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1">
          <div className="uppercase tracking-[0.12em] text-zinc-600">Funding</div>
          <div className={cn("mt-0.5 font-mono", alert.fundingApr >= 0 ? "text-red-300" : "text-emerald-300")}>{formatPct(alert.fundingApr)}</div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1">
          <div className="uppercase tracking-[0.12em] text-zinc-600">OI</div>
          <div className="mt-0.5 font-mono text-zinc-200">{formatCompactUsd(alert.openInterestUsd)}</div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1">
          <div className="uppercase tracking-[0.12em] text-zinc-600">24h</div>
          <div className={cn("mt-0.5 font-mono", alert.priceChange24h >= 0 ? "text-emerald-300" : "text-red-300")}>{formatPct(alert.priceChange24h)}</div>
        </div>
      </div>
      <div className="mt-2 text-[11px] leading-4 text-zinc-400">{alert.decision}</div>
      <div className="mt-2 text-[10px] text-zinc-600">{sideText(alert)} · cohort split not indexed yet</div>
    </Link>
  );
}

export default function CrowdingDeskPanel() {
  const [data, setData] = useState<CrowdingDeskPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const { setSelectedAsset } = useMarket();

  useEffect(() => {
    let mounted = true;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(withNetworkParam("/api/crowding/alerts"));
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as CrowdingDeskPayload;
        if (mounted) setData(next);
      } catch {
        /* keep last good data */
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      load();
    }, POLL_INTERVAL_MARKET);
    return () => {
      mounted = false;
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const alerts = useMemo(() => data?.alerts ?? [], [data]);

  const handleSelect = (coin: string, event: MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/markets") return;
    event.preventDefault();
    const asset = normalizeMarketCoin(coin);
    if (!asset) return;
    setSelectedAsset(asset);
    window.history.replaceState(null, "", `/markets?asset=${encodeURIComponent(asset)}`);
    window.setTimeout(() => {
      document.getElementById(marketAssetElementId(asset))?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionEyebrow>Positioning Stress</SectionEyebrow>
          <div className="mt-1 text-sm font-medium text-zinc-100">Expensive crowded side</div>
          <div className="mt-0.5 text-[11px] leading-4 text-zinc-500">Funding, OI, price. Cohorts later.</div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-amber-300">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-500">
          {loading ? "Scanning expensive carry…" : "No clean positioning stress warning. Good. Do not force it."}
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.slice(0, 3).map((alert) => (
            <AlertRow key={alert.asset} alert={alert} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </section>
  );
}
