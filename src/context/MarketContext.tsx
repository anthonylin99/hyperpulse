"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { getSubscriptionClient, withNetworkParam, getStoredNetwork } from "@/lib/hyperliquid";
import { fundingToSignal, computeFundingSignal } from "@/lib/signals";
import { reportClientError } from "@/lib/clientErrorReporter";
import {
  MARKET_ENRICHMENT_INTERVAL_MS,
  POLL_INTERVAL_MARKET,
  WHALE_THRESHOLD_USD,
  OI_SPIKE_THRESHOLD_PCT,
} from "@/lib/constants";
import type { MarketAsset, ActivityEntry } from "@/types";

interface FundingHistoryPoint {
  time: number;
  rate: number;
}

interface MarketContextValue {
  assets: MarketAsset[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  selectedAsset: string | null;
  setSelectedAsset: (coin: string | null) => void;
  activityFeed: ActivityEntry[];
  fundingHistories: Record<string, FundingHistoryPoint[]>;
  btcCandles: Array<{ time: number; close: number }>;
}

const MarketContext = createContext<MarketContextValue | null>(null);

let activityIdCounter = 0;

export function MarketProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);
  const [fundingHistories, setFundingHistories] = useState<
    Record<string, FundingHistoryPoint[]>
  >({});
  const [btcCandles, setBtcCandles] = useState<Array<{ time: number; close: number }>>([]);
  const signalFetchRef = useRef(0);
  const fundingFetchRef = useRef(0);
  const btcCandleFetchRef = useRef(0);
  const prevOIRef = useRef<Record<string, number>>({});
  const wsInitRef = useRef(false);

  const addActivity = useCallback((entry: Omit<ActivityEntry, "id">) => {
    const signature = `${entry.type}|${entry.coin}|${entry.message}`;
    const now = Date.now();
    const coalesceWindowMs = entry.type === "whale" ? 20_000 : 45_000;
    const id = `act-${++activityIdCounter}`;
    const nextEntry: ActivityEntry = {
      ...entry,
      id,
      timestamp: now,
      count: 1,
    };

    setActivityFeed((prev) => {
      const matchIndex = prev.findIndex(
        (item) => `${item.type}|${item.coin}|${item.message}` === signature
      );

      if (matchIndex === -1) {
        return [nextEntry, ...prev].slice(0, 50);
      }

      const match = prev[matchIndex];
      const withinWindow = now - match.timestamp <= coalesceWindowMs;
      if (!withinWindow) {
        return [nextEntry, ...prev].slice(0, 50);
      }

      const mergedEntry: ActivityEntry = {
        ...match,
        timestamp: now,
        count: (match.count ?? 1) + 1,
      };

      const rest = prev.filter((_, index) => index !== matchIndex);
      return [mergedEntry, ...rest].slice(0, 50);
    });
  }, []);

  const fetchFundingHistories = useCallback(async (coins: string[]) => {
    const now = Date.now();
    const startTime = now - 7 * 24 * 60 * 60 * 1000;

    const results: Record<string, FundingHistoryPoint[]> = {};

    await Promise.allSettled(
      coins.map(async (coin) => {
        try {
          const res = await fetch(
            `/api/market/funding?coin=${coin}&startTime=${startTime}&endTime=${now}`
          );
          if (!res.ok) return;
          const data = await res.json();
          results[coin] = data.map((f: { time: number; fundingRate: string }) => ({
            time: f.time,
            rate: parseFloat(f.fundingRate),
          }));
        } catch {
          // Ignore per-coin funding failures
        }
      })
    );

    setFundingHistories((prev) => ({ ...prev, ...results }));
  }, []);

  const fetchSignalData = useCallback(async (assets: MarketAsset[]) => {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    if (now - signalFetchRef.current < ONE_HOUR) return;
    signalFetchRef.current = now;

    const startTime = now - 30 * 24 * 60 * 60 * 1000;
    const top10 = [...assets]
      .sort((a, b) => b.openInterest - a.openInterest)
      .slice(0, 10);

    if (top10.length === 0) return;

    const updates: Record<string, MarketAsset["signal"]> = {};

    await Promise.allSettled(
      top10.map(async (asset) => {
        try {
          const [fundingRes, candleRes] = await Promise.all([
            fetch(
              `/api/market/funding?coin=${asset.coin}&startTime=${startTime}&endTime=${now}`
            ),
            fetch(
              `/api/market/candles?coin=${asset.coin}&interval=1h&startTime=${startTime}&endTime=${now}`
            ),
          ]);
          if (!fundingRes.ok || !candleRes.ok) return;
          const fundingRaw = await fundingRes.json();
          const candlesRaw = await candleRes.json();

          const fundingHistory = (Array.isArray(fundingRaw) ? fundingRaw : []).map(
            (f: { time: number; fundingRate: string }) => ({
              time: Number(f.time ?? 0),
              rate: parseFloat(String(f.fundingRate ?? "0")),
            })
          );

          const candles = (Array.isArray(candlesRaw) ? candlesRaw : []).map(
            (c: Record<string, unknown>) => ({
              time: Number(c.t ?? c.T ?? c.time ?? 0),
              close: parseFloat(String(c.c ?? c.close ?? "0")),
            })
          );

          if (fundingHistory.length === 0 || candles.length === 0) return;

          const signal = computeFundingSignal({
            coin: asset.coin,
            currentFundingAPR: asset.fundingAPR,
            fundingHistory,
            candles,
            horizonHours: 24,
            oiUSD: asset.openInterest,
            oiChangePct: asset.oiChangePct ?? 0,
          });

          updates[asset.coin] = signal;
        } catch {
          // Ignore per-coin signal failures
        }
      })
    );

    if (Object.keys(updates).length === 0) return;

    setAssets((prev) =>
      prev.map((asset) =>
        updates[asset.coin] ? { ...asset, signal: updates[asset.coin] } : asset
      )
    );
  }, []);

  const fetchBtcCandles = useCallback(async () => {
    try {
      const now = Date.now();
      const startTime = now - 48 * 60 * 60 * 1000;
      const res = await fetch(
        `/api/market/candles?coin=BTC&interval=1h&startTime=${startTime}&endTime=${now}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const parsed = (Array.isArray(data) ? data : []).map(
        (c: Record<string, unknown>) => ({
          time: Number(c.t ?? c.T ?? c.time ?? 0),
          close: parseFloat(String(c.c ?? c.close ?? "0")),
        })
      );
      if (parsed.length > 0) setBtcCandles(parsed);
    } catch {
      // ignore
    }
  }, []);

  const fetchMarketData = useCallback(async () => {
    try {
      const res = await fetch(withNetworkParam("/api/market"));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();

      const [meta, assetCtxs] = data;
      const prevOI = prevOIRef.current;

      const parsed = meta.universe
        .map((u: { name: string; isDelisted: boolean; maxLeverage: number; szDecimals: number }, i: number) => {
          if (u.isDelisted) return null;
          const ctx = assetCtxs[i];
          if (!ctx) return null;

          const markPx = parseFloat(ctx.markPx);
          const midPx = ctx.midPx ? parseFloat(ctx.midPx) : markPx;
          const oraclePx = parseFloat(ctx.oraclePx);
          const prevDayPx = parseFloat(ctx.prevDayPx);
          const fundingRate = parseFloat(ctx.funding);
          const fundingAPR = fundingRate * 8760 * 100;
          const openInterest = parseFloat(ctx.openInterest) * markPx;
          const dayVolume = parseFloat(ctx.dayNtlVlm);
          const priceChange24h =
            prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0;

          const prevOIValue = prevOI[u.name] ?? null;
          const oiChangePct =
            prevOIValue != null && prevOIValue > 0
              ? ((openInterest - prevOIValue) / prevOIValue) * 100
              : null;

          const signal = fundingToSignal(
            fundingAPR,
            u.name,
            openInterest,
            oiChangePct ?? 0
          );

          return {
            coin: u.name,
            assetIndex: i,
            szDecimals: u.szDecimals,
            markPx,
            midPx,
            oraclePx,
            fundingRate,
            fundingAPR,
            openInterest,
            prevOpenInterest: prevOIValue,
            oiChangePct,
            dayVolume,
            prevDayPx,
            priceChange24h,
            signal,
            maxLeverage: u.maxLeverage,
          } as MarketAsset;
        })
        .filter((a: MarketAsset | null): a is MarketAsset => a != null);

      if (Object.keys(prevOI).length > 0) {
        for (const asset of parsed) {
          const prev = prevOI[asset.coin];
          if (prev && prev > 0) {
            const changePct = ((asset.openInterest - prev) / prev) * 100;
            if (Math.abs(changePct) > OI_SPIKE_THRESHOLD_PCT) {
              addActivity({
                type: "oi-spike",
                coin: asset.coin,
                message: `[OI ${changePct > 0 ? "SPIKE" : "FLUSH"}] ${asset.coin} open interest ${changePct > 0 ? "up" : "down"} ${Math.abs(changePct).toFixed(1)}% in 30s`,
                timestamp: Date.now(),
                notional: asset.openInterest,
              });
            }
          }
        }
      }

      const newOI: Record<string, number> = {};
      for (const asset of parsed) {
        newOI[asset.coin] = asset.openInterest;
      }
      prevOIRef.current = newOI;

      setAssets(parsed);
      setError(null);
      setLastUpdated(new Date());

      const now = Date.now();
      const top10 = [...parsed]
        .sort((a, b) => b.openInterest - a.openInterest)
        .slice(0, 10);
      if (now - fundingFetchRef.current >= MARKET_ENRICHMENT_INTERVAL_MS) {
        fundingFetchRef.current = now;
        fetchFundingHistories(top10.map((a) => a.coin));
      }
      fetchSignalData(parsed);
      if (now - btcCandleFetchRef.current >= MARKET_ENRICHMENT_INTERVAL_MS) {
        btcCandleFetchRef.current = now;
        fetchBtcCandles();
      }
    } catch (err) {
      reportClientError("market.fetch", err);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [addActivity, fetchFundingHistories, fetchSignalData, fetchBtcCandles]);

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      fetchMarketData();
    }, POLL_INTERVAL_MARKET);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchMarketData();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchMarketData]);

  useEffect(() => {
    if (wsInitRef.current) return;
    wsInitRef.current = true;

    let allMidsSub: { unsubscribe: () => Promise<void> } | null = null;
    const tradeSubs: Array<{ unsubscribe: () => Promise<void> }> = [];

    const initWs = async () => {
      try {
        const sub = getSubscriptionClient(getStoredNetwork());

        allMidsSub = await sub.allMids((event) => {
          const mids = event.mids;
          setAssets((prev) =>
            prev.map((asset) => {
              const newMid = mids[asset.coin];
              if (newMid) {
                const newMidPx = parseFloat(newMid);
                return { ...asset, midPx: newMidPx };
              }
              return asset;
            })
          );
          setLastUpdated(new Date());
        });

        const whaleCoins = ["BTC", "ETH", "SOL"];
        for (const coin of whaleCoins) {
          try {
            const tradeSub = await sub.trades({ coin }, (trades) => {
              for (const trade of trades) {
                const px = parseFloat(trade.px);
                const sz = parseFloat(trade.sz);
                const notional = px * sz;
                if (notional >= WHALE_THRESHOLD_USD) {
                  const side = trade.side === "B" ? "Long" : "Short";
                  const taker = trade.users[1];
                  const truncAddr = `${taker.slice(0, 6)}...${taker.slice(-4)}`;
                  addActivity({
                    type: "whale",
                    coin: trade.coin,
                    message: `[WHALE] ${side} ${trade.coin} $${(notional / 1_000_000).toFixed(1)}M — ${truncAddr}`,
                    timestamp: trade.time,
                    notional,
                  });
                }
              }
            });
            tradeSubs.push(tradeSub);
          } catch (err) {
            console.warn(`Failed to subscribe to ${coin} trades:`, err);
          }
        }
      } catch (err) {
        console.warn("WebSocket init failed, relying on REST polling:", err);
      }
    };

    initWs();

    return () => {
      allMidsSub?.unsubscribe().catch(console.warn);
      tradeSubs.forEach((s) => s.unsubscribe().catch(console.warn));
    };
  }, [addActivity]);

  return (
    <MarketContext.Provider
      value={{
        assets,
        loading,
        error,
        lastUpdated,
        selectedAsset,
        setSelectedAsset,
        activityFeed,
        fundingHistories,
        btcCandles,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error("useMarket must be used within MarketProvider");
  return ctx;
}
