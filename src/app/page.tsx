"use client";

import { useState } from "react";
import Nav from "@/components/Nav";
import { useWallet } from "@/context/WalletContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { cn, formatUSD } from "@/lib/format";

// Portfolio components
import ConnectPrompt from "@/components/portfolio/ConnectPrompt";
import DashboardHeader from "@/components/portfolio/DashboardHeader";
import PositionsTable from "@/components/portfolio/PositionsTable";
import RiskStrip from "@/components/portfolio/RiskStrip";
import StatsGrid from "@/components/portfolio/StatsGrid";
import EquityCurve from "@/components/portfolio/EquityCurve";
import TradeJournal from "@/components/portfolio/TradeJournal";
import AssetBreakdown from "@/components/portfolio/AssetBreakdown";
import FundingAnalysis from "@/components/portfolio/FundingAnalysis";
import InsightsPanel from "@/components/portfolio/InsightsPanel";
import PnLWaterfall from "@/components/portfolio/PnLWaterfall";
import BenchmarkPanel from "@/components/portfolio/BenchmarkPanel";
import Recommendations from "@/components/portfolio/Recommendations";

// Market components (secondary tab)
import FundingFlashcards from "@/components/FundingFlashcards";
import MarketTable from "@/components/MarketTable";
import ActivityFeed from "@/components/ActivityFeed";
import PortfolioPanel from "@/components/PortfolioPanel";
import TradeDrawer from "@/components/TradeDrawer";
import { useMarket } from "@/context/MarketContext";

type Tab = "portfolio" | "markets";

export default function Home() {
  const { isConnected, accountState } = useWallet();
  const { trades, loading: portfolioLoading, error: portfolioError } = usePortfolio();
  const { selectedAsset, setSelectedAsset, error: marketError } = useMarket();
  const [tab, setTab] = useState<Tab>("portfolio");
  const [tradeDrawer, setTradeDrawer] = useState<{
    coin: string;
    direction: "long" | "short";
  } | null>(null);

  const hasPositions = (accountState?.positions?.length ?? 0) > 0;
  const hasTrades = trades.length > 0;
  const hasContent = hasTrades || hasPositions;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Nav */}
      <Nav />

      {/* Tab bar */}
      <div className="border-b border-zinc-800 px-4">
        <div className="max-w-7xl mx-auto flex gap-1">
          {(["portfolio", "markets"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors relative",
                tab === t
                  ? "text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {t === "portfolio" ? "Portfolio" : "Markets"}
              {tab === t && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {tab === "portfolio" ? (
        !isConnected ? (
          <ConnectPrompt />
        ) : (
          <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 pb-20">
            {portfolioError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                {portfolioError}
              </div>
            )}

            {/* Empty state: connected, done loading, no trades AND no positions */}
            {!portfolioLoading && !hasContent && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-zinc-500 text-sm mb-2">
                  No trades found for this address on Hyperliquid.
                </div>
                {accountState && accountState.accountValue > 0 && (
                  <div className="text-zinc-400 text-sm mb-4">
                    Account balance: {formatUSD(accountState.accountValue)}
                  </div>
                )}
                <div className="text-zinc-600 text-xs">
                  Start trading on Hyperliquid to see your analytics here.
                </div>
              </div>
            )}

            {/* Always show header + positions + risk if connected (even without closed trades) */}
            {(hasContent || portfolioLoading) && (
              <>
                <DashboardHeader />
                <PositionsTable />
                <RiskStrip />
              </>
            )}

            {/* Skeleton loading for first fetch */}
            {portfolioLoading && !hasTrades && (
              <>
                <StatsGrid />
                <EquityCurve />
              </>
            )}

            {/* Full analytics — only when we have closed trades */}
            {hasTrades && (
              <>
                <StatsGrid />
                <EquityCurve />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <PnLWaterfall />
                  <BenchmarkPanel />
                </div>

                <Recommendations />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <AssetBreakdown />
                  <FundingAnalysis />
                </div>

                <InsightsPanel />
                <TradeJournal />
              </>
            )}
          </div>
        )
      ) : (
        /* Markets tab — existing dashboard */
        <>
          <div className="dashboard-grid">
            {marketError && (
              <div className="zone-nav">
                <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-1.5 text-xs text-red-400 font-mono text-center">
                  Failed to fetch market data — retrying...
                </div>
              </div>
            )}

            <div className="zone-flashcards">
              <FundingFlashcards />
            </div>

            <div className="zone-table">
              <MarketTable
                selectedAsset={selectedAsset}
                onSelectAsset={setSelectedAsset}
                onTrade={(coin, direction) =>
                  setTradeDrawer({ coin, direction })
                }
              />
            </div>

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
      )}
    </div>
  );
}
