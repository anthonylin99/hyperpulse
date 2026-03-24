"use client";

import { useState } from "react";
import Nav from "@/components/Nav";
import FundingFlashcards from "@/components/FundingFlashcards";
import MarketTable from "@/components/MarketTable";
import ActivityFeed from "@/components/ActivityFeed";
import PortfolioPanel from "@/components/PortfolioPanel";
import TradeDrawer from "@/components/TradeDrawer";
import { useMarket } from "@/context/MarketContext";

export default function Home() {
  const { selectedAsset, setSelectedAsset, error } = useMarket();
  const [tradeDrawer, setTradeDrawer] = useState<{
    coin: string;
    direction: "long" | "short";
  } | null>(null);

  return (
    <>
      <div className="dashboard-grid">
        {/* Zone 1 — Top Nav */}
        <div className="zone-nav">
          {error && (
            <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-1.5 text-xs text-red-400 font-mono text-center">
              Failed to fetch market data — retrying...
            </div>
          )}
          <Nav />
        </div>

        {/* Zone 2 — Funding Flashcards */}
        <div className="zone-flashcards">
          <FundingFlashcards />
        </div>

        {/* Zone 3 — Market Table */}
        <div className="zone-table">
          <MarketTable
            selectedAsset={selectedAsset}
            onSelectAsset={setSelectedAsset}
            onTrade={(coin, direction) => setTradeDrawer({ coin, direction })}
          />
        </div>

        {/* Zone 4 — Right Sidebar */}
        <div className="zone-sidebar">
          <div className="flex-1 overflow-hidden border-b border-zinc-800">
            <PortfolioPanel />
          </div>
          <div className="flex-1 overflow-hidden">
            <ActivityFeed />
          </div>
        </div>
      </div>

      {tradeDrawer && (
        <TradeDrawer
          coin={tradeDrawer.coin}
          direction={tradeDrawer.direction}
          onClose={() => setTradeDrawer(null)}
        />
      )}
    </>
  );
}
