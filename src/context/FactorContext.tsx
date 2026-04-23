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
import { useAppConfig } from "@/context/AppConfigContext";
import type { FactorSnapshot, LiveFactorState } from "@/types";

interface FactorContextValue {
  factors: LiveFactorState[];
  loading: boolean;
  error: string | null;
  sourceMode: "live" | "snapshot";
  lastUpdated: Date | null;
  leader: LiveFactorState | null;
  leaderText: string;
  refresh: () => Promise<void>;
}

const FactorContext = createContext<FactorContextValue | null>(null);

export function FactorProvider({ children }: { children: ReactNode }) {
  const { assets } = useMarket();
  const { factorsEnabled } = useAppConfig();
  const [snapshots, setSnapshots] = useState<FactorSnapshot[]>([]);
  const [pricePayload, setPricePayload] = useState<ArtemisPriceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<"live" | "snapshot">("live");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (!factorsEnabled) {
      setSnapshots([]);
      setPricePayload(null);
      setSourceMode("snapshot");
      setError(null);
      setLastUpdated(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/factors");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setSnapshots(Array.isArray(body.snapshots) ? body.snapshots : []);
      setPricePayload(body.prices ?? null);
      setSourceMode(body.sourceMode === "snapshot" ? "snapshot" : "live");
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load factor data.");
    } finally {
      setLoading(false);
    }
  }, [factorsEnabled]);

  useEffect(() => {
    if (!factorsEnabled) {
      setLoading(false);
      setSnapshots([]);
      setPricePayload(null);
      setSourceMode("snapshot");
      setError(null);
      setLastUpdated(null);
      return;
    }
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [factorsEnabled, refresh]);

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
      sourceMode,
      lastUpdated,
      leader,
      leaderText: factorLeaderText(leader ?? undefined),
      refresh,
    }),
    [factors, loading, error, sourceMode, lastUpdated, leader, refresh],
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
