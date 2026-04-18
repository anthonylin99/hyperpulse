"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import DashboardHeader from "@/components/portfolio/DashboardHeader";
import EquityCurve from "@/components/portfolio/EquityCurve";
import StatsGrid from "@/components/portfolio/StatsGrid";
import FactorLeaderStrip from "@/components/factors/FactorLeaderStrip";
import RiskStrip from "@/components/portfolio/RiskStrip";
import PositionsTable from "@/components/portfolio/PositionsTable";
import MonthlyPnL from "@/components/portfolio/MonthlyPnL";
import TradeJournal from "@/components/portfolio/TradeJournal";
import PnLWaterfall from "@/components/portfolio/PnLWaterfall";
import BenchmarkPanel from "@/components/portfolio/BenchmarkPanel";
import PerformanceHeatmap from "@/components/portfolio/PerformanceHeatmap";
import AssetBreakdown from "@/components/portfolio/AssetBreakdown";
import FundingAnalysis from "@/components/portfolio/FundingAnalysis";
import SystemProfile from "@/components/portfolio/SystemProfile";
import TradeSignals from "@/components/portfolio/TradeSignals";
import MoreStats from "@/components/portfolio/MoreStats";
import { usePortfolio } from "@/context/PortfolioContext";
import { useWallet } from "@/context/WalletContext";
import { cn, formatUSD } from "@/lib/format";

type PortfolioSubtab = "overview" | "positions" | "journal" | "details";
type PortfolioDensity = "compact" | "roomy";

const PORTFOLIO_TABS: Array<{ key: PortfolioSubtab; label: string; helper: string }> = [
  { key: "overview", label: "01 Overview", helper: "Performance first" },
  { key: "positions", label: "02 Positions", helper: "Live exposure" },
  { key: "journal", label: "03 Journal", helper: "Closed trade review" },
  { key: "details", label: "04 Details", helper: "Deep diagnostics" },
];

function PortfolioEmptyState({ accountValue }: { accountValue: number }) {
  return (
    <section className="rounded-[28px] border border-emerald-900/30 bg-[linear-gradient(180deg,rgba(7,13,11,0.96),rgba(6,10,9,0.98))] p-8 text-center">
      <div className="mx-auto max-w-2xl">
        <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-400/70">
          Portfolio Overview
        </div>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">
          Your workspace is ready. It just needs trading history.
        </h2>
        <p className="mt-3 text-sm leading-7 text-zinc-400">
          Once this wallet has Hyperliquid trade history, HyperPulse will populate the chart-first
          portfolio view, journal, and review tabs automatically.
        </p>
        <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-emerald-900/30 bg-emerald-500/[0.06] px-5 py-3">
          <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">Account Value</span>
          <span className="text-xl font-semibold text-zinc-100">{formatUSD(accountValue)}</span>
        </div>
        <div className="mt-4 text-xs text-zinc-500">
          Connected successfully. Start trading on Hyperliquid to unlock journal and performance analytics.
        </div>
      </div>
    </section>
  );
}

function EmptyPositionsState() {
  return (
    <div className="rounded-[26px] border border-zinc-800 bg-zinc-950/80 px-6 py-10 text-center">
      <div className="text-sm font-medium text-zinc-200">No open positions right now.</div>
      <div className="mt-2 text-sm text-zinc-500">
        This tab will show live exposure, leverage, and liquidation distance as soon as you open a perp.
      </div>
    </div>
  );
}

function EmptyJournalState() {
  return (
    <div className="rounded-[26px] border border-zinc-800 bg-zinc-950/80 px-6 py-10 text-center">
      <div className="text-sm font-medium text-zinc-200">No closed trades to review yet.</div>
      <div className="mt-2 text-sm text-zinc-500">
        Once trades close, HyperPulse will populate the journal, notes, export, and trade analyzer here.
      </div>
    </div>
  );
}

function DetailSection({
  title,
  helper,
  defaultOpen = true,
  children,
}: {
  title: string;
  helper: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-[24px] border border-zinc-800 bg-zinc-950/80 open:border-emerald-900/30"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
        <div>
          <div className="text-sm font-medium text-zinc-100">{title}</div>
          <div className="mt-1 text-xs text-zinc-500">{helper}</div>
        </div>
        <div className="text-xs text-zinc-500 transition-transform group-open:rotate-180">⌃</div>
      </summary>
      <div className="border-t border-zinc-800 px-5 py-5">{children}</div>
    </details>
  );
}

export default function PortfolioWorkspace() {
  const { trades, loading, error } = usePortfolio();
  const { accountState } = useWallet();
  const [subtab, setSubtab] = useState<PortfolioSubtab>("overview");
  const [density, setDensity] = useState<PortfolioDensity>("compact");

  const hasPositions = (accountState?.positions?.length ?? 0) > 0;
  const hasTrades = trades.length > 0;
  const hasContent = hasTrades || hasPositions;
  const accountValue = accountState?.accountValue ?? 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("hp_portfolio_density");
    if (saved === "compact" || saved === "roomy") {
      setDensity(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("hp_portfolio_density", density);
  }, [density]);

  const overviewSections = useMemo(
    () => (
      <>
        {hasTrades && <EquityCurve density={density} />}
        <StatsGrid density={density} />
        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-4">
            <FactorLeaderStrip />
            <RiskStrip density={density} />
          </div>
          {hasPositions ? (
            <section className="rounded-[26px] border border-zinc-800 bg-zinc-950/85 p-5">
              <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-400/75">
                Today&apos;s Account State
              </div>
              <div className="mt-3 space-y-3 text-sm text-zinc-300">
                <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-3">
                  <span className="text-zinc-500">Open positions</span>
                  <span className="font-medium text-zinc-100">{accountState?.positions.length ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-3">
                  <span className="text-zinc-500">Account equity</span>
                  <span className="font-medium text-zinc-100">{formatUSD(accountValue)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">Focus</span>
                  <span className="font-medium text-zinc-100">
                    {hasTrades ? "Track live risk, then review the journal." : "Monitor live exposure while history builds."}
                  </span>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-[26px] border border-zinc-800 bg-zinc-950/85 p-5">
              <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-400/75">
                Today&apos;s Account State
              </div>
              <div className="mt-3 text-sm leading-7 text-zinc-400">
                No live perp exposure right now. Use the Markets tab to scan setups, then come back here to review how the book evolves.
              </div>
            </section>
          )}
        </div>
      </>
    ),
    [accountState?.positions.length, accountValue, density, hasPositions, hasTrades],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20 space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <DashboardHeader />

      {!loading && !hasContent ? (
        <PortfolioEmptyState accountValue={accountValue} />
      ) : (
        <>
          <section className="overflow-hidden rounded-[24px] border border-zinc-800 bg-zinc-950/70">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
              <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-500">
                Portfolio Review Workspace
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-600">
                  Density
                </span>
                <div className="inline-flex overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                  {(["compact", "roomy"] as PortfolioDensity[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setDensity(mode)}
                      className={cn(
                        "px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
                        density === mode
                          ? "bg-emerald-400 text-[#03221b]"
                          : "text-zinc-500 hover:text-zinc-200",
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 p-2">
              {PORTFOLIO_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSubtab(tab.key)}
                  className={cn(
                    "min-w-[168px] rounded-[18px] px-4 py-3 text-left transition-all",
                    subtab === tab.key
                      ? "bg-emerald-500/[0.08] text-zinc-50 shadow-[0_0_0_1px_rgba(16,185,129,0.16)]"
                      : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200",
                  )}
                >
                  <div className="font-mono text-sm">{tab.label}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">{tab.helper}</div>
                </button>
              ))}
            </div>
          </section>

          {subtab === "overview" && overviewSections}

          {subtab === "positions" && (
            <div className="space-y-4">
              <RiskStrip density={density} />
              {hasPositions ? <PositionsTable density={density} /> : <EmptyPositionsState />}
            </div>
          )}

          {subtab === "journal" && (
            <div className="space-y-4">
              {hasTrades ? (
                <>
                  <MonthlyPnL />
                  <TradeJournal density={density} />
                </>
              ) : (
                <EmptyJournalState />
              )}
            </div>
          )}

          {subtab === "details" && (
            <div className="space-y-4">
              {hasTrades ? (
                <>
                  <DetailSection
                    title="Performance Diagnostics"
                    helper="Benchmark the account and inspect where returns are actually coming from."
                  >
                    <div className="grid gap-4 xl:grid-cols-2">
                      <PnLWaterfall />
                      <BenchmarkPanel />
                    </div>
                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <PerformanceHeatmap />
                      <AssetBreakdown />
                    </div>
                  </DetailSection>

                  <DetailSection
                    title="Trade Tendencies"
                    helper="System readouts and compact data-backed tendencies from your current trade set."
                  >
                    <div className="space-y-4">
                      <SystemProfile />
                      <TradeSignals />
                    </div>
                  </DetailSection>

                  <DetailSection
                    title="Funding & Extended Stats"
                    helper="Secondary analytics that matter in review, but shouldn’t crowd the front page."
                    defaultOpen={false}
                  >
                    <div className="space-y-4">
                      <FundingAnalysis />
                      <MoreStats />
                    </div>
                  </DetailSection>
                </>
              ) : (
                <EmptyJournalState />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
