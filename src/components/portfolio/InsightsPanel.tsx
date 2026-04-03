"use client";

import { usePortfolio } from "@/context/PortfolioContext";
import { cn } from "@/lib/format";

const TYPE_STYLES = {
  positive: {
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    icon: "text-emerald-400",
    iconChar: "↑",
  },
  warning: {
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    icon: "text-amber-400",
    iconChar: "!",
  },
  neutral: {
    border: "border-zinc-700",
    bg: "bg-zinc-800/50",
    icon: "text-zinc-400",
    iconChar: "—",
  },
};

export default function InsightsPanel() {
  const { insights } = usePortfolio();
  const suggestions = [
    "Breakdown my edge",
    "Funding regime risk",
    "Best hours to trade",
  ];

  if (insights.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-zinc-400 mb-4">
        AI Insights ({insights.length})
      </h3>
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
          Ask Gundlach
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((text) => (
            <button
              key={text}
              className="ghost-chip px-2 py-1 text-[10px] font-mono font-semibold rounded"
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {insights.map((insight, i) => {
          const style = TYPE_STYLES[insight.type];
          const isLast = i === insights.length - 1;
          return (
            <div
              key={i}
              className={cn(
                "rounded-lg border p-3",
                style.border,
                style.bg,
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold shrink-0 mt-0.5",
                    style.icon,
                    insight.type === "warning" && "bg-amber-500/10",
                    insight.type === "positive" && "bg-emerald-500/10",
                    insight.type === "neutral" && "bg-zinc-700",
                  )}
                >
                  {style.iconChar}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">
                      {insight.title}
                    </span>
                    {insight.metric && insight.value && (
                      <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                        {insight.metric}: {insight.value}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    {insight.detail}
                    {isLast && <span className="terminal-cursor" />}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
