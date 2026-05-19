"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, RefreshCw, Share2, ShieldCheck, Sparkles, Vault } from "lucide-react";
import { MiniKit } from "@worldcoin/minikit-js";
import { cn, formatChartPrice, formatCompactUsd, formatPct } from "@/lib/format";
import { formatEasternTime } from "@/lib/time";

type MomentumCard = {
  asset: string;
  side: "long" | "short";
  score: number;
  markPx: number;
  return24hPct: number;
  vsBtcPct: number;
  vsBasketPct: number;
  routeHref: string;
};

type MoverCard = {
  asset: string;
  markPx: number;
  return24hPct: number;
  openInterestUsd: number;
  routeHref: string;
};

type VaultCandidate = {
  name: string;
  address: string;
  score: number;
  decision: string;
  tvl: number;
  return30dPct: number | null;
  drawdownPct: number | null;
  allowDeposits: boolean;
  routeHref: string;
};

type WorldPulsePayload = {
  generatedAt: number;
  mode: "world-beta";
  market: {
    assetsTracked: number;
    running: MomentumCard[];
    holdingUp?: MomentumCard[];
    lagging: MomentumCard[];
    gainers: MoverCard[];
    losers: MoverCard[];
  };
  vaults: {
    enabled: boolean;
    candidates: VaultCandidate[];
    totalTvl: number;
    partial: boolean;
  };
  trust: string[];
};

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-3xl border border-zinc-800 bg-zinc-900/60" />
      ))}
    </div>
  );
}

function SectionHeader({ label, title, action }: { label: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/70">{label}</div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function MomentumTile({ item }: { item: MomentumCard }) {
  const long = item.side === "long";
  return (
    <Link
      href={item.routeHref}
      className={cn(
        "block rounded-3xl border p-4 transition active:scale-[0.99]",
        long
          ? "border-emerald-400/20 bg-emerald-400/[0.08]"
          : "border-rose-400/20 bg-rose-400/[0.08]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={cn("text-[10px] uppercase tracking-[0.18em]", long ? "text-emerald-300" : "text-rose-300")}>
            {long ? "Running" : "Weak vs BTC"}
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">{item.asset}</div>
        </div>
        <div className="rounded-full border border-zinc-700 bg-zinc-950/50 px-2.5 py-1 font-mono text-xs text-zinc-200">
          {item.score > 0 ? "+" : ""}
          {item.score.toFixed(2)}σ
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-zinc-500">24h</div>
          <div className={cn("font-mono", item.return24hPct >= 0 ? "text-emerald-300" : "text-rose-300")}>
            {formatPct(item.return24hPct)}
          </div>
        </div>
        <div>
          <div className="text-zinc-500">vs BTC</div>
          <div className="font-mono text-zinc-100">{formatPct(item.vsBtcPct)}</div>
        </div>
        <div>
          <div className="text-zinc-500">mark</div>
          <div className="font-mono text-zinc-100">{formatChartPrice(item.markPx)}</div>
        </div>
      </div>
    </Link>
  );
}

function MoverRow({ item, rank, tone }: { item: MoverCard; rank: number; tone: "green" | "red" }) {
  return (
    <Link href={item.routeHref} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/45 px-3 py-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 font-mono text-xs text-zinc-400">{rank}</div>
      <div>
        <div className="font-semibold text-zinc-100">{item.asset}</div>
        <div className="font-mono text-xs text-zinc-500">{formatCompactUsd(item.openInterestUsd)} OI</div>
      </div>
      <div className={cn("font-mono text-sm", tone === "green" ? "text-emerald-300" : "text-rose-300")}>
        {formatPct(item.return24hPct)}
      </div>
    </Link>
  );
}

function VaultCard({ item }: { item: VaultCandidate }) {
  return (
    <Link href={item.routeHref} className="block rounded-3xl border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-zinc-100">{item.name}</div>
          <div className="mt-1 font-mono text-xs text-zinc-500">{item.address.slice(0, 6)}...{item.address.slice(-4)}</div>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-xs text-emerald-300">
          {item.score}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-zinc-500">TVL</div>
          <div className="font-mono text-zinc-100">{formatCompactUsd(item.tvl)}</div>
        </div>
        <div>
          <div className="text-zinc-500">30d</div>
          <div className={cn("font-mono", (item.return30dPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300")}>{formatPct(item.return30dPct)}</div>
        </div>
        <div>
          <div className="text-zinc-500">DD</div>
          <div className="font-mono text-rose-300">{formatPct(item.drawdownPct)}</div>
        </div>
      </div>
    </Link>
  );
}

export default function WorldPulsePage() {
  const [payload, setPayload] = useState<WorldPulsePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/world/pulse");
      if (!res.ok) throw new Error(`Pulse request failed (${res.status})`);
      setPayload(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load World pulse");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 120_000);
    return () => clearInterval(interval);
  }, [load]);

  const heroSignal = payload?.market.running[0] ?? payload?.market.holdingUp?.[0] ?? payload?.market.gainers[0] ?? null;
  const shareText = useMemo(() => {
    if (!heroSignal) return "HyperPulse World beta: read-only Hyperliquid momentum and vault radar.";
    const asset = "asset" in heroSignal ? heroSignal.asset : "";
    return `HyperPulse World beta: ${asset} is leading the current Hyperliquid pulse.`;
  }, [heroSignal]);

  const share = useCallback(async () => {
    const url = `${window.location.origin}/world`;
    const data = {
      title: "HyperPulse World Beta",
      text: shareText,
      url,
    };

    try {
      if (MiniKit.isInstalled()) {
        await MiniKit.share(data);
        return;
      }
    } catch {
      // Fall back to browser-native share below.
    }

    if (navigator.share) {
      await navigator.share(data).catch(() => null);
    } else {
      await navigator.clipboard?.writeText(url).catch(() => null);
    }
  }, [shareText]);

  return (
    <main className="min-h-screen bg-[#050807] text-zinc-100 [padding-bottom:calc(env(safe-area-inset-bottom)+24px)] [padding-top:calc(env(safe-area-inset-top)+16px)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(45,212,191,0.24),transparent_32%),radial-gradient(circle_at_10%_42%,rgba(16,185,129,0.12),transparent_34%)]" />
      <div className="relative mx-auto max-w-md px-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.26em] text-emerald-300">HyperPulse</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">World beta</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950/70 text-zinc-300"
              aria-label="Refresh pulse"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={share}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
              aria-label="Share HyperPulse"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        </header>

        <section className="mt-5 rounded-[2rem] border border-emerald-400/20 bg-zinc-950/72 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.8)]" />
            Read-only Hyperliquid intelligence
          </div>
          <p className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.04em] text-zinc-50">
            See what is moving before opening the full terminal.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {["No trading", "No keys", "Mobile first"].map((item) => (
              <div key={item} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 text-center text-[11px] text-zinc-300">
                <ShieldCheck className="mx-auto mb-1 h-4 w-4 text-emerald-300" />
                {item}
              </div>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <Link href="/markets" className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-semibold text-zinc-950">
              Full terminal
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/alerts" className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-950/60 px-4 py-3 text-sm font-medium text-zinc-200">
              Alerts
            </Link>
          </div>
        </section>

        {error ? (
          <div className="mt-4 rounded-3xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div>
        ) : null}

        <div className="mt-6 space-y-7">
          {loading && !payload ? (
            <Skeleton />
          ) : payload ? (
            <>
              <section>
                <SectionHeader
                  label="Momentum"
                  title="Running / lagging"
                  action={<div className="font-mono text-[11px] text-zinc-500">{formatEasternTime(payload.generatedAt)}</div>}
                />
                <div className="mt-3 grid gap-3">
                  {payload.market.running.length > 0 ? (
                    payload.market.running.map((item) => <MomentumTile key={`run-${item.asset}`} item={item} />)
                  ) : (payload.market.holdingUp?.length ?? 0) > 0 ? (
                    <>
                      <div className="rounded-3xl border border-teal-400/20 bg-teal-400/10 p-4 text-xs leading-5 text-teal-100">
                        No clean long momentum. These names are holding up best in a red tape; watchlist only.
                      </div>
                      {payload.market.holdingUp?.map((item) => <MomentumTile key={`hold-${item.asset}`} item={item} />)}
                    </>
                  ) : (
                    <div className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-400">No clean long momentum edge right now.</div>
                  )}
                  {payload.market.lagging.slice(0, 2).map((item) => (
                    <MomentumTile key={`lag-${item.asset}`} item={item} />
                  ))}
                </div>
              </section>

              <section>
                <SectionHeader label="Movers" title="Top liquid perps" />
                <div className="mt-3 space-y-2">
                  {payload.market.gainers.slice(0, 4).map((item, index) => (
                    <MoverRow key={`gain-${item.asset}`} item={item} rank={index + 1} tone="green" />
                  ))}
                  {payload.market.losers.slice(0, 2).map((item, index) => (
                    <MoverRow key={`lose-${item.asset}`} item={item} rank={index + 1} tone="red" />
                  ))}
                </div>
              </section>

              <section>
                <SectionHeader
                  label="Vaults"
                  title="Watchlist candidates"
                  action={
                    <Link href="/vaults" className="inline-flex items-center gap-1 text-xs text-emerald-300">
                      View all <ArrowRight className="h-3 w-3" />
                    </Link>
                  }
                />
                <div className="mt-3 space-y-2">
                  {payload.vaults.candidates.length > 0 ? (
                    payload.vaults.candidates.map((item) => <VaultCard key={item.address} item={item} />)
                  ) : (
                    <div className="rounded-3xl border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-400">
                      Vault pulse is warming up.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-800 bg-zinc-950/55 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-2 text-emerald-300">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-100">Built for feedback</div>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      This beta route is intentionally compact: scan momentum, check vault candidates, then open the full app only when needed.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link href="/markets" className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-3 text-sm text-zinc-200">
                    Markets <ArrowUpRight className="h-4 w-4 text-zinc-500" />
                  </Link>
                  <Link href="/vaults" className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-3 text-sm text-zinc-200">
                    Vaults <Vault className="h-4 w-4 text-zinc-500" />
                  </Link>
                </div>
              </section>
            </>
          ) : null}
        </div>

        <footer className="mt-8 pb-2 text-center text-[11px] leading-5 text-zinc-600">
          HyperPulse World beta is informational only. Signals are not trade instructions.
          <br />
          Short-bias reads are relative weakness, not automatic shorts.
        </footer>
      </div>
    </main>
  );
}
