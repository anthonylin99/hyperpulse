"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
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

  // Use ref for accountValue to avoid re-triggering fetchData on every poll
  const accountValueRef = useRef(0);
  useEffect(() => {
    accountValueRef.current = accountState?.accountValue ?? 0;
  }, [accountState?.accountValue]);

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
  const hasFetchedRef = useRef(false);

  // Restore cached data on mount for instant load
  useEffect(() => {
    if (!address) return;
    try {
      const cached = localStorage.getItem(`hp_cache_${address.toLowerCase()}`);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.fills?.length > 0) {
          setFills(data.fills);
          setFunding(data.funding ?? []);
          // Recompute analytics from cached data
          const rawTrades = groupFillsIntoTrades(data.fills);
          const tradesWithFunding = mergeFundingIntoTrades(rawTrades, data.funding ?? []);
          setTrades(tradesWithFunding);
          const startBal = Math.max(...tradesWithFunding.map((t) => t.notional), 1000);
          const portfolioStats = computePortfolioStats(tradesWithFunding, data.funding ?? [], startBal);
          setStats(portfolioStats);
          setEquityCurve(computeEquityCurve(tradesWithFunding, startBal));
          setByAsset(computeByAsset(tradesWithFunding));
          setByHour(computeByTimeOfDay(tradesWithFunding));
          setByDay(computeByDayOfWeek(tradesWithFunding));
          setInsights(generateInsights(portfolioStats, computeByAsset(tradesWithFunding), computeByTimeOfDay(tradesWithFunding), computeByDayOfWeek(tradesWithFunding)));
        }
      }
    } catch {
      // Cache miss or corrupt — no problem, will fetch fresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const fetchData = useCallback(async () => {
    if (!address) return;

    // Only show full loading spinner on first fetch — subsequent refreshes are silent
    if (!hasFetchedRef.current) setLoading(true);
    setError(null);

    try {
      // Fetch all-time history — Hyperliquid blockchain is the source of truth
      const startTime = 0;
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

      // Cache fills + funding for instant load next time
      try {
        localStorage.setItem(
          `hp_cache_${address.toLowerCase()}`,
          JSON.stringify({ fills: normalizedFills, funding: normalizedFunding, cachedAt: Date.now() }),
        );
      } catch {
        // localStorage full — ignore
      }

      // Compute analytics
      const rawTrades = groupFillsIntoTrades(normalizedFills);
      const tradesWithFunding = mergeFundingIntoTrades(
        rawTrades,
        normalizedFunding,
      );
      setTrades(tradesWithFunding);

      // Estimate starting balance from deposits via ledger API
      let startBal = 1000; // fallback
      try {
        const ledgerRes = await fetch(
          `/api/user/ledger?address=${address}&startTime=0`,
        );
        if (ledgerRes.ok) {
          const ledgerData = await ledgerRes.json();
          // Sum all deposits and withdrawals to get net deposited
          let totalDeposited = 0;
          for (const entry of Array.isArray(ledgerData) ? ledgerData : []) {
            const delta = parseFloat(String(entry.delta?.usdc ?? entry.delta ?? "0"));
            const type = String(entry.type ?? "").toLowerCase();
            // accountClassTransfer, deposit, withdraw, internalTransfer
            if (type.includes("deposit") || type.includes("transfer")) {
              totalDeposited += delta;
            } else if (type.includes("withdraw")) {
              totalDeposited += delta; // delta is negative for withdrawals
            }
          }
          if (totalDeposited > 0) {
            startBal = totalDeposited;
          }
        }
      } catch {
        // Ledger fetch failed — use fallback estimation
      }

      // If ledger didn't give us a good number, estimate from account value
      if (startBal <= 1000) {
        const totalPnl = tradesWithFunding.reduce((s, t) => s + t.pnl, 0);
        const totalFunding = normalizedFunding.reduce((s, f) => s + f.usdc, 0);
        const totalFees = tradesWithFunding.reduce((s, t) => s + t.fees, 0);
        const currentValue = accountValueRef.current;
        if (currentValue > 0) {
          // Account equity - all gains = what you started with
          startBal = Math.max(currentValue - totalPnl - totalFunding + totalFees, 100);
        } else {
          const maxNotional = Math.max(
            ...tradesWithFunding.map((t) => t.notional),
            0,
          );
          startBal = Math.max(maxNotional, Math.abs(totalPnl) * 2, 1000);
        }
      }

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
      hasFetchedRef.current = true;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load portfolio data";
      setError(msg);
      console.error("Portfolio fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [address]);

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
      hasFetchedRef.current = false;
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
