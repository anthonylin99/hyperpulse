"use client";

import { ArrowLeft, Radio } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import { formatFundingAPR, formatPct, formatUSD } from "@/lib/format";
import PriceChart from "@/components/PriceChart";
import { SurfaceButton } from "@/components/trading-ui";

interface ChartPanelProps {
  coin: string;
  onClose: () => void;
}

export default function ChartPanel({ coin, onClose }: ChartPanelProps) {
  const { assets } = useMarket();
  const asset = assets.find((entry) => entry.coin === coin);

  if (!asset) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-zinc-800 bg-[#13171f] text-zinc-500">
        Asset not found
      </div>
    );
  }

  const priceColor =
    asset.priceChange24h > 0 ? "text-emerald-300" : asset.priceChange24h < 0 ? "text-rose-300" : "text-zinc-100";

  const priceDecimals = asset.markPx < 0.01 ? 6 : asset.markPx < 1 ? 4 : 2;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#13171f]">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <SurfaceButton onClick={onClose} tone="ghost" size="sm" className="px-2.5">
              <ArrowLeft className="h-4 w-4" />
            </SurfaceButton>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Market chart</div>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <div className="font-mono text-lg font-semibold text-zinc-100">{coin}</div>
                <div className="font-mono text-base text-zinc-100">{formatUSD(asset.markPx, priceDecimals)}</div>
                <div className={`font-mono text-sm ${priceColor}`}>{formatPct(asset.priceChange24h)}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 font-mono">
              Funding APR {formatFundingAPR(asset.fundingAPR)}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 font-mono">
              <Radio className="h-3.5 w-3.5 text-emerald-300" />
              Live market
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        <PriceChart coin={coin} />
      </div>
    </div>
  );
}
