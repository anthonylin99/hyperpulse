"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMarket } from "@/context/MarketContext";
import { useFactors } from "@/context/FactorContext";
import { useAppConfig } from "@/context/AppConfigContext";
import { computeHyperPulseVix } from "@/lib/proprietaryIndex";
import { cn, formatFundingAPR, formatPct, formatUSD } from "@/lib/format";

interface WhaleHeadline {
  headline: string;
  address: string;
}

function TickerItem({ label, value, tone = "neutral", href }: { label: string; value: string; tone?: "neutral" | "positive" | "negative"; href?: string }) {
  const content = (
    <div
      className={cn(
        "flex items-center gap-2 whitespace-nowrap border-r border-zinc-800/80 pr-4 last:border-r-0 last:pr-0",
        href && "transition hover:opacity-100",
      )}
    >
      <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">{label}</span>
      <span
        className={cn(
          "font-mono text-xs",
          tone === "positive" && "text-emerald-300",
          tone === "negative" && "text-rose-300",
          tone === "neutral" && "text-zinc-200",
        )}
      >
        {value}
      </span>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

export default function LiveTickerStrip() {
  const { assets, loading, lastUpdated, fundingHistories, btcCandles } = useMarket();
  const { leader } = useFactors();
  const { whalesEnabled, factorsEnabled } = useAppConfig();
  const [whaleHeadline, setWhaleHeadline] = useState<WhaleHeadline | null>(null);

  useEffect(() => {
    if (!whalesEnabled) {
      setWhaleHeadline(null);
      return;
    }
    let mounted = true;

    const loadHeadline = async () => {
      try {
        const response = await fetch("/api/whales/feed?timeframe=24h&severity=all", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { alerts?: Array<{ headline: string; walletAddress?: string; wallet?: string }> };
        const first = data.alerts?.[0];
        if (!mounted || !first) return;
        setWhaleHeadline({
          headline: first.headline,
          address: first.walletAddress ?? first.wallet ?? "",
        });
      } catch {
        // ignore ticker headline failures
      }
    };

    loadHeadline();
    const interval = window.setInterval(loadHeadline, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [whalesEnabled]);

  const btc = assets.find((asset) => asset.coin === "BTC");
  const eth = assets.find((asset) => asset.coin === "ETH");
  const bias = useMemo(
    () => computeHyperPulseVix({ assets, fundingHistories, btcCandles }),
    [assets, fundingHistories, btcCandles],
  );
  const majors = assets.filter((asset) => ["BTC", "ETH", "SOL", "HYPE"].includes(asset.coin));
  const medianFunding = useMemo(() => {
    if (majors.length === 0) return null;
    const values = majors.map((asset) => asset.fundingAPR).sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
  }, [majors]);

  const leader7d = leader?.windows.find((window) => window.days === 7)?.spreadReturn ?? null;

  const timeLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--";

  return (
    <div className="border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto max-w-[1480px] px-4 py-2 sm:px-6 xl:px-8">
        <div className="scrollbar-hide flex items-center gap-4 overflow-x-auto text-xs">
          <TickerItem
            label="BTC"
            value={btc ? `${formatUSD(btc.markPx, btc.markPx < 1 ? 4 : 2)} ${formatPct(btc.priceChange24h)}` : loading ? "Loading..." : "n/a"}
            tone={btc && btc.priceChange24h >= 0 ? "positive" : btc ? "negative" : "neutral"}
            href="/markets?asset=BTC"
          />
          <TickerItem
            label="ETH"
            value={eth ? `${formatUSD(eth.markPx, eth.markPx < 1 ? 4 : 2)} ${formatPct(eth.priceChange24h)}` : loading ? "Loading..." : "n/a"}
            tone={eth && eth.priceChange24h >= 0 ? "positive" : eth ? "negative" : "neutral"}
            href="/markets?asset=ETH"
          />
          <TickerItem
            label="Funding (7D)"
            value={medianFunding == null ? "n/a" : formatFundingAPR(medianFunding)}
            tone={medianFunding == null ? "neutral" : medianFunding >= 0 ? "negative" : "positive"}
            href="/markets"
          />
          <TickerItem
            label="Bias"
            value={`${bias.trendLabel} (${bias.trendScore >= 0 ? "+" : ""}${bias.trendScore})`}
            tone={bias.trendScore >= 0 ? "positive" : "negative"}
            href="/markets"
          />
          {factorsEnabled ? (
            <TickerItem
              label={leader ? "Top Factor" : "Factors"}
              value={leader7d != null ? `${leader?.snapshot.name ?? "Top factor"} ${formatPct(leader7d)}` : "Live regimes"}
              tone={leader7d != null ? (leader7d >= 0 ? "positive" : "negative") : "neutral"}
              href="/factors"
            />
          ) : null}
          {whalesEnabled ? (
            <TickerItem
              label="Whale Alert"
              value={whaleHeadline?.headline ?? "Watching live tape"}
              tone="negative"
              href={whaleHeadline?.address ? `/whales/${whaleHeadline.address}` : "/whales"}
            />
          ) : null}
          <div className="ml-auto flex items-center gap-2 whitespace-nowrap pl-2 text-zinc-400">
            <span className={cn("h-2 w-2 rounded-full", loading ? "bg-zinc-600" : "bg-emerald-400")}></span>
            <span>{loading ? "Syncing" : "Live"}</span>
            <span className="font-mono text-zinc-200">{timeLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
