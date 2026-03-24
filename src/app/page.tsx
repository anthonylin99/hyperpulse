"use client";

import Nav from "@/components/Nav";
import FundingFlashcards from "@/components/FundingFlashcards";
import MarketTable from "@/components/MarketTable";
import ActivityFeed from "@/components/ActivityFeed";
import { useMarket } from "@/context/MarketContext";

export default function Home() {
  const { selectedAsset, setSelectedAsset, error } = useMarket();

  return (
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

      {/* Zone 3 — Market Table (accordion detail is inline) */}
      <div className="zone-table">
        <MarketTable
          selectedAsset={selectedAsset}
          onSelectAsset={setSelectedAsset}
        />
      </div>

      {/* Zone 4 — Right Sidebar */}
      <div className="zone-sidebar">
        <div className="flex-1 overflow-hidden border-b border-zinc-800 flex flex-col items-center justify-center p-4">
          <p className="text-sm text-zinc-600 font-sans">Portfolio — Coming Soon</p>
        </div>
        <div className="flex-1 overflow-hidden">
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
