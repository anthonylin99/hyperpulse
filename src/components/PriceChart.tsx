"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { withNetworkParam } from "@/lib/hyperliquid";
import { formatChartPrice } from "@/lib/format";
import { calculateSupportResistanceLevels, nearestLevel } from "@/lib/supportResistance";
import { CompactStat, FilterChip, SectionEyebrow } from "@/components/trading-ui";

interface PriceChartProps {
  coin: string;
  marketType?: "perp" | "spot";
}

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

const INTERVALS = ["15", "60", "240", "D"] as const;
type TradingViewInterval = (typeof INTERVALS)[number];

const INTERVAL_LABELS: Record<TradingViewInterval, string> = {
  "15": "15m",
  "60": "1h",
  "240": "4h",
  D: "1d",
};

const API_INTERVAL: Record<TradingViewInterval, "15m" | "1h" | "4h" | "1d"> = {
  "15": "15m",
  "60": "1h",
  "240": "4h",
  D: "1d",
};

const LOOKBACK_MS: Record<TradingViewInterval, number> = {
  "15": 5 * 24 * 60 * 60 * 1000,
  "60": 14 * 24 * 60 * 60 * 1000,
  "240": 45 * 24 * 60 * 60 * 1000,
  D: 180 * 24 * 60 * 60 * 1000,
};

const SYMBOL_OVERRIDES: Record<string, string> = {
  BTC: "BINANCE:BTCUSDT",
  ETH: "BINANCE:ETHUSDT",
  SOL: "BINANCE:SOLUSDT",
  BNB: "BINANCE:BNBUSDT",
  XRP: "BINANCE:XRPUSDT",
  DOGE: "BINANCE:DOGEUSDT",
  AVAX: "BINANCE:AVAXUSDT",
  LINK: "BINANCE:LINKUSDT",
  AAVE: "BINANCE:AAVEUSDT",
  SUI: "BINANCE:SUIUSDT",
  ZEC: "BINANCE:ZECUSDT",
  HYPE: "CRYPTO:HYPEUSD",
  NFLX: "NASDAQ:NFLX",
  SLV: "AMEX:SLV",
  SILVER: "TVC:SILVER",
  XAG: "TVC:SILVER",
  XAU: "TVC:GOLD",
  GOLD: "TVC:GOLD",
  WTI: "TVC:USOIL",
  BRENT: "TVC:UKOIL",
  BRENTOIL: "TVC:UKOIL",
  SPY: "AMEX:SPY",
  QQQ: "NASDAQ:QQQ",
};

type CandleDatum = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function tradingViewSymbol(coin: string, marketType: "perp" | "spot"): string {
  const normalized = coin.toUpperCase().replace(/^.*:/, "");
  if (SYMBOL_OVERRIDES[normalized]) return SYMBOL_OVERRIDES[normalized];
  if (marketType === "spot") return `NASDAQ:${normalized}`;
  return `BINANCE:${normalized}USDT`;
}

function loadTradingViewScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.TradingView?.widget) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById("tradingview-widget-script") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("TradingView widget failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "tradingview-widget-script";
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("TradingView widget failed to load."));
    document.head.appendChild(script);
  });
}

export default function PriceChart({ coin, marketType = "perp" }: PriceChartProps) {
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const widgetContainerId = useMemo(
    () => `tv-chart-${coin.replace(/[^a-zA-Z0-9]/g, "-")}-${marketType}-${instanceId}`,
    [coin, instanceId, marketType],
  );
  const shellRef = useRef<HTMLDivElement>(null);
  const [interval, setInterval] = useState<TradingViewInterval>("60");
  const [levelsLoading, setLevelsLoading] = useState(true);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [candles, setCandles] = useState<CandleDatum[]>([]);

  const symbol = useMemo(() => tradingViewSymbol(coin, marketType), [coin, marketType]);
  const levels = useMemo(
    () => calculateSupportResistanceLevels(candles, API_INTERVAL[interval]),
    [candles, interval],
  );
  const nearestSupport = useMemo(() => nearestLevel(levels, "support"), [levels]);
  const nearestResistance = useMemo(() => nearestLevel(levels, "resistance"), [levels]);

  useEffect(() => {
    let cancelled = false;
    const container = document.getElementById(widgetContainerId);
    if (container) container.innerHTML = "";

    loadTradingViewScript()
      .then(() => {
        if (cancelled || !window.TradingView?.widget) return;
        setWidgetError(null);
        new window.TradingView.widget({
          autosize: true,
          symbol,
          interval,
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#0a0c10",
          backgroundColor: "rgba(10, 12, 16, 1)",
          gridColor: "rgba(63, 63, 70, 0.22)",
          hide_top_toolbar: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          save_image: false,
          studies: ["STD;Pivot_Points_Standard"],
          container_id: widgetContainerId,
        });
      })
      .catch((error) => {
        if (!cancelled) setWidgetError(error instanceof Error ? error.message : "TradingView widget failed to load.");
      });

    return () => {
      cancelled = true;
      const nextContainer = document.getElementById(widgetContainerId);
      if (nextContainer) nextContainer.innerHTML = "";
    };
  }, [interval, symbol, widgetContainerId]);

  useEffect(() => {
    let cancelled = false;

    async function fetchLevels() {
      setLevelsLoading(true);
      try {
        const now = Date.now();
        const startTime = now - LOOKBACK_MS[interval];
        const response = await fetch(
          withNetworkParam(
            `/api/market/candles?coin=${encodeURIComponent(coin)}&marketType=${marketType}&interval=${API_INTERVAL[interval]}&startTime=${startTime}&endTime=${now}`,
          ),
        );
        if (!response.ok) throw new Error("Unable to calculate local support/resistance context.");
        const rawCandles = (await response.json()) as Array<Record<string, string | number>>;
        const nextCandles = rawCandles
          .map((candle) => ({
            time: Number(candle.t ?? candle.T ?? candle.time),
            open: Number(candle.o ?? candle.open),
            high: Number(candle.h ?? candle.high),
            low: Number(candle.l ?? candle.low),
            close: Number(candle.c ?? candle.close),
            volume: Number(candle.v ?? candle.vlm ?? 0),
          }))
          .filter((candle) => Number.isFinite(candle.close) && candle.close > 0);
        if (!cancelled) setCandles(nextCandles);
      } catch {
        if (!cancelled) setCandles([]);
      } finally {
        if (!cancelled) setLevelsLoading(false);
      }
    }

    fetchLevels();
    return () => {
      cancelled = true;
    };
  }, [coin, interval, marketType]);

  return (
    <div ref={shellRef} className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0d1016]">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <SectionEyebrow>{marketType === "spot" ? "TradingView HIP-3 proxy" : "TradingView market chart"}</SectionEyebrow>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <div className="font-mono text-lg font-semibold text-zinc-100">{coin}</div>
              <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-2.5 py-1 font-mono text-xs text-zinc-400">
                {symbol}
              </div>
              <div className="text-xs text-zinc-500">Pivot study enabled</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {INTERVALS.map((value) => (
              <FilterChip
                key={value}
                label={INTERVAL_LABELS[value]}
                active={interval === value}
                onClick={() => setInterval(value)}
                className="py-1.5 text-xs"
              />
            ))}
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <CompactStat
            label="Nearest support"
            value={nearestSupport ? formatChartPrice(nearestSupport.price) : "n/a"}
            helper={
              levelsLoading
                ? "calculating"
                : nearestSupport?.distancePct != null
                  ? `${nearestSupport.distancePct.toFixed(2)}% from price`
                  : "no nearby level"
            }
            tone="green"
          />
          <CompactStat
            label="Nearest resistance"
            value={nearestResistance ? formatChartPrice(nearestResistance.price) : "n/a"}
            helper={
              levelsLoading
                ? "calculating"
                : nearestResistance?.distancePct != null
                  ? `${nearestResistance.distancePct.toFixed(2)}% from price`
                  : "no nearby level"
            }
            tone="amber"
          />
          <CompactStat label="Chart source" value="TradingView" helper="standardized embed" />
          <CompactStat label="Study" value="Pivots" helper="support/resistance context" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <div className="relative h-full min-h-[360px] overflow-hidden rounded-[18px] border border-zinc-800 bg-zinc-950">
          {widgetError ? (
            <div className="flex h-full min-h-[360px] items-center justify-center px-6 text-center text-sm text-zinc-500">
              {widgetError}
            </div>
          ) : (
            <div id={widgetContainerId} className="absolute inset-0 overflow-hidden" />
          )}
        </div>
      </div>
    </div>
  );
}
