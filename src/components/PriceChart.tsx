"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { withNetworkParam } from "@/lib/hyperliquid";
import { calculateSupportResistanceLevels } from "@/lib/supportResistance";
import { buildTradePlan } from "@/lib/tradePlan";
import { SectionEyebrow } from "@/components/trading-ui";
import type { SupportResistanceLevel } from "@/types";

interface PriceChartProps {
  coin: string;
  marketType?: "perp" | "spot";
  compact?: boolean;
  fundingAPR?: number | null;
  fundingPercentile?: number | null;
}

type TradingInterval = "5" | "15" | "60" | "240" | "D";
const DEFAULT_INTERVAL: TradingInterval = "15";

const API_INTERVAL: Record<TradingInterval, "5m" | "15m" | "1h" | "4h" | "1d"> = {
  "5": "5m",
  "15": "15m",
  "60": "1h",
  "240": "4h",
  D: "1d",
};

const LOOKBACK_MS: Record<TradingInterval, number> = {
  "5": 2 * 24 * 60 * 60 * 1000,
  "15": 5 * 24 * 60 * 60 * 1000,
  "60": 30 * 24 * 60 * 60 * 1000,
  "240": 90 * 24 * 60 * 60 * 1000,
  D: 180 * 24 * 60 * 60 * 1000,
};

const INTERVAL_MS: Record<TradingInterval, number> = {
  "5": 5 * 60 * 1000,
  "15": 15 * 60 * 1000,
  "60": 60 * 60 * 1000,
  "240": 4 * 60 * 60 * 1000,
  D: 24 * 60 * 60 * 1000,
};

const INTERVAL_OPTIONS: Array<{ label: string; value: TradingInterval }> = [
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "1h", value: "60" },
  { label: "4h", value: "240" },
  { label: "1d", value: "D" },
];

type CandleDatum = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type LevelsResponse = {
  configured?: boolean;
  source?: "db-observed" | "empty";
  levels?: SupportResistanceLevel[];
};

function normalizeTime(time: number): number {
  return time > 10_000_000_000 ? time : time * 1000;
}

function toChartTime(time: number): UTCTimestamp {
  return Math.floor(normalizeTime(time) / 1000) as UTCTimestamp;
}

function toCandlestickData(candles: CandleDatum[]): CandlestickData[] {
  const seen = new Set<number>();
  return candles
    .map((candle) => ({
      time: toChartTime(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }))
    .filter((candle) => {
      const time = Number(candle.time);
      if (seen.has(time)) return false;
      seen.add(time);
      return (
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        candle.high >= candle.low &&
        candle.close > 0
      );
    });
}

function formatLevelPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toLocaleString(undefined, { maximumFractionDigits: value < 1 ? 6 : value < 100 ? 2 : 0 });
}

function pricePrecision(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 2;
  if (value >= 100) return 0;
  if (value >= 1) return 2;
  if (value >= 0.01) return 4;
  return 6;
}

function minMoveForPrecision(precision: number): number {
  return precision === 0 ? 1 : Number(`0.${"0".repeat(Math.max(precision - 1, 0))}1`);
}

function chartPriceFormatter(value: number): string {
  return formatLevelPrice(value);
}

function formatTimeMs(timeMs: number | null | undefined): string {
  if (!timeMs || !Number.isFinite(timeMs)) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(timeMs));
}

function confidenceClass(confidence: "low" | "medium" | "high" | undefined): string {
  if (confidence === "high") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (confidence === "medium") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-zinc-700 bg-zinc-900 text-zinc-400";
}

function isActionableLevel(level: SupportResistanceLevel): boolean {
  return level.status !== "expired" && level.status !== "broken";
}

function formatLevelDistance(level: SupportResistanceLevel, currentPrice: number | null): string {
  if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return "";
  const distance = ((level.price - currentPrice) / currentPrice) * 100;
  const absDistance = Math.abs(distance);
  if (level.kind === "support") return `${absDistance.toFixed(2)}% below`;
  if (level.kind === "resistance") return `${absDistance.toFixed(2)}% above`;
  return `${distance >= 0 ? "+" : ""}${distance.toFixed(2)}%`;
}

export default function PriceChart({
  coin,
  marketType = "perp",
  compact = false,
  fundingAPR = null,
  fundingPercentile = null,
}: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<CandleDatum[]>([]);
  const [dbLevels, setDbLevels] = useState<SupportResistanceLevel[]>([]);
  const [interval, setInterval] = useState<TradingInterval>(DEFAULT_INTERVAL);

  const calculatedLevels = useMemo(
    () => calculateSupportResistanceLevels(candles, API_INTERVAL[interval]),
    [candles, interval],
  );
  const usableDbLevels = useMemo(() => dbLevels.filter(isActionableLevel), [dbLevels]);
  const usableCalculatedLevels = useMemo(() => calculatedLevels.filter(isActionableLevel), [calculatedLevels]);
  const levels = useMemo(() => {
    const dbSupports = usableDbLevels.filter((level) => level.kind === "support");
    const dbResistances = usableDbLevels.filter((level) => level.kind === "resistance");
    const calculatedSupports = usableCalculatedLevels.filter((level) => level.kind === "support");
    const calculatedResistances = usableCalculatedLevels.filter((level) => level.kind === "resistance");

    return [
      ...(dbSupports.length > 0 ? dbSupports : calculatedSupports),
      ...(dbResistances.length > 0 ? dbResistances : calculatedResistances),
    ];
  }, [usableCalculatedLevels, usableDbLevels]);
  const currentPrice = candles.at(-1)?.close ?? null;
  const lastCandleTimeMs = candles.at(-1)?.time ? normalizeTime(candles.at(-1)!.time) : null;
  const latestLevelTimeMs = useMemo(
    () =>
      levels.reduce<number | null>((latest, level) => {
        const time = level.discoveredTimeMs ?? level.updatedAtMs ?? null;
        if (time == null) return latest;
        return latest == null ? time : Math.max(latest, time);
      }, null),
    [levels],
  );
  const tradePlan = useMemo(
    () =>
      buildTradePlan({
        candles,
        interval: API_INTERVAL[interval],
        levels,
        fundingAPR,
        fundingPercentile,
      }),
    [candles, fundingAPR, fundingPercentile, interval, levels],
  );
  const visibleSupports = useMemo(
    () =>
      levels
        .filter((level) => level.kind === "support" && (currentPrice == null || level.price < currentPrice))
        .sort((a, b) =>
          currentPrice == null ? b.price - a.price : Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice),
        )
        .slice(0, 2),
    [currentPrice, levels],
  );
  const visibleResistances = useMemo(
    () =>
      levels
        .filter((level) => level.kind === "resistance" && (currentPrice == null || level.price > currentPrice))
        .sort((a, b) =>
          currentPrice == null ? a.price - b.price : Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice),
        )
        .slice(0, 2),
    [currentPrice, levels],
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchCandles() {
      setLoading(true);
      setError(null);
      try {
        const now = Date.now();
        const startTime = now - LOOKBACK_MS[interval];
        const response = await fetch(
          withNetworkParam(
            `/api/market/candles?coin=${encodeURIComponent(coin)}&marketType=${marketType}&interval=${API_INTERVAL[interval]}&startTime=${startTime}&endTime=${now}`,
          ),
        );
        if (!response.ok) throw new Error("Unable to fetch price candles.");
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
          .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
          .sort((a, b) => normalizeTime(a.time) - normalizeTime(b.time));
        if (!cancelled) setCandles(nextCandles);
      } catch (err) {
        if (!cancelled) {
          setCandles([]);
          setError(err instanceof Error ? err.message : "Unable to fetch price candles.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCandles();
    return () => {
      cancelled = true;
    };
  }, [coin, interval, marketType]);

  useEffect(() => {
    let cancelled = false;

    async function fetchStoredLevels() {
      setDbLevels([]);

      if (marketType !== "perp") {
        return;
      }

      try {
        const response = await fetch(
          withNetworkParam(
            `/api/market/levels?coin=${encodeURIComponent(coin)}&interval=${API_INTERVAL[interval]}&limit=18`,
          ),
        );
        if (!response.ok) throw new Error("Unable to fetch stored levels.");
        const payload = (await response.json()) as LevelsResponse;
        if (cancelled) return;
        setDbLevels(Array.isArray(payload.levels) ? payload.levels : []);
      } catch {
        if (!cancelled) {
          setDbLevels([]);
        }
      }
    }

    fetchStoredLevels();
    return () => {
      cancelled = true;
    };
  }, [coin, interval, marketType]);

  useEffect(() => {
    const container = chartContainerRef.current;
    const data = toCandlestickData(candles);
    if (!container || data.length === 0) return;
    const precision = pricePrecision(candles.at(-1)?.close);

    const chart = createChart(container, {
      autoSize: true,
      localization: {
        priceFormatter: chartPriceFormatter,
      },
      layout: {
        background: { type: ColorType.Solid, color: "#090b10" },
        textColor: "#a1a1aa",
        panes: { separatorColor: "#18181b" },
      },
      grid: {
        vertLines: { color: "rgba(63, 63, 70, 0.22)" },
        horzLines: { color: "rgba(63, 63, 70, 0.22)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#71717a", labelBackgroundColor: "#18181b" },
        horzLine: { color: "#71717a", labelBackgroundColor: "#18181b" },
      },
      rightPriceScale: {
        borderColor: "#27272a",
        textColor: "#d4d4d8",
        scaleMargins: { top: 0.08, bottom: 0.12 },
      },
      timeScale: {
        borderColor: "#27272a",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
      },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#14b8a6",
      downColor: "#ef4444",
      borderUpColor: "#2dd4bf",
      borderDownColor: "#fb7185",
      wickUpColor: "#5eead4",
      wickDownColor: "#fb7185",
      priceLineColor: "#f4f4f5",
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dashed,
      priceFormat: {
        type: "price",
        precision,
        minMove: minMoveForPrecision(precision),
      },
    });

    candleSeries.setData(data);

    const firstTime = normalizeTime(candles[0]?.time ?? 0);
    const lastTime = normalizeTime(candles.at(-1)?.time ?? 0);
    const renderLevel = (
      level: ReturnType<typeof calculateSupportResistanceLevels>[number],
      index: number,
      kind: "support" | "resistance",
    ) => {
      const color = kind === "support" ? "#22c55e" : "#fb7185";
      const softColor = kind === "support" ? "rgba(34, 197, 94, 0.35)" : "rgba(251, 113, 133, 0.35)";
      const start = toChartTime(firstTime);
      const end = toChartTime(lastTime);

      const center = chart.addSeries(LineSeries, {
        color,
        lineWidth: index === 0 ? 2 : 1,
        lineStyle: index === 0 ? LineStyle.Solid : LineStyle.Dashed,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      center.setData([
        { time: start, value: level.price },
        { time: end, value: level.price },
      ]);

      candleSeries.createPriceLine({
        price: level.price,
        color,
        lineWidth: index === 0 ? 2 : 1,
        lineStyle: index === 0 ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: index === 0,
        title: index === 0 ? (kind === "support" ? "Support" : "Resistance") : "",
      });

      if (level.zoneLow != null && level.zoneHigh != null && index === 0) {
        for (const zonePrice of [level.zoneLow, level.zoneHigh]) {
          const edge = chart.addSeries(LineSeries, {
            color: softColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          });
          edge.setData([
            { time: start, value: zonePrice },
            { time: end, value: zonePrice },
          ]);

          candleSeries.createPriceLine({
            price: zonePrice,
            color: softColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: "",
          });
        }
      }
    };

    visibleSupports.slice(0, 1).forEach((level, index) => renderLevel(level, index, "support"));
    visibleResistances.slice(0, 1).forEach((level, index) => renderLevel(level, index, "resistance"));

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, visibleResistances, visibleSupports]);

  const levelSourceNote =
    latestLevelTimeMs != null
      ? `Closed-candle levels · last confirmed ${formatTimeMs(latestLevelTimeMs)}`
      : lastCandleTimeMs != null
        ? `Closed-candle levels · data through ${formatTimeMs(lastCandleTimeMs + INTERVAL_MS[interval])}`
        : "Closed-candle levels";
  const hasActionablePlan = tradePlan.bias !== "wait";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0d1016]">
      <div className="shrink-0 border-b border-zinc-800 px-3 py-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionEyebrow>{marketType === "spot" ? "RWA chart proxy" : "Price structure"}</SectionEyebrow>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <div className={compact ? "font-mono text-base font-semibold text-zinc-100" : "font-mono text-lg font-semibold text-zinc-100"}>{coin}</div>
              <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                {API_INTERVAL[interval]} candles
              </div>
              {currentPrice != null && (
                <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                  {formatLevelPrice(currentPrice)}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap justify-start gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500 lg:justify-end">
            <div className="flex rounded-full border border-zinc-800 bg-zinc-950/70 p-0.5 tracking-normal">
              {INTERVAL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setInterval(option.value)}
                  className={`rounded-full px-2 py-0.5 transition ${
                    interval === option.value
                      ? "bg-emerald-500/15 text-emerald-200"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-3">
        <div className="relative h-[360px] overflow-hidden rounded-[18px] border border-zinc-800 bg-zinc-950 md:h-[430px] xl:h-[460px]">
          {loading ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
              Loading price structure...
            </div>
          ) : error || candles.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
              {error ?? "No price candles available."}
            </div>
          ) : (
            <div ref={chartContainerRef} className="absolute inset-0" />
          )}
        </div>
        <div className="mt-2 text-[11px] leading-5 text-zinc-500">{levelSourceNote}</div>
      </div>

      {!loading && !error && candles.length > 0 ? (
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-950/70 px-3 py-3">
          <div className="mb-3 grid gap-2 lg:grid-cols-2">
            <LevelStack title="Support" levels={visibleSupports} currentPrice={currentPrice} />
            <LevelStack title="Resistance" levels={visibleResistances} currentPrice={currentPrice} />
          </div>

          <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <SectionEyebrow>Trade plan</SectionEyebrow>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em] ${
                    tradePlan.bias === "long-setup"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : tradePlan.bias === "short-setup"
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400"
                  }`}
                >
                  {tradePlan.confidence} confidence
                </span>
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">{tradePlan.title}</div>
              <div className="mt-1 text-xs leading-5 text-zinc-400">{tradePlan.summary}</div>
            </div>

            <div className="grid gap-2 text-xs md:grid-cols-3">
              <PlanBox label="Confirmation level" value={tradePlan.trigger} />
              <PlanBox
                label="Invalidation"
                value={hasActionablePlan ? tradePlan.invalidation : "Defined after confirmation."}
                tone={hasActionablePlan ? "danger" : "neutral"}
              />
              <PlanBox
                label="Target"
                value={hasActionablePlan && tradePlan.targets.length > 0 ? tradePlan.targets.join(" → ") : "Appears after confirmation."}
                tone={hasActionablePlan ? "success" : "neutral"}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {tradePlan.context.slice(0, 3).map((item) => (
              <div key={item} className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-500">
                {item}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LevelStack({
  title,
  levels,
  currentPrice,
}: {
  title: string;
  levels: ReturnType<typeof calculateSupportResistanceLevels>;
  currentPrice: number | null;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-3">
      <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-600">{title}</div>
      {levels.length === 0 ? (
        <div className="text-xs text-zinc-500">No active zone nearby.</div>
      ) : (
        <div className="grid gap-2">
          {levels.map((level) => (
            <div key={level.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
              <div>
                <div className="font-mono text-xs text-zinc-200">
                  {level.zoneLow != null && level.zoneHigh != null
                    ? `${formatLevelPrice(level.zoneLow)}-${formatLevelPrice(level.zoneHigh)}`
                    : formatLevelPrice(level.price)}
                </div>
                <div className="mt-0.5 text-[10px] text-zinc-500">
                  {formatLevelDistance(level, currentPrice)}
                  {formatLevelDistance(level, currentPrice) ? " · " : ""}
                  {level.touches ?? 1} touch{(level.touches ?? 1) === 1 ? "" : "es"}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] ${confidenceClass(level.confidence)}`}>
                  {level.confidence ?? "low"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanBox({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div
        className={`mt-1 leading-5 ${
          tone === "success" ? "text-emerald-300" : tone === "danger" ? "text-rose-300" : "text-zinc-300"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
