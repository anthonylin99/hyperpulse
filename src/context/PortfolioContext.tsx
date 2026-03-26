"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useWallet } from "./WalletContext";
import {
  groupFillsIntoTrades,
  mergeFundingIntoTrades,
  computePortfolioStats,
  computeEquityCurve,
  computeByAsset,
  computeByTimeOfDay,
  computeByDayOfWeek,
} from "@/lib/analytics";
import { generateInsights } from "@/lib/insights";
import type {
  Fill,
  FundingEntry,
  RoundTripTrade,
  PortfolioStats,
  AssetBreakdown,
  HourlyBreakdown,
  DailyBreakdown,
  EquityPoint,
  Insight,
} from "@/types";

interface PortfolioContextValue {
  fills: Fill[];
  funding: FundingEntry[];
  trades: RoundTripTrade[];
  stats: PortfolioStats | null;
  equityCurve: EquityPoint[];
  byAsset: AssetBreakdown[];
  byHour: HourlyBreakdown[];
  byDay: DailyBreakdown[];
  insights: Insight[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { address, isConnected, accountState } = useWallet();

  const [fills, setFills] = useState<Fill[]>([]);
  const [funding, setFunding] = useState<FundingEntry[]>([]);
  const [trades, setTrades] = useState<RoundTripTrade[]>([]);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [equityCurve, setEquityCurve] = useState<EquityPoint[]>([]);
  const [byAsset, setByAsset] = useState<AssetBreakdown[]>([]);
  const [byHour, setByHour] = useState<HourlyBreakdown[]>([]);
  const [byDay, setByDay] = useState<DailyBreakdown[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch fills from 90 days ago by default to get meaningful history
      const startTime = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const [fillsRes, fundingRes] = await Promise.all([
        fetch(
          `/api/user/fills?address=${address}&startTime=${startTime}&aggregateByTime=true`,
        ),
        fetch(
          `/api/user/funding?address=${address}&startTime=${startTime}`,
        ),
      ]);

      if (!fillsRes.ok) throw new Error("Failed to fetch trade history");
      if (!fundingRes.ok) throw new Error("Failed to fetch funding history");

      const rawFills = await fillsRes.json();
      const rawFunding = await fundingRes.json();

      // Normalize fills from HL API format
      const normalizedFills: Fill[] = (
        Array.isArray(rawFills) ? rawFills : []
      ).map((f: Record<string, unknown>) => ({
        coin: String(f.coin ?? ""),
        side: String(f.side ?? "A") as "A" | "B",
        dir: String(f.dir ?? "") as Fill["dir"],
        px: parseFloat(String(f.px ?? "0")),
        sz: parseFloat(String(f.sz ?? "0")),
        time: Number(f.time ?? 0),
        fee: parseFloat(String(f.fee ?? "0")),
        feeToken: String(f.feeToken ?? "USDC"),
        closedPnl: parseFloat(String(f.closedPnl ?? "0")),
        crossed: Boolean(f.crossed),
        hash: String(f.hash ?? ""),
        liquidation: Boolean(f.liquidation),
        oid: Number(f.oid ?? 0),
        cloid: f.cloid ? String(f.cloid) : null,
      }));

      const normalizedFunding: FundingEntry[] = (
        Array.isArray(rawFunding) ? rawFunding : []
      ).map((f: Record<string, unknown>) => ({
        time: Number(f.time ?? 0),
        coin: String(f.coin ?? ""),
        usdc: parseFloat(String(f.usdc ?? "0")),
        positionSize: parseFloat(String(f.szi ?? "0")),
        fundingRate: parseFloat(String(f.fundingRate ?? "0")),
        nSamples: Number(f.nSamples ?? 0),
      }));

      setFills(normalizedFills);
      setFunding(normalizedFunding);

      // Compute analytics
      const rawTrades = groupFillsIntoTrades(normalizedFills);
      const tradesWithFunding = mergeFundingIntoTrades(
        rawTrades,
        normalizedFunding,
      );
      setTrades(tradesWithFunding);

      // Estimate starting balance: current equity + losses recovered, or at minimum
      // use the max notional position as a proxy for capital deployed.
      const totalPnl = tradesWithFunding.reduce((s, t) => s + t.pnl, 0);
      const maxNotional = Math.max(
        ...tradesWithFunding.map((t) => t.notional),
        0,
      );
      const currentValue = accountState?.accountValue ?? 0;
      // If account has value, use that minus PnL to estimate starting balance.
      // Otherwise estimate from max position size or total losses.
      const startBal =
        currentValue > 0
          ? currentValue - totalPnl
          : Math.max(maxNotional, Math.abs(totalPnl) * 2, 1000);

      const portfolioStats = computePortfolioStats(
        tradesWithFunding,
        normalizedFunding,
        startBal,
      );
      setStats(portfolioStats);

      const curve = computeEquityCurve(tradesWithFunding, startBal);
      setEquityCurve(curve);

      const assetData = computeByAsset(tradesWithFunding);
      setByAsset(assetData);

      const hourData = computeByTimeOfDay(tradesWithFunding);
      setByHour(hourData);

      const dayData = computeByDayOfWeek(tradesWithFunding);
      setByDay(dayData);

      const tradeInsights = generateInsights(
        portfolioStats,
        assetData,
        hourData,
        dayData,
      );
      setInsights(tradeInsights);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load portfolio data";
      setError(msg);
      console.error("Portfolio fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [address, accountState?.accountValue]);

  // Fetch on connect
  useEffect(() => {
    if (isConnected && address) {
      fetchData();
    }
  }, [isConnected, address, fetchData]);

  // Reset on disconnect
  useEffect(() => {
    if (!isConnected) {
      setFills([]);
      setFunding([]);
      setTrades([]);
      setStats(null);
      setEquityCurve([]);
      setByAsset([]);
      setByHour([]);
      setByDay([]);
      setInsights([]);
      setError(null);
    }
  }, [isConnected]);

  return (
    <PortfolioContext.Provider
      value={{
        fills,
        funding,
        trades,
        stats,
        equityCurve,
        byAsset,
        byHour,
        byDay,
        insights,
        loading,
        error,
        refresh: fetchData,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx)
    throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
