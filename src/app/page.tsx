"use client";

import { useState } from "react";
import Nav from "@/components/Nav";
import HomePage from "@/components/HomePage";
import MarketOverviewPanel from "@/components/MarketOverviewPanel";
import ConnectPrompt from "@/components/portfolio/ConnectPrompt";
import DashboardHeader from "@/components/portfolio/DashboardHeader";
import PositionsTable from "@/components/portfolio/PositionsTable";
import RiskStrip from "@/components/portfolio/RiskStrip";
import StatsGrid from "@/components/portfolio/StatsGrid";
import TradeSignals from "@/components/portfolio/TradeSignals";
import SystemProfile from "@/components/portfolio/SystemProfile";
import EquityCurve from "@/components/portfolio/EquityCurve";
import TradeJournal from "@/components/portfolio/TradeJournal";
import AssetBreakdown from "@/components/portfolio/AssetBreakdown";
import FundingAnalysis from "@/components/portfolio/FundingAnalysis";
import InsightsPanel from "@/components/portfolio/InsightsPanel";
import PnLWaterfall from "@/components/portfolio/PnLWaterfall";
import BenchmarkPanel from "@/components/portfolio/BenchmarkPanel";
import Recommendations from "@/components/portfolio/Recommendations";
import PerformanceHeatmap from "@/components/portfolio/PerformanceHeatmap";
import MonthlyPnL from "@/components/portfolio/MonthlyPnL";
import MoreStats from "@/components/portfolio/MoreStats";
import DocsPage from "@/components/docs/DocsPage";
import FactorsPage from "@/components/factors/FactorsPage";
import FactorDeployPage from "@/components/factors/FactorDeployPage";
import FactorLeaderStrip from "@/components/factors/FactorLeaderStrip";
import MarketTable from "@/components/MarketTable";
import TradeDrawer from "@/components/TradeDrawer";
import { useWallet } from "@/context/WalletContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { useMarket } from "@/context/MarketContext";
import { ENABLE_TRADING } from "@/lib/appConfig";
import { cn, formatUSD } from "@/lib/format";

type Tab = "home" | "portfolio" | "markets" | "factors" | "deploy" | "docs";

const APP_TABS: Array<{ key: Tab; label: string }> = [
  { key: "home", label: "Home" },
  { key: "portfolio", label: "Portfolio" },
  { key: "markets", label: "Markets" },
  { key: "factors", label: "Factors" },
  { key: "deploy", label: "Deploy" },
  { key: "docs", label: "Docs" },
];

export default function Home() {
  const { isConnected, accountState } = useWallet();
  const { trades, loading: portfolioLoading, error: portfolioError } = usePortfolio();
  const { selectedAsset, setSelectedAsset, error: marketError } = useMarket();
  const [tab, setTab] = useState<Tab>("home");
  const [tradeDrawer, setTradeDrawer] = useState<{
    coin: string;
    direction: "long" | "short";
  } | null>(null);

  const hasPositions = (accountState?.positions?.length ?? 0) > 0;
  const hasTrades = trades.length > 0;
  const hasContent = hasTrades || hasPositions;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Nav />

      <div className="border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="inline-flex flex-wrap gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-1.5">
            {APP_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                  tab === t.key
                    ? "bg-teal-500/12 text-zinc-50 shadow-[0_0_0_1px_rgba(45,212,191,0.14)]"
                    : "text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "home" ? (
        <HomePage onSelectTab={setTab} />
      ) : tab === "portfolio" ? (
        !isConnected ? (
          <ConnectPrompt />
        ) : (
          <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 pb-20">
            {portfolioError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                {portfolioError}
              </div>
            )}

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

            {(hasContent || portfolioLoading) && (
              <>
                <DashboardHeader />
                <FactorLeaderStrip />
                <PositionsTable />
                <RiskStrip />
              </>
            )}

            {portfolioLoading && !hasTrades && (
              <>
                <StatsGrid />
                <EquityCurve />
              </>
            )}

            {hasTrades && (
              <>
                <StatsGrid />
                <SystemProfile />
                <TradeSignals />
                <EquityCurve />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <PnLWaterfall />
                  <BenchmarkPanel />
                </div>

                <Recommendations />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <PerformanceHeatmap />
                  <AssetBreakdown />
                </div>

                <MonthlyPnL />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <FundingAnalysis />
                  <InsightsPanel />
                </div>

                <MoreStats />
                <TradeJournal />
              </>
            )}
          </div>
        )
      ) : tab === "markets" ? (
        <>
          <div className="max-w-7xl mx-auto px-4 py-6 pb-20 space-y-6">
            {marketError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                Failed to fetch market data — retrying...
              </div>
            )}

            <MarketOverviewPanel
              title="Markets"
              description="A unified view of tomorrow bias, factor regime context, and benchmark perps before you scan the full market table."
            />

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 overflow-hidden">
              <div className="border-b border-zinc-800 bg-zinc-950/50 px-5 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Market Directory
                </div>
                <div className="mt-2 text-lg font-semibold text-zinc-100">
                  Search, filter, and inspect Hyperliquid perps and HIP-3 spot markets.
                </div>
                <div className="mt-1 text-sm text-zinc-400">
                  The market table below stays interactive, but now sits inside the same app shell as the rest of HyperPulse.
                </div>
              </div>
              <MarketTable
                selectedAsset={selectedAsset}
                onSelectAsset={setSelectedAsset}
                onTrade={(coin, direction) =>
                  ENABLE_TRADING ? setTradeDrawer({ coin, direction }) : null
                }
              />
            </section>
          </div>

          {tradeDrawer && ENABLE_TRADING && (
            <TradeDrawer
              coin={tradeDrawer.coin}
              direction={tradeDrawer.direction}
              onClose={() => setTradeDrawer(null)}
            />
          )}
        </>
      ) : tab === "factors" ? (
        <FactorsPage />
      ) : tab === "deploy" ? (
        <FactorDeployPage />
      ) : (
        <DocsPage />
      )}
    </div>
  );
}
