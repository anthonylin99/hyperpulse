"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import { withNetworkParam } from "@/lib/hyperliquid";
import { formatChartPrice, formatCompactUsd, formatPct } from "@/lib/format";
import { CompactStat, FilterChip, SectionEyebrow } from "@/components/trading-ui";

interface PriceChartProps {
  coin: string;
  marketType?: "perp" | "spot";
}

const INTERVALS = ["5m", "15m", "1h", "4h", "1d"] as const;
type Interval = (typeof INTERVALS)[number];

const LOOKBACK_MS: Record<Interval, number> = {
  "5m": 2 * 24 * 60 * 60 * 1000,
  "15m": 5 * 24 * 60 * 60 * 1000,
  "1h": 14 * 24 * 60 * 60 * 1000,
  "4h": 45 * 24 * 60 * 60 * 1000,
  "1d": 120 * 24 * 60 * 60 * 1000,
};

type CandleDatum = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export default function PriceChart({ coin, marketType = "perp" }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeRef = useRef<ISeriesApi<any> | null>(null);
  const [interval, setInterval] = useState<Interval>("1h");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<CandleDatum[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
        fontSize: 11,
        fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, monospace",
      },
      grid: {
        vertLines: { color: "rgba(63, 63, 70, 0.22)" },
        horzLines: { color: "rgba(63, 63, 70, 0.22)" },
      },
      crosshair: {
        vertLine: { color: "rgba(52, 211, 153, 0.28)", width: 1, style: 2 },
        horzLine: { color: "rgba(52, 211, 153, 0.20)", width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: "rgba(63, 63, 70, 0.3)",
        scaleMargins: { top: 0.1, bottom: 0.18 },
      },
      timeScale: {
        borderColor: "rgba(63, 63, 70, 0.3)",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#fb7185",
      borderUpColor: "#34d399",
      borderDownColor: "#fb7185",
      wickUpColor: "#34d399",
      wickDownColor: "#fb7185",
      priceLineColor: "rgba(244,244,245,0.4)",
      lastValueVisible: true,
      priceLineVisible: true,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !volumeRef.current) return;

    const fetchCandles = async () => {
      setLoading(true);
      setError(null);
      try {
        const now = Date.now();
        const startTime = now - LOOKBACK_MS[interval];
        const response = await fetch(
          withNetworkParam(
            `/api/market/candles?coin=${encodeURIComponent(coin)}&marketType=${marketType}&interval=${interval}&startTime=${startTime}&endTime=${now}`,
          ),
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(
            payload?.error || `Failed to load ${marketType === "spot" ? "HIP-3" : "perp"} candles.`,
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawCandles: any[] = await response.json();
        const nextCandles = rawCandles.map((c) => ({
          time: Math.floor((c.t || c.T || c.time) / 1000) as number,
          open: parseFloat(c.o || c.open),
          high: parseFloat(c.h || c.high),
          low: parseFloat(c.l || c.low),
          close: parseFloat(c.c || c.close),
          volume: parseFloat(c.v || c.vlm || "0"),
        }));

        seriesRef.current?.setData(
          nextCandles.map((candle) => ({
            time: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          })),
        );
        volumeRef.current?.setData(
          nextCandles.map((candle) => ({
            time: candle.time,
            value: candle.volume,
            color: candle.close >= candle.open ? "rgba(52, 211, 153, 0.35)" : "rgba(251, 113, 133, 0.30)",
          })),
        );
        setCandles(nextCandles);
        chartRef.current?.timeScale().fitContent();
      } catch (loadError) {
        console.error(loadError);
        setCandles([]);
        seriesRef.current?.setData([]);
        volumeRef.current?.setData([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : `Failed to load ${marketType === "spot" ? "HIP-3" : "perp"} candles.`,
        );
      } finally {
        setLoading(false);
      }
    };

    fetchCandles();
  }, [coin, interval, marketType]);

  const stats = useMemo(() => {
    if (candles.length === 0) return null;
    const first = candles[0];
    const last = candles[candles.length - 1];
    const dayHigh = Math.max(...candles.map((candle) => candle.high));
    const dayLow = Math.min(...candles.map((candle) => candle.low));
    const totalVolume = candles.reduce((sum, candle) => sum + candle.volume, 0);
    const changePct = first.close > 0 ? ((last.close - first.close) / first.close) * 100 : 0;
    return {
      lastPrice: last.close,
      changePct,
      dayHigh,
      dayLow,
      totalVolume,
    };
  }, [candles]);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-[#0d1016]">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <SectionEyebrow>{marketType === "spot" ? "HIP-3 price" : "Perp price"}</SectionEyebrow>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <div className="font-mono text-lg font-semibold text-zinc-100">{coin}</div>
              {stats ? (
                <>
                  <div className="font-mono text-base text-zinc-100">{formatChartPrice(stats.lastPrice)}</div>
                  <div className={stats.changePct >= 0 ? "font-mono text-sm text-emerald-300" : "font-mono text-sm text-rose-300"}>
                    {formatPct(stats.changePct)}
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {INTERVALS.map((value) => (
              <FilterChip key={value} label={value} active={interval === value} onClick={() => setInterval(value)} className="py-1.5 text-xs" />
            ))}
          </div>
        </div>

        {stats ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <CompactStat label="Range" value={`${formatChartPrice(stats.dayLow)} - ${formatChartPrice(stats.dayHigh)}`} helper={`${interval} window`} />
            <CompactStat label="Volume" value={formatCompactUsd(stats.totalVolume)} helper="candle sum" />
            <CompactStat
              label="Structure"
              value={stats.changePct >= 0 ? "Buyers pressing" : "Sellers pressing"}
              helper="price action over the selected window"
              tone={stats.changePct >= 0 ? "green" : "amber"}
            />
          </div>
        ) : null}
      </div>

      <div className="flex-1 p-3">
        {loading ? (
          <div className="h-full min-h-[240px] rounded-[18px] border border-zinc-800 skeleton" />
        ) : !error && candles.length > 0 ? (
          <div ref={containerRef} className="h-full min-h-[240px] rounded-[18px] bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_38%),linear-gradient(180deg,#11151d,#0a0d12)]" />
        ) : (
          <div className="flex h-full min-h-[240px] items-center justify-center rounded-[18px] border border-dashed border-zinc-800 bg-zinc-950/60 px-6 text-center text-sm text-zinc-500">
            {error || `No ${marketType === "spot" ? "HIP-3" : "perp"} candle history is available for ${coin} yet.`}
          </div>
        )}
      </div>
    </div>
  );
}
