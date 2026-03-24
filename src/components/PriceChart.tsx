"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  ColorType,
} from "lightweight-charts";

interface PriceChartProps {
  coin: string;
}

const INTERVALS = ["5m", "15m", "1h", "4h", "1d"] as const;
type Interval = (typeof INTERVALS)[number];

const INTERVAL_MS: Record<Interval, number> = {
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export default function PriceChart({ coin }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeRef = useRef<ISeriesApi<any> | null>(null);
  const [interval, setInterval_] = useState<Interval>("1h");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#71717a",
        fontSize: 10,
        fontFamily: "monospace",
      },
      grid: {
        vertLines: { color: "#27272a" },
        horzLines: { color: "#27272a" },
      },
      crosshair: {
        vertLine: { color: "#3b82f6", width: 1, style: 2 },
        horzLine: { color: "#3b82f6", width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: "#27272a",
      },
      timeScale: {
        borderColor: "#27272a",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
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
      try {
        const now = Date.now();
        const barsMs = INTERVAL_MS[interval] * 200;
        const startTime = now - barsMs;

        const res = await fetch(
          `/api/market/candles?coin=${coin}&interval=${interval}&startTime=${startTime}&endTime=${now}`
        );
        if (!res.ok) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const candles: any[] = await res.json();

        const ohlc = candles.map((c) => ({
          time: Math.floor((c.t || c.T || c.time) / 1000) as number,
          open: parseFloat(c.o || c.open),
          high: parseFloat(c.h || c.high),
          low: parseFloat(c.l || c.low),
          close: parseFloat(c.c || c.close),
        }));

        const vol = candles.map((c) => ({
          time: Math.floor((c.t || c.T || c.time) / 1000) as number,
          value: parseFloat(c.v || c.vlm || "0"),
          color:
            parseFloat(c.c || c.close) >= parseFloat(c.o || c.open)
              ? "rgba(34, 197, 94, 0.3)"
              : "rgba(239, 68, 68, 0.3)",
        }));

        seriesRef.current?.setData(ohlc);
        volumeRef.current?.setData(vol);
        chartRef.current?.timeScale().fitContent();
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };

    fetchCandles();
  }, [coin, interval]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 mb-1">
        {INTERVALS.map((iv) => (
          <button
            key={iv}
            onClick={() => setInterval_(iv)}
            className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
              interval === iv
                ? "bg-blue-500/20 text-blue-400"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {iv}
          </button>
        ))}
        {loading && (
          <span className="text-[10px] text-zinc-600 ml-2">Loading...</span>
        )}
      </div>
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}
