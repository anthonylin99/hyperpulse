"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMarket } from "@/context/MarketContext";
import {
  buildFactorStates,
  factorLeaderText,
  normalizeArtemisPriceResponse,
  type ArtemisPriceResponse,
} from "@/lib/factors";
import type { FactorSnapshot, LiveFactorState } from "@/types";

interface FactorContextValue {
  factors: LiveFactorState[];
  loading: boolean;
  error: string | null;
  warning: string | null;
  lastUpdated: Date | null;
  leader: LiveFactorState | null;
  leaderText: string;
  refresh: () => Promise<void>;
}

const FactorContext = createContext<FactorContextValue | null>(null);

export function FactorProvider({ children }: { children: ReactNode }) {
  const { assets } = useMarket();
  const [snapshots, setSnapshots] = useState<FactorSnapshot[]>([]);
  const [pricePayload, setPricePayload] = useState<ArtemisPriceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/factors");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setSnapshots(Array.isArray(body.snapshots) ? body.snapshots : []);
      setPricePayload(body.prices ?? null);
      setWarning(typeof body.warning === "string" ? body.warning : null);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load factor data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  const factors = useMemo(() => {
    if (!pricePayload) return [];
    return buildFactorStates(snapshots, normalizeArtemisPriceResponse(pricePayload), assets);
  }, [snapshots, pricePayload, assets]);

  const leader = factors[0] ?? null;
  const value = useMemo<FactorContextValue>(
    () => ({
      factors,
      loading,
      error,
      warning,
      lastUpdated,
      leader,
      leaderText: factorLeaderText(leader ?? undefined),
      refresh,
    }),
    [factors, loading, error, warning, lastUpdated, leader, refresh],
  );

  return <FactorContext.Provider value={value}>{children}</FactorContext.Provider>;
}

export function useFactors() {
  const context = useContext(FactorContext);
  if (!context) {
    throw new Error("useFactors must be used within FactorProvider");
  }
  return context;
}
