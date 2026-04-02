"use client";

import { useState, useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";

type View = "hour" | "day";

const HOUR_LABELS = [
  "12am", "1am", "2am", "3am", "4am", "5am",
  "6am", "7am", "8am", "9am", "10am", "11am",
  "12pm", "1pm", "2pm", "3pm", "4pm", "5pm",
  "6pm", "7pm", "8pm", "9pm", "10pm", "11pm",
];

export default function PerformanceHeatmap() {
  const { byHour, byDay, loading, trades } = usePortfolio();
  const [view, setView] = useState<View>("hour");

  const hourMaxAbsPnl = useMemo(() => {
    if (byHour.length === 0) return 1;
    return Math.max(...byHour.map((h) => Math.abs(h.pnl / Math.max(h.trades, 1))), 0.01);
  }, [byHour]);

  const dayMaxAbsPnl = useMemo(() => {
    if (byDay.length === 0) return 1;
    return Math.max(...byDay.map((d) => Math.abs(d.pnl / Math.max(d.trades, 1))), 0.01);
  }, [byDay]);

  if (loading && trades.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="skeleton h-4 w-32 rounded mb-4" />
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (byHour.length === 0 && byDay.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-zinc-400 mb-4">When You Trade Best</h3>
        <p className="text-zinc-600 text-sm">No data</p>
      </div>
    );
  }

  // Build hour map for O(1) lookups
  const hourMap = new Map(byHour.map((h) => [h.hour, h]));
  // Build day map — DailyBreakdown uses 0=Sun, 6=Sat
  const dayMap = new Map(byDay.map((d) => [d.day, d]));
  // Display order: Mon(1) Tue(2) Wed(3) Thu(4) Fri(5) Sat(6) Sun(0)
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];
  const dayLabels: Record<number, string> = {
    0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat",
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-zinc-400">When You Trade Best</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setView("hour")}
            className={cn(
              "px-2.5 py-1 text-xs rounded font-medium transition-colors",
              view === "hour"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            By Hour
          </button>
          <button
            onClick={() => setView("day")}
            className={cn(
              "px-2.5 py-1 text-xs rounded font-medium transition-colors",
              view === "day"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            By Day
          </button>
        </div>
      </div>

      {view === "hour" ? (
        <div className="grid grid-cols-6 gap-1.5">
          {Array.from({ length: 24 }).map((_, hour) => {
            const data = hourMap.get(hour);
            const count = data?.trades ?? 0;
            const avgPnl = count > 0 ? (data!.pnl / count) : 0;
            const isPositive = avgPnl >= 0;
            const opacity = count > 0 ? Math.min(Math.abs(avgPnl) / hourMaxAbsPnl, 1) : 0;

            return (
              <div
                key={hour}
                className="relative rounded overflow-hidden p-2 text-center"
                style={{ backgroundColor: count === 0 ? "rgb(39 39 42)" : undefined }}
              >
                {count > 0 && (
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundColor: isPositive ? "rgb(52 211 153)" : "rgb(248 113 113)",
                      opacity: opacity * 0.35,
                    }}
                  />
                )}
                <div className="relative">
                  <div className="text-[10px] text-zinc-400 font-medium">
                    {HOUR_LABELS[hour]}
                  </div>
                  {count > 0 ? (
                    <>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        {count} trade{count !== 1 ? "s" : ""}
                      </div>
                      <div
                        className={cn(
                          "text-xs font-medium mt-0.5",
                          isPositive ? "text-emerald-400" : "text-red-400"
                        )}
                      >
                        {formatUSD(avgPnl)}
                      </div>
                    </>
                  ) : (
                    <div className="text-[10px] text-zinc-600 mt-0.5">--</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {dayOrder.map((dayNum) => {
            const data = dayMap.get(dayNum);
            const count = data?.trades ?? 0;
            const avgPnl = count > 0 ? (data!.pnl / count) : 0;
            const isPositive = avgPnl >= 0;
            const opacity = count > 0 ? Math.min(Math.abs(avgPnl) / dayMaxAbsPnl, 1) : 0;

            return (
              <div
                key={dayNum}
                className="relative rounded overflow-hidden p-3 text-center"
                style={{ backgroundColor: count === 0 ? "rgb(39 39 42)" : undefined }}
              >
                {count > 0 && (
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundColor: isPositive ? "rgb(52 211 153)" : "rgb(248 113 113)",
                      opacity: opacity * 0.35,
                    }}
                  />
                )}
                <div className="relative">
                  <div className="text-xs text-zinc-400 font-medium">
                    {dayLabels[dayNum]}
                  </div>
                  {count > 0 ? (
                    <>
                      <div className="text-[10px] text-zinc-500 mt-1">
                        {count} trade{count !== 1 ? "s" : ""}
                      </div>
                      <div
                        className={cn(
                          "text-sm font-medium mt-1",
                          isPositive ? "text-emerald-400" : "text-red-400"
                        )}
                      >
                        {formatUSD(avgPnl)}
                      </div>
                    </>
                  ) : (
                    <div className="text-[10px] text-zinc-600 mt-1">--</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
