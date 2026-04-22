"use client";

import { useEffect, useState } from "react";
import MarketOverviewPanel from "@/components/MarketOverviewPanel";
import MarketTable from "@/components/MarketTable";
import TradeDrawer from "@/components/TradeDrawer";
import { useAppConfig } from "@/context/AppConfigContext";
import { useMarket } from "@/context/MarketContext";

export default function MarketsRoutePage({ initialAsset = null }: { initialAsset?: string | null }) {
  const { tradingEnabled } = useAppConfig();
  const { selectedAsset, setSelectedAsset, error: marketError } = useMarket();
  const [tradeDrawer, setTradeDrawer] = useState<{
    coin: string;
    direction: "long" | "short";
  } | null>(null);

  useEffect(() => {
    if (!initialAsset) return;
    setSelectedAsset(initialAsset.toUpperCase());
  }, [initialAsset, setSelectedAsset]);

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 pb-20">
        {marketError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Failed to fetch market data — retrying...
          </div>
        )}

        <MarketOverviewPanel
          title="Markets"
          description="A unified view of tomorrow bias, factor regime context, and benchmark perps before you scan the full market table."
        />

        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/75">
          <div className="border-b border-zinc-800 bg-zinc-950/50 px-5 py-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Market Directory</div>
            <div className="mt-2 text-lg font-semibold text-zinc-100">
              Search, filter, and inspect Hyperliquid perps and HIP-3 spot markets.
            </div>
            <div className="mt-1 text-sm text-zinc-400">
              The market table stays interactive, but now lives inside the same persistent shell as the rest of HyperPulse.
            </div>
          </div>
          <MarketTable
            selectedAsset={selectedAsset}
            onSelectAsset={setSelectedAsset}
            onTrade={(coin, direction) => (tradingEnabled ? setTradeDrawer({ coin, direction }) : null)}
          />
        </section>
      </div>

      {tradeDrawer && tradingEnabled && (
        <TradeDrawer
          coin={tradeDrawer.coin}
          direction={tradeDrawer.direction}
          onClose={() => setTradeDrawer(null)}
        />
      )}
    </>
  );
}
