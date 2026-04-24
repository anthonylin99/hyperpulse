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
      <div className="space-y-5">
        {marketError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Failed to fetch market data — retrying...
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
          <section className="overflow-hidden rounded-[28px] border border-zinc-800 bg-zinc-900/75">
            <div className="border-b border-zinc-800 bg-zinc-950/50 px-5 py-3">
              <div className="flex flex-col gap-1">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">Markets</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-100">Market directory</div>
                  <div className="mt-1 text-sm text-zinc-400">
                    Search, filter, and inspect Hyperliquid perps plus available RWA spot markets.
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

          <div className="xl:sticky xl:top-[96px]">
            <MarketOverviewPanel
              title="Tape Context"
              description="Tomorrow bias and major benchmark context stay close, but secondary to the directory."
              variant="compact"
            />
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
