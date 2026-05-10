"use client";

import { useEffect, useState } from "react";
import { MousePointerClick } from "lucide-react";
import MarketRadarPanel from "@/components/MarketRadarPanel";
import MarketTable from "@/components/MarketTable";
import TopMoversPanel from "@/components/markets/TopMoversPanel";
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
    const asset = initialAsset.toUpperCase();
    setSelectedAsset(asset);
    window.setTimeout(() => {
      document.getElementById(`market-asset-${asset.replace(/[^a-zA-Z0-9_-]/g, "-")}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);
  }, [initialAsset, setSelectedAsset]);

  return (
    <>
      <div className="space-y-5">
        {marketError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Failed to fetch market data — retrying...
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
          <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/75">
            <div className="border-b border-zinc-800 bg-zinc-950/50 px-5 py-3">
              <div className="flex flex-col gap-1">
                <div>
                  <div className="label text-accent/80">Markets</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-100">Market directory</div>
                  <div className="mt-1 text-sm text-zinc-400">
                    Hyperliquid perps and spot markets — search, filter, inspect.
                  </div>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-[11px] text-zinc-400">
                    <MousePointerClick className="h-3.5 w-3.5 text-accent" />
                    Select an asset to view details.
                  </div>
                </div>
              </div>
            </div>
            <MarketTable
              selectedAsset={selectedAsset}
              onSelectAsset={setSelectedAsset}
              onTrade={(coin, direction) => (tradingEnabled ? setTradeDrawer({ coin, direction }) : null)}
            />
          </section>

          <div className="space-y-4 xl:sticky xl:top-[96px]">
            <MarketRadarPanel variant="rail" />
            <TopMoversPanel />
          </div>
        </div>
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
