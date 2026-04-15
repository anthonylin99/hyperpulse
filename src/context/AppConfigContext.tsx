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
import { ENABLE_TRADING_DEFAULT } from "@/lib/appConfig";

type PublicAppConfig = {
  tradingEnabled: boolean;
  deploymentMode: "trading" | "read-only";
};

type AppConfigContextValue = PublicAppConfig & {
  loading: boolean;
  refresh: () => Promise<void>;
};

const fallbackTradingEnabled =
  process.env.NEXT_PUBLIC_ENABLE_TRADING === "true" ||
  ENABLE_TRADING_DEFAULT;

const fallbackConfig: PublicAppConfig = {
  tradingEnabled: fallbackTradingEnabled,
  deploymentMode: fallbackTradingEnabled ? "trading" : "read-only",
};

const AppConfigContext = createContext<AppConfigContextValue | null>(null);

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicAppConfig>(fallbackConfig);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/public-config", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load app config");
      }

      const nextConfig = (await response.json()) as PublicAppConfig;
      setConfig(nextConfig);
    } catch (error) {
      console.error("Failed to refresh app config", error);
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
