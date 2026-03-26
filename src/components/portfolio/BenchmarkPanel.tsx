"use client";

import { usePortfolio } from "@/context/PortfolioContext";
import { cn } from "@/lib/format";

// Industry benchmarks compiled from trading research:
// - Average retail crypto trader: ~35-40% win rate, <1.0 profit factor
// - Competent traders: 45-55% win rate, 1.2-1.8 profit factor
// - Professional traders: 50-65% win rate, 1.5-3.0 profit factor
// - Top 1%: 60%+ win rate, 2.0+ profit factor, Sharpe > 2.0
const BENCHMARKS = {
  winRate: [
    { label: "Bottom 25%", min: 0, max: 0.35, color: "bg-red-500" },
    { label: "Average", min: 0.35, max: 0.50, color: "bg-orange-500" },
    { label: "Above Average", min: 0.50, max: 0.60, color: "bg-yellow-500" },
    { label: "Top 25%", min: 0.60, max: 0.70, color: "bg-emerald-500" },
    { label: "Elite", min: 0.70, max: 1.0, color: "bg-teal-400" },
  ],
  profitFactor: [
    { label: "Losing Edge", min: 0, max: 0.8, color: "bg-red-500" },
    { label: "Breakeven", min: 0.8, max: 1.2, color: "bg-orange-500" },
    { label: "Positive Edge", min: 1.2, max: 1.8, color: "bg-yellow-500" },
    { label: "Strong", min: 1.8, max: 3.0, color: "bg-emerald-500" },
    { label: "Elite", min: 3.0, max: 100, color: "bg-teal-400" },
  ],
  sharpeRatio: [
    { label: "Negative Edge", min: -100, max: 0, color: "bg-red-500" },
    { label: "Low", min: 0, max: 0.5, color: "bg-orange-500" },
    { label: "Acceptable", min: 0.5, max: 1.0, color: "bg-yellow-500" },
    { label: "Good", min: 1.0, max: 2.0, color: "bg-emerald-500" },
    { label: "Institutional", min: 2.0, max: 100, color: "bg-teal-400" },
  ],
  payoffRatio: [
    { label: "Poor R:R", min: 0, max: 0.5, color: "bg-red-500" },
    { label: "Below Average", min: 0.5, max: 0.8, color: "bg-orange-500" },
    { label: "Balanced", min: 0.8, max: 1.5, color: "bg-yellow-500" },
    { label: "Good R:R", min: 1.5, max: 2.5, color: "bg-emerald-500" },
    { label: "Excellent", min: 2.5, max: 100, color: "bg-teal-400" },
  ],
  maxDrawdown: [
    { label: "Excellent", min: 0, max: 0.10, color: "bg-teal-400" },
    { label: "Good", min: 0.10, max: 0.20, color: "bg-emerald-500" },
    { label: "Average", min: 0.20, max: 0.35, color: "bg-yellow-500" },
    { label: "High Risk", min: 0.35, max: 0.50, color: "bg-orange-500" },
    { label: "Dangerous", min: 0.50, max: 1.0, color: "bg-red-500" },
  ],
};

function getRating(
  value: number,
  benchmarks: typeof BENCHMARKS.winRate,
): { label: string; color: string; position: number } {
  for (let i = 0; i < benchmarks.length; i++) {
    const b = benchmarks[i];
    if (value >= b.min && value < b.max) {
      // Position within this tier (0-1)
      const tierPos = (value - b.min) / (b.max - b.min);
      // Overall position across all tiers
      const overallPos = (i + tierPos) / benchmarks.length;
      return { label: b.label, color: b.color, position: overallPos };
    }
  }
  const last = benchmarks[benchmarks.length - 1];
  return { label: last.label, color: last.color, position: 1 };
}

interface MetricBarProps {
  label: string;
  value: number;
  displayValue: string;
  benchmarks: typeof BENCHMARKS.winRate;
  description: string;
}

function MetricBar({ label, value, displayValue, benchmarks, description }: MetricBarProps) {
  const rating = getRating(value, benchmarks);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-zinc-300">{label}</span>
          <span className="text-xs text-zinc-600 ml-2">{description}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-medium text-zinc-100">
            {displayValue}
          </span>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium",
              rating.color.replace("bg-", "text-"),
              rating.color + "/10",
            )}
          >
            {rating.label}
          </span>
        </div>
      </div>
      {/* Gradient bar with position indicator */}
      <div className="relative">
        <div className="flex h-1.5 rounded-full overflow-hidden">
          {benchmarks.map((b, i) => (
            <div
              key={i}
              className={cn(b.color, "flex-1")}
              style={{ opacity: 0.3 }}
            />
          ))}
        </div>
        {/* Position marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-zinc-100 shadow-lg"
          style={{
            left: `${Math.min(Math.max(rating.position * 100, 2), 98)}%`,
            transform: "translate(-50%, -50%)",
            backgroundColor: rating.color.replace("bg-", "").includes("red")
              ? "#ef4444"
              : rating.color.includes("orange")
                ? "#f97316"
                : rating.color.includes("yellow")
                  ? "#eab308"
                  : rating.color.includes("teal")
                    ? "#2dd4bf"
                    : "#10b981",
          }}
        />
      </div>
    </div>
  );
}

export default function BenchmarkPanel() {
  const { stats } = usePortfolio();

  if (!stats || stats.totalTrades === 0) return null;

  // Calculate overall score (0-100)
  const scores = [
    getRating(stats.winRate, BENCHMARKS.winRate).position,
    getRating(stats.profitFactor, BENCHMARKS.profitFactor).position,
    getRating(stats.sharpeRatio, BENCHMARKS.sharpeRatio).position,
    getRating(stats.payoffRatio, BENCHMARKS.payoffRatio).position,
    getRating(stats.maxDrawdown, BENCHMARKS.maxDrawdown).position,
  ];
  const overallScore = Math.round(
    (scores.reduce((a, b) => a + b, 0) / scores.length) * 100,
  );

  const scoreColor =
    overallScore >= 70
      ? "text-emerald-400"
      : overallScore >= 50
        ? "text-yellow-400"
        : overallScore >= 30
          ? "text-orange-400"
          : "text-red-400";

  const scoreLabel =
    overallScore >= 80
      ? "Elite Trader"
      : overallScore >= 65
        ? "Above Average"
        : overallScore >= 50
          ? "Developing"
          : overallScore >= 35
            ? "Needs Work"
            : "High Risk";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-400">
            How You Compare
          </h3>
          <p className="text-xs text-zinc-600">
            vs. industry benchmarks ({stats.totalTrades} trades analyzed)
          </p>
        </div>
        <div className="text-right">
          <div className={cn("text-2xl font-bold", scoreColor)}>
            {overallScore}
          </div>
          <div className="text-[10px] text-zinc-500">{scoreLabel}</div>
        </div>
      </div>

      <div className="space-y-4">
        <MetricBar
          label="Win Rate"
          value={stats.winRate}
          displayValue={`${(stats.winRate * 100).toFixed(1)}%`}
          benchmarks={BENCHMARKS.winRate}
          description="% of trades profitable"
        />
        <MetricBar
          label="Profit Factor"
          value={stats.profitFactor}
          displayValue={stats.profitFactor.toFixed(2)}
          benchmarks={BENCHMARKS.profitFactor}
          description="gross profit / gross loss"
        />
        <MetricBar
          label="Sharpe Ratio"
          value={stats.sharpeRatio}
          displayValue={stats.sharpeRatio.toFixed(2)}
          benchmarks={BENCHMARKS.sharpeRatio}
          description="risk-adjusted return"
        />
        <MetricBar
          label="Payoff Ratio"
          value={stats.payoffRatio}
          displayValue={`${stats.payoffRatio.toFixed(2)}x`}
          benchmarks={BENCHMARKS.payoffRatio}
          description="avg win / avg loss"
        />
        <MetricBar
          label="Max Drawdown"
          value={stats.maxDrawdown}
          displayValue={`${(stats.maxDrawdown * 100).toFixed(1)}%`}
          benchmarks={BENCHMARKS.maxDrawdown}
          description="worst peak-to-trough"
        />
      </div>

      {/* Actionable takeaway */}
      <div className="mt-4 pt-4 border-t border-zinc-800">
        <div className="text-xs text-zinc-400">
          {stats.winRate > 0.5 && stats.payoffRatio < 0.8 ? (
            <span>
              <strong className="text-amber-400">Key issue:</strong> You pick direction well ({(stats.winRate * 100).toFixed(0)}% win rate) but your avg loss is{" "}
              {(stats.avgLoss / stats.avgWin).toFixed(1)}x your avg win. Focus on{" "}
              <strong className="text-zinc-200">stop-loss discipline</strong> — cutting losers at 1-2% would dramatically improve results.
            </span>
          ) : stats.winRate < 0.4 && stats.payoffRatio > 1.5 ? (
            <span>
              <strong className="text-amber-400">Key issue:</strong> Your risk/reward is good ({stats.payoffRatio.toFixed(1)}x) but win rate is low. Focus on{" "}
              <strong className="text-zinc-200">entry timing</strong> — better entries would maintain your R:R while boosting win rate.
            </span>
          ) : stats.profitFactor > 1.5 ? (
            <span>
              <strong className="text-emerald-400">Strength:</strong> Your system has a positive edge. Keep position sizes consistent and avoid overtrading.
            </span>
          ) : (
            <span>
              <strong className="text-amber-400">Focus area:</strong> Work on one metric at a time. The fastest improvement usually comes from{" "}
              <strong className="text-zinc-200">reducing loss size</strong> (tighter stops) rather than increasing win rate.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
