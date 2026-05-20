"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info, Radar, RefreshCw } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import { cn } from "@/lib/format";
import { formatEasternTime } from "@/lib/time";
import { POLL_INTERVAL_MARKET } from "@/lib/constants";
import type { MarketRadarSignal } from "@/types";
import { SectionEyebrow } from "@/components/trading-ui";

type RadarResponse = {
  signals: MarketRadarSignal[];
  generatedAt: number;
  source: string;
  factorsIncluded: boolean;
};

function sourceLabel(source: string | undefined) {
  if (source === "quant-radar") return "Price-action relative-strength scan";
  return "Market-only scan";
}

function signalTone(signal: MarketRadarSignal) {
  if (signal.kind === "strongest_asset") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (signal.kind === "holding_up") return "border-teal-500/25 bg-teal-500/10 text-teal-300";
  if (signal.kind === "weakest_asset") return "border-rose-500/25 bg-rose-500/10 text-rose-300";
  if (signal.kind === "crowded_long") return "border-orange-500/25 bg-orange-500/10 text-orange-300";
  if (signal.kind === "crowded_short") return "border-sky-500/25 bg-sky-500/10 text-sky-300";
  if (signal.severity === "high") return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  if (signal.severity === "medium") return "border-zinc-700 bg-zinc-950/70 text-zinc-300";
  return "border-zinc-800 bg-zinc-950/70 text-zinc-400";
}

function kindLabel(kind: MarketRadarSignal["kind"]) {
  switch (kind) {
    case "strongest_asset":
      return "Long bias";
    case "holding_up":
      return "Holding up";
    case "weakest_asset":
      return "Short bias";
    case "crowded_long":
      return "Crowded long";
    case "crowded_short":
      return "Crowded short";
    case "liquidation_pressure":
      return "Liquidation";
    case "whale_flow":
      return "Whale flow";
    case "factor_confirmation":
      return "Factor";
    default:
      return kind;
  }
}

function formatRadarTime(time: number | undefined): string {
  if (!time || !Number.isFinite(time)) return "waiting";
  return formatEasternTime(time, true);
}

const radarMethodology = [
  "Liquidity gate: >=$10M OI and >=$20M 24h volume.",
  "Scores BTC/basket-relative strength plus Friday-high/low divergence.",
  "Volume is a major contributor: 24h volume vs 7d average carries most of the participation score.",
  "Adds 1h/4h acceleration, OI participation, and funding crowding penalty.",
];

function formatSigned(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function scoreLabel(signal: MarketRadarSignal) {
  if (signal.kind === "holding_up") {
    const numeric = Number(signal.value.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(numeric)) return signal.value;
    return `${numeric.toFixed(2)}σ hold`;
  }
  if (signal.kind !== "weakest_asset") return signal.value;
  const numeric = Number(signal.value.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric)) return signal.value;
  return `${numeric.toFixed(2)}σ weak`;
}

function formatMultiple(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "vol n/a";
  return `vol ${value.toFixed(value >= 10 ? 0 : 1)}x`;
}

function compactEvidence(signal: MarketRadarSignal) {
  const details = signal.scoreDetails;
  if (!details) return signal.evidence[0] ?? "";
  const volume = formatMultiple(details.volumeVsAvg);
  const divergence =
    signal.kind === "weakest_asset"
      ? details.assetBelowFridayLow && !details.btcBelowFridayLow
        ? "diverged below Fri low"
        : `structure ${formatSigned(details.structureDivergenceScore, 1)}`
      : details.assetAboveFridayHigh && !details.btcAboveFridayHigh
        ? "diverged above Fri high"
        : `structure ${formatSigned(details.structureDivergenceScore, 1)}`;
  const accel = `accel ${formatSigned(details.accelerationScore, 1)}`;
  if (signal.kind === "weakest_asset") {
    return `lags BTC ${Math.abs(details.btcResidualPct).toFixed(1)}% · ${volume} · ${divergence}`;
  }
  if (signal.kind === "holding_up") {
    return `holding vs BTC ${formatSigned(details.btcResidualPct)}% · ${volume} · raw ${formatSigned(details.rawReturn24hPct)}%`;
  }
  return `vs BTC ${formatSigned(details.btcResidualPct)}% · ${volume} · ${accel}`;
}

function marketAssetElementId(asset: string) {
  return `market-asset-${asset.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function useOpenMarketAsset(signal?: MarketRadarSignal) {
  const pathname = usePathname();
  const { setSelectedAsset } = useMarket();

  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (!signal || pathname !== "/markets") return;
    event.preventDefault();
    const asset = signal.asset.toUpperCase();
    setSelectedAsset(asset);
    window.history.replaceState(null, "", `/markets?asset=${encodeURIComponent(asset)}`);
    window.setTimeout(() => {
      document.getElementById(marketAssetElementId(asset))?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  };
}

function RadarMiniRow({ signal }: { signal: MarketRadarSignal }) {
  const openAsset = useOpenMarketAsset(signal);
  const valueColor =
    signal.kind === "weakest_asset"
      ? "text-rose-200"
      : signal.kind === "holding_up"
        ? "text-teal-200"
        : "text-zinc-100";

  return (
    <Link
      href={signal.routeHref}
      onClick={openAsset}
      className="group block rounded-xl border border-zinc-800 bg-zinc-950/55 px-3 py-2 transition hover:border-teal-500/25 hover:bg-zinc-950/80"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-zinc-100">{signal.asset}</span>
            <span className={cn("rounded-full border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em]", signalTone(signal))}>
              {signal.severity}
            </span>
          </div>
          <div className="mt-1 truncate text-[10px] text-zinc-500">{compactEvidence(signal)}</div>
        </div>
        <div className={cn("shrink-0 text-right font-mono text-xs", valueColor)}>{scoreLabel(signal)}</div>
      </div>
    </Link>
  );
}

function RadarTopCard({
  signal,
  label,
  tone,
}: {
  signal?: MarketRadarSignal;
  label: string;
  tone: "long" | "hold" | "short";
}) {
  const openAsset = useOpenMarketAsset(signal);
  const toneClasses = tone === "long"
    ? "border-emerald-500/20 bg-emerald-500/10 hover:border-emerald-400/35"
    : tone === "hold"
      ? "border-teal-500/20 bg-teal-500/10 hover:border-teal-400/35"
      : "border-rose-500/20 bg-rose-500/10 hover:border-rose-400/35";
  const labelClasses = tone === "long" ? "text-emerald-300/80" : tone === "hold" ? "text-teal-300/80" : "text-rose-300/80";
  const valueClasses = tone === "long" ? "text-emerald-300" : tone === "hold" ? "text-teal-300" : "text-rose-300";
  const value = signal ? scoreLabel(signal) : "waiting";

  return (
    <Link
      href={signal?.routeHref ?? "/markets"}
      onClick={openAsset}
      className={cn("rounded-xl border p-3 transition", toneClasses)}
    >
      <div className={cn("text-[9px] uppercase tracking-[0.14em]", labelClasses)}>{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold text-zinc-100">{signal?.asset ?? "—"}</div>
      <div className={cn("mt-1 truncate font-mono text-xs", valueClasses)}>{value}</div>
    </Link>
  );
}

export default function MarketRadarPanel({ variant = "compact" }: { variant?: "compact" | "hero" | "rail" }) {
  const [data, setData] = useState<RadarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await fetch("/api/market/radar");
        if (!response.ok) return;
        const nextData = (await response.json()) as RadarResponse;
        if (mounted) setData(nextData);
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
      window.clearInterval(interval);
    };
  }, []);

  const hero = variant === "hero";
  const allSignals = data?.signals ?? [];
  const longSignals = allSignals.filter((signal) => signal.kind === "strongest_asset").slice(0, 3);
  const holdingSignals = allSignals.filter((signal) => signal.kind === "holding_up").slice(0, 3);
  const shortSignals = allSignals.filter((signal) => signal.kind === "weakest_asset").slice(0, 3);
  const contextSignals = allSignals.filter((signal) => signal.kind !== "strongest_asset" && signal.kind !== "holding_up" && signal.kind !== "weakest_asset").slice(0, hero ? 2 : 1);
  const signals = [...longSignals, ...holdingSignals, ...shortSignals, ...contextSignals].slice(0, hero ? 8 : 7);
  const railSignals = [...longSignals, ...holdingSignals, ...shortSignals];

  if (variant === "rail") {
    const hasCleanLongs = longSignals.length > 0;
    const topLong = longSignals[0] ?? holdingSignals[0];
    const topShort = shortSignals[0];

    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SectionEyebrow>Momentum</SectionEyebrow>
              <button
                type="button"
                onClick={() => setShowFormula((value) => !value)}
                className="rounded-full border border-zinc-800 bg-zinc-950/70 p-1 text-zinc-500 transition hover:border-teal-500/30 hover:text-teal-200"
                aria-label="Explain momentum score"
              >
                <Info className="h-3 w-3" />
              </button>
            </div>
            <div className="mt-1 text-sm font-medium text-zinc-100">Running / lagging</div>
            <div className="mt-0.5 font-mono text-[10px] text-zinc-600">2m scan · {formatRadarTime(data?.generatedAt)}</div>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-300">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
          </div>
        </div>

        {showFormula ? (
          <div className="mb-3 rounded-xl border border-teal-500/20 bg-teal-500/10 px-3 py-2 text-[11px] leading-5 text-teal-100">
            Score = BTC/basket residual z + Friday structure divergence + 1h/4h acceleration + participation - funding crowding penalty.
          </div>
        ) : null}

        {railSignals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-500">
            Radar is warming up.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <RadarTopCard signal={topLong} label={hasCleanLongs ? "Running" : "Holding up"} tone={hasCleanLongs ? "long" : "hold"} />
              <RadarTopCard signal={topShort} label="Lagging" tone="short" />
            </div>

            <div>
              <div className="mb-1.5 text-[9px] uppercase tracking-[0.16em] text-zinc-600">Long momentum</div>
              <div className="space-y-1.5">
                {longSignals.length > 0 ? longSignals.map((signal) => <RadarMiniRow key={signal.id} signal={signal} />) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/45 px-3 py-2 text-[11px] leading-5 text-zinc-500">
                    No clean long momentum. Market tape is risk-off; showing relative strength below instead.
                  </div>
                )}
              </div>
            </div>

            {holdingSignals.length > 0 ? (
              <div>
                <div className="mb-1.5 text-[9px] uppercase tracking-[0.16em] text-zinc-600">Holding up</div>
                <div className="mb-1.5 text-[10px] leading-4 text-zinc-600">Relative strength in a red tape. Watchlist only, not a long entry by itself.</div>
                <div className="space-y-1.5">
                  {holdingSignals.map((signal) => <RadarMiniRow key={signal.id} signal={signal} />)}
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-1.5 text-[9px] uppercase tracking-[0.16em] text-zinc-600">Relative weakness</div>
              <div className="mb-1.5 text-[10px] leading-4 text-zinc-600">Higher weak-score = lagging BTC and the liquid perp basket. Not an entry by itself.</div>
              <div className="space-y-1.5">
                {shortSignals.length > 0 ? shortSignals.map((signal) => <RadarMiniRow key={signal.id} signal={signal} />) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/45 px-3 py-2 text-[11px] text-zinc-500">No qualified short edge.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  if (hero) {
    return (
      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#13171f]">
        <div className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <SectionEyebrow className="text-teal-300">Market Radar v1</SectionEyebrow>
            <div className="mt-1 text-sm font-medium text-zinc-100">Quick context before the directory</div>
            <div className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
              Momentum Edge is not raw 24h green. It scans liquid Hyperliquid perps for BTC/basket-relative strength,
              Friday-high divergence, short-term acceleration, participation, and funding crowding. Refreshes every 2m.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-300">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
              {sourceLabel(data?.source)}
            </div>
            <div className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2.5 py-1.5 font-mono text-zinc-500">
              Updated {formatRadarTime(data?.generatedAt)}
            </div>
          </div>
        </div>

        <div className="grid gap-2 border-b border-zinc-800 bg-zinc-950/30 px-3 py-2 text-[11px] leading-5 text-zinc-500 md:grid-cols-3">
          {radarMethodology.map((item) => (
            <div key={item} className="rounded-xl border border-zinc-800/80 bg-zinc-950/45 px-3 py-2">
              {item}
            </div>
          ))}
        </div>

        <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4">
          {signals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-500 md:col-span-2 xl:col-span-4">
              Radar is warming up. HyperPulse will show qualified long momentum, short momentum, crowded longs, and paid shorts here.
            </div>
          ) : (
            signals.map((signal) => (
              <Link
                key={signal.id}
                href={signal.routeHref}
                className="group rounded-xl border border-zinc-800 bg-zinc-950/55 p-3 transition hover:border-teal-500/25 hover:bg-zinc-950/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]", signalTone(signal))}>
                    {kindLabel(signal.kind)}
                  </span>
                  <span className="font-mono text-xs text-zinc-100">{scoreLabel(signal)}</span>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="font-mono text-lg font-semibold tracking-tight text-zinc-100">{signal.asset}</div>
                    <div className="mt-1 text-xs leading-5 text-zinc-500">{signal.label}</div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionEyebrow>Market Radar</SectionEyebrow>
          <div className="mt-1 text-sm font-medium text-zinc-100">What stands out now</div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {sourceLabel(data?.source)} · refreshes every 2m
          </div>
          <div className="mt-1 max-w-[260px] text-[10px] leading-4 text-zinc-600">
            Liquidity-gated: BTC/basket residual, Friday structure, acceleration, participation, funding penalty.
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-600">Updated {formatRadarTime(data?.generatedAt)}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-300">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {signals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-500">
            Radar is warming up. HyperPulse will show long bias, short bias, funding crowding, and tracked-flow context here.
          </div>
        ) : (
          signals.map((signal) => (
            <Link
              key={signal.id}
              href={signal.routeHref}
              className="block rounded-xl border border-zinc-800 bg-zinc-950/55 p-3 transition hover:border-zinc-700 hover:bg-zinc-950/80"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium text-zinc-100">{signal.asset}</span>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]", signalTone(signal))}>
                      {kindLabel(signal.kind)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-zinc-400">{signal.label}</div>
                  <div className="mt-1 truncate text-[11px] text-zinc-600">{signal.evidence[0]}</div>
                </div>
                <div className="font-mono text-sm text-zinc-100">{scoreLabel(signal)}</div>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
