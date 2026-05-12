"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RefreshCw, TrendingUp } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import { cn } from "@/lib/format";
import { POLL_INTERVAL_MARKET } from "@/lib/constants";
import { SectionEyebrow } from "@/components/trading-ui";

type Range = "1d" | "7d";

type TopMover = {
  coin: string;
  pctChange: number;
  markPx: number;
  prevPx: number;
  iconUrl: string | null;
};

type TopMoversResponse = {
  gainers: TopMover[];
  losers: TopMover[];
  range: Range;
  asOf: number;
};

function formatSignedPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function marketAssetElementId(asset: string) {
  return `market-asset-${asset.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function TokenGlyph({ coin, iconUrl }: { coin: string; iconUrl: string | null }) {
  const [failed, setFailed] = useState(!iconUrl);
  if (failed || !iconUrl) {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 font-mono text-[8px] font-semibold text-zinc-300">
        {coin.charAt(0)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconUrl}
      alt=""
      width={16}
      height={16}
      className="h-4 w-4 shrink-0 rounded-full bg-zinc-800"
      onError={() => setFailed(true)}
    />
  );
}

function MoverRow({
  mover,
  maxAbs,
  onSelect,
}: {
  mover: TopMover;
  maxAbs: number;
  onSelect: (coin: string, e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const widthPct = maxAbs > 0 ? Math.min(100, (Math.abs(mover.pctChange) / maxAbs) * 100) : 0;
  const isUp = mover.pctChange >= 0;
  const barColor = isUp ? "bg-emerald-500/75" : "bg-rose-500/75";
  const valueColor = isUp ? "text-emerald-300" : "text-rose-300";

  return (
    <Link
      href={`/markets?asset=${encodeURIComponent(mover.coin)}`}
      onClick={(e) => onSelect(mover.coin, e)}
      className="group grid grid-cols-[68px_1fr_48px] items-center gap-2 rounded-md px-1 py-[3px] hover:bg-zinc-950/60"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <TokenGlyph coin={mover.coin} iconUrl={mover.iconUrl} />
        <span className="truncate font-mono text-[11px] text-zinc-200">{mover.coin}</span>
      </div>
      <div className="relative h-3.5 overflow-hidden rounded-sm bg-zinc-950/40">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-sm transition-all", barColor)}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className={cn("text-right font-mono text-[11px] tabular-nums", valueColor)}>
        {formatSignedPct(mover.pctChange)}
      </div>
    </Link>
  );
}

const RANGES: Range[] = ["1d", "7d"];

export default function TopMoversPanel() {
  const [range, setRange] = useState<Range>("1d");
  const [data, setData] = useState<TopMoversResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const { setSelectedAsset } = useMarket();

  useEffect(() => {
    let mounted = true;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/market/top-movers?range=${range}`);
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as TopMoversResponse;
        if (mounted) setData(next);
      } catch {
        /* swallow — keep last good data */
      } finally {
        if (mounted) setLoading(false);
      }
    };
    setLoading(true);
    load();
    const interval = window.setInterval(load, POLL_INTERVAL_MARKET);
    return () => {
      mounted = false;
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [range]);

  const gainerMaxAbs = useMemo(() => {
    if (!data) return 0;
    return data.gainers.reduce((max, row) => Math.max(max, Math.abs(row.pctChange)), 0);
  }, [data]);
  const loserMaxAbs = useMemo(() => {
    if (!data) return 0;
    return data.losers.reduce((max, row) => Math.max(max, Math.abs(row.pctChange)), 0);
  }, [data]);

  const handleSelect = (coin: string, event: MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/markets") return;
    event.preventDefault();
    const upper = coin.toUpperCase();
    setSelectedAsset(upper);
    window.history.replaceState(null, "", `/markets?asset=${encodeURIComponent(upper)}`);
    window.setTimeout(() => {
      document.getElementById(marketAssetElementId(upper))?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionEyebrow>Top Movers</SectionEyebrow>
          <div className="mt-1 text-sm font-medium text-zinc-100">Crypto price change</div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-600">Perps · OI &gt; $10M</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-300">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
        </div>
      </div>

      <div className="mb-3 inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 p-0.5">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] transition",
              range === r
                ? "bg-emerald-500/15 text-emerald-200"
                : "text-zinc-500 hover:text-zinc-200",
            )}
          >
            {r === "1d" ? "1D" : "7D"}
          </button>
        ))}
      </div>

      {!data || (data.gainers.length === 0 && data.losers.length === 0) ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-500">
          {loading ? "Loading top movers…" : "No qualifying movers right now."}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-[9px] uppercase tracking-[0.16em] text-zinc-600">
              Top Gainers
            </div>
            <div className="space-y-0.5">
              {data.gainers.map((mover) => (
                <MoverRow
                  key={`g-${mover.coin}`}
                  mover={mover}
                  maxAbs={gainerMaxAbs}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-800/70" />

          <div>
            <div className="mb-1.5 text-[9px] uppercase tracking-[0.16em] text-zinc-600">
              Top Losers
            </div>
            <div className="space-y-0.5">
              {data.losers.length > 0 ? (
                data.losers.map((mover) => (
                  <MoverRow
                    key={`l-${mover.coin}`}
                    mover={mover}
                    maxAbs={loserMaxAbs}
                    onSelect={handleSelect}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 px-2 py-2 text-[11px] leading-4 text-zinc-500">
                  {range === "7d" ? "No other liquid perps are negative over 7D." : "No liquid perps are negative right now."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
