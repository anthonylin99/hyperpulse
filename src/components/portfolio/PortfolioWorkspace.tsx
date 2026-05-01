"use client";

import { useMemo, useState, type ReactNode } from "react";
import { BarChart3, CircleDashed, FolderKanban, Rows3, SlidersHorizontal } from "lucide-react";
import DashboardHeader from "@/components/portfolio/DashboardHeader";
import EquityCurve from "@/components/portfolio/EquityCurve";
import StatsGrid from "@/components/portfolio/StatsGrid";
import FactorLeaderStrip from "@/components/factors/FactorLeaderStrip";
import RiskStrip from "@/components/portfolio/RiskStrip";
import CorrelationMap from "@/components/portfolio/CorrelationMap";
import PositionsTable from "@/components/portfolio/PositionsTable";
import PositionTradeLevelsPanel from "@/components/portfolio/PositionTradeLevelsPanel";
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
import { useAppConfig } from "@/context/AppConfigContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { useWallet } from "@/context/WalletContext";
import { cn, formatUSD } from "@/lib/format";

type PortfolioSubtab = "overview" | "positions" | "journal" | "details";

const PORTFOLIO_TABS: Array<{ key: PortfolioSubtab; label: string; helper: string }> = [
  { key: "overview", label: "Overview", helper: "Performance first" },
  { key: "positions", label: "Positions", helper: "Live exposure" },
  { key: "journal", label: "Journal", helper: "Closed trade review" },
  { key: "details", label: "Details", helper: "Deep diagnostics" },
];

const TAB_ICONS: Record<PortfolioSubtab, typeof BarChart3> = {
  overview: BarChart3,
  positions: Rows3,
  journal: FolderKanban,
  details: SlidersHorizontal,
};

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
      <div className="text-sm font-medium text-zinc-200">No open holdings right now.</div>
      <div className="mt-2 text-sm text-zinc-500">
        This tab will show live perp exposure and non-USDC spot or HIP-3 balances as soon as they exist on the wallet.
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
  const { factorsEnabled } = useAppConfig();
  const { trades, loading, error } = usePortfolio();
  const { accountState } = useWallet();
  const [subtab, setSubtab] = useState<PortfolioSubtab>("overview");
  const density = "compact" as const;

  const perpPositions = accountState?.positions?.length ?? 0;
  const spotPositions = accountState?.spotPositions?.length ?? 0;
  const totalHoldings = perpPositions + spotPositions;
  const hasPositions = totalHoldings > 0;
  const hasTrades = trades.length > 0;
  const hasContent = hasTrades || hasPositions;
  const accountValue = accountState?.accountValue ?? 0;

  const overviewSections = useMemo(
    () => (
      <>
        {hasTrades && <EquityCurve density={density} />}
        <StatsGrid density={density} />
        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-4">
            {factorsEnabled ? <FactorLeaderStrip /> : null}
            <RiskStrip density={density} />
          </div>
          {hasPositions ? (
            <section className="rounded-[26px] border border-zinc-800 bg-zinc-950/85 p-5">
              <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-400/75">
                Today&apos;s Account State
              </div>
              <div className="mt-3 space-y-3 text-sm text-zinc-300">
                <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-3">
                  <span className="text-zinc-500">Open holdings</span>
                  <span className="font-medium text-zinc-100">{totalHoldings}</span>
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
                No live perps or spot balances right now. Use the Markets tab to scan setups, then come back here to review how the book evolves.
              </div>
            </section>
          )}
        </div>
        {hasPositions ? <CorrelationMap /> : null}
      </>
    ),
    [accountValue, factorsEnabled, hasPositions, hasTrades, totalHoldings],
  );

  return (
    <div className="space-y-5 pb-4">
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
          <section className="space-y-4">
            <div className="rounded-[22px] border border-emerald-900/35 bg-[linear-gradient(180deg,rgba(8,18,16,0.92),rgba(9,9,11,0.9))] p-3 shadow-[0_0_0_1px_rgba(16,185,129,0.06)] sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="px-1">
                  <div className="flex items-center gap-2">
                    <CircleDashed className="h-4 w-4 text-emerald-300" />
                    <div className="text-[12px] font-mono uppercase tracking-[0.2em] text-zinc-100">
                      Portfolio review
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-zinc-400">
                    Overview, live exposure, journal, and diagnostics.
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {PORTFOLIO_TABS.map((tab) => {
                  const Icon = TAB_ICONS[tab.key];
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setSubtab(tab.key)}
                      className={cn(
                        "flex min-h-[104px] items-start gap-3 rounded-[18px] border px-4 py-4 text-left transition-all",
                        subtab === tab.key
                          ? "border-emerald-400/35 bg-emerald-500/[0.13] text-zinc-50 shadow-[0_0_0_1px_rgba(16,185,129,0.22)]"
                          : "border-zinc-800 bg-zinc-950/80 text-zinc-500 hover:border-zinc-700 hover:bg-zinc-950 hover:text-zinc-200",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                          subtab === tab.key
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                            : "border-zinc-800 bg-zinc-900/60 text-zinc-500"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-mono text-sm uppercase tracking-[0.08em] text-zinc-100">{tab.label}</div>
                        <div
                          className={cn(
                            "mt-1 text-[11px]",
                            subtab === tab.key ? "text-zinc-300" : "text-zinc-500"
                          )}
                        >
                          {tab.helper}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              {subtab === "overview" && overviewSections}

              {subtab === "positions" && (
                <div className="space-y-4">
                  <RiskStrip density={density} />
                  {hasPositions ? <PositionTradeLevelsPanel /> : null}
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
                          <CorrelationMap />
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
            </div>
          </section>
        </>
      )}
    </div>
  );
}
