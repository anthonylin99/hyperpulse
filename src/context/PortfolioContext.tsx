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
import { withNetworkParam } from "@/lib/hyperliquid";
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
  CorrelationResult,
  TradeSizingSnapshot,
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
  sizingSnapshots: TradeSizingSnapshot[];
  correlation: CorrelationResult | null;
  researchLoading: boolean;
  researchError: string | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  refresh: () => Promise<void>;
  refreshResearch: () => Promise<void>;
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
  const [sizingSnapshots, setSizingSnapshots] = useState<TradeSizingSnapshot[]>([]);
  const [correlation, setCorrelation] = useState<CorrelationResult | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
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
          setInsights(generateInsights(
            portfolioStats,
            computeByAsset(tradesWithFunding),
            computeByTimeOfDay(tradesWithFunding),
            computeByDayOfWeek(tradesWithFunding),
            (data.funding ?? []).length,
          ));
        }
      }
    } catch {
      // Cache miss or corrupt — no problem, will fetch fresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const captureSizingSnapshot = useCallback(async () => {
    if (!address) return;
    await fetch(withNetworkParam("/api/portfolio/sizing-snapshot"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    }).catch(() => null);
  }, [address]);

  const registerTrackedWallet = useCallback(async () => {
    if (!address) return;
    await fetch(withNetworkParam("/api/portfolio/tracked-wallets"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    }).catch(() => null);
  }, [address]);

  const refreshSizingSnapshots = useCallback(async () => {
    if (!address) return;
    const sizingRes = await fetch(withNetworkParam(`/api/portfolio/sizing?address=${address}&days=730`));
    if (sizingRes.ok) {
      const sizingPayload = await sizingRes.json();
      setSizingSnapshots(Array.isArray(sizingPayload.snapshots) ? sizingPayload.snapshots : []);
    }
  }, [address]);

  const fetchResearch = useCallback(async () => {
    if (!address) return;
    setResearchLoading(true);
    setResearchError(null);

    try {
      await captureSizingSnapshot();

      const [sizingRes, correlationRes] = await Promise.all([
        fetch(withNetworkParam(`/api/portfolio/sizing?address=${address}&days=730`)),
        fetch(withNetworkParam(`/api/portfolio/correlations?address=${address}&days=90`)),
      ]);

      if (sizingRes.ok) {
        const sizingPayload = await sizingRes.json();
        setSizingSnapshots(Array.isArray(sizingPayload.snapshots) ? sizingPayload.snapshots : []);
      } else {
        setSizingSnapshots([]);
      }

      if (correlationRes.ok) {
        const correlationPayload = await correlationRes.json();
        setCorrelation(correlationPayload as CorrelationResult);
      } else {
        setCorrelation(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Research layer unavailable";
      setResearchError(msg);
      setSizingSnapshots([]);
      setCorrelation(null);
    } finally {
      setResearchLoading(false);
    }
  }, [address, captureSizingSnapshot]);

  const fetchData = useCallback(async () => {
    if (!address) return;

    // Only show full loading spinner on first fetch — subsequent refreshes are silent
    if (!hasFetchedRef.current) setLoading(true);
    setError(null);

    try {
      // Fetch all-time history — Hyperliquid blockchain is the source of truth
      const fillsStartTime = 1;
      const fundingStartTime = Math.max(
        Date.now() - 90 * 24 * 60 * 60 * 1000,
        1,
      );
      const [fillsRes, fundingRes, spotRes] = await Promise.all([
        fetch(
          withNetworkParam(
            `/api/user/fills?address=${address}&startTime=${fillsStartTime}&aggregateByTime=true`,
          ),
        ),
        fetch(
          withNetworkParam(
            `/api/user/funding?address=${address}&startTime=${fundingStartTime}`,
          ),
        ),
        fetch(withNetworkParam("/api/spot")),
      ]);

      if (!fillsRes.ok) throw new Error("Failed to fetch trade history");

      const rawFills = await fillsRes.json();
      const rawFunding = fundingRes.ok ? await fundingRes.json() : [];
      const rawSpot = spotRes.ok ? await spotRes.json() : null;

      const coinAliasMap = new Map<string, string>();
      for (const asset of Array.isArray(rawSpot?.assets) ? rawSpot.assets : []) {
        const symbol = String(asset.symbol ?? "").toUpperCase();
        const marketIndex = Number(asset.marketIndex);
        if (!symbol || !Number.isFinite(marketIndex)) continue;
        coinAliasMap.set(`@${marketIndex}`, symbol);
        coinAliasMap.set(symbol, symbol);
      }

      if (!fundingRes.ok) {
        console.warn("Funding history unavailable; continuing without funding merge.");
      }

      // Normalize fills from HL API format
      const normalizedFills: Fill[] = (
        Array.isArray(rawFills) ? rawFills : []
      ).map((f: Record<string, unknown>) => ({
        coin: coinAliasMap.get(String(f.coin ?? "").toUpperCase()) ?? String(f.coin ?? ""),
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

      // Calculate starting balance from deposit/withdrawal ledger
      let startBal = 1000; // fallback
      try {
        const ledgerRes = await fetch(
          withNetworkParam(`/api/user/ledger?address=${address}&startTime=1`),
        );
        if (ledgerRes.ok) {
          const ledgerData = await ledgerRes.json();
          // Sum actual deposits minus withdrawals to get net capital injected
          let netDeposited = 0;
          for (const entry of Array.isArray(ledgerData) ? ledgerData : []) {
            const delta = entry.delta;
            if (!delta || typeof delta !== "object") continue;
            const type = String(delta.type ?? "");
            if (type === "deposit") {
              netDeposited += parseFloat(String(delta.usdc ?? "0"));
            } else if (type === "withdraw") {
              netDeposited -= parseFloat(String(delta.usdc ?? "0"));
            } else if (type === "internalTransfer" || type === "send") {
              // Incoming transfers = deposits, outgoing = withdrawals
              const amt = parseFloat(String(delta.usdc ?? delta.usdcValue ?? "0"));
              const dest = String(delta.destination ?? "").toLowerCase();
              if (dest === address.toLowerCase()) {
                netDeposited += amt;
              } else {
                netDeposited -= amt;
              }
            }
          }
          if (netDeposited > 0) {
            startBal = netDeposited;
          }
        }
      } catch {
        // Ledger fetch failed — use fallback estimation
      }

      // If ledger didn't give us a good number, estimate from account value
      if (startBal <= 1000) {
        const totalPnl = tradesWithFunding.reduce((s, t) => s + t.pnl, 0);
        const currentValue = accountValueRef.current;
        if (currentValue > 0) {
          startBal = Math.max(currentValue - totalPnl, 100);
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
        normalizedFunding.length,
      );
      setInsights(tradeInsights);
      hasFetchedRef.current = true;
      setLastUpdated(Date.now());
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load portfolio data";
      setError(msg);
      console.error("Portfolio fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  const refreshAll = useCallback(async () => {
    await fetchData();
    await fetchResearch();
  }, [fetchData, fetchResearch]);

  // Fetch on connect + auto-refresh every 12 hours
  useEffect(() => {
    if (isConnected && address) {
      registerTrackedWallet();
      fetchData();
      fetchResearch();

      const TWELVE_HOURS = 12 * 60 * 60 * 1000;
      const refreshInterval = setInterval(() => {
        fetchData();
        fetchResearch();
      }, TWELVE_HOURS);
      const sizingCaptureInterval = setInterval(() => {
        captureSizingSnapshot()
          .then(() => refreshSizingSnapshots())
          .catch(() => null);
      }, 5 * 60 * 1000);

      return () => {
        clearInterval(refreshInterval);
        clearInterval(sizingCaptureInterval);
      };
    }
  }, [isConnected, address, fetchData, fetchResearch, captureSizingSnapshot, refreshSizingSnapshots, registerTrackedWallet]);

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
      setSizingSnapshots([]);
      setCorrelation(null);
      setResearchError(null);
      setError(null);
      setLastUpdated(null);
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
        sizingSnapshots,
        correlation,
        researchLoading,
        researchError,
        loading,
        error,
        lastUpdated,
        refresh: refreshAll,
        refreshResearch: fetchResearch,
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
