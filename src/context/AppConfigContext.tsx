"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import toast from "react-hot-toast";
import { ENABLE_FACTORS_DEFAULT, ENABLE_TRADING_DEFAULT } from "@/lib/appConfig";

type PublicAppConfig = {
  tradingEnabled: boolean;
  whalesEnabled: boolean;
  factorsEnabled: boolean;
  deploymentMode: "trading" | "read-only";
};

type AppConfigContextValue = PublicAppConfig & {
  loading: boolean;
  configReady: boolean;
  refresh: () => Promise<void>;
};

const fallbackTradingEnabled =
  process.env.NEXT_PUBLIC_ENABLE_TRADING === "true" ||
  ENABLE_TRADING_DEFAULT;
const fallbackFactorsEnabled =
  process.env.NEXT_PUBLIC_ENABLE_FACTORS === "true" ||
  (process.env.NEXT_PUBLIC_ENABLE_FACTORS !== "false" &&
    ENABLE_FACTORS_DEFAULT);

const fallbackConfig: PublicAppConfig = {
  tradingEnabled: fallbackTradingEnabled,
  whalesEnabled: process.env.NEXT_PUBLIC_ENABLE_WHALES === "true",
  factorsEnabled: fallbackFactorsEnabled,
  deploymentMode: fallbackTradingEnabled ? "trading" : "read-only",
};

const AppConfigContext = createContext<AppConfigContextValue | null>(null);

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicAppConfig>(fallbackConfig);
  const [loading, setLoading] = useState(true);
  const fetchFailureWarnedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/public-config");

      if (!response.ok) {
        throw new Error("Failed to load app config");
      }

      const nextConfig = (await response.json()) as PublicAppConfig;
      setConfig(nextConfig);
      fetchFailureWarnedRef.current = false;
    } catch (error) {
      console.error("Failed to refresh app config", error);
      if (!fetchFailureWarnedRef.current) {
        fetchFailureWarnedRef.current = true;
        toast.error(
          "Couldn't load runtime config — using defaults. Trading features may be limited."
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...config,
      loading,
      configReady: !loading,
      refresh,
    }),
    [config, loading, refresh]
  );

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  const context = useContext(AppConfigContext);
  if (!context) {
    throw new Error("useAppConfig must be used within AppConfigProvider");
  }
  return context;
}
