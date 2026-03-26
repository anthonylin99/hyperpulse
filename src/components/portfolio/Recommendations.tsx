"use client";

import { usePortfolio } from "@/context/PortfolioContext";
import { formatUSD, cn } from "@/lib/format";

interface Recommendation {
  priority: number; // 1 = highest
  icon: string;
  title: string;
  problem: string;
  action: string;
  impact: string;
}

function generateRecommendations(
  stats: NonNullable<ReturnType<typeof usePortfolio>["stats"]>,
): Recommendation[] {
  const recs: Recommendation[] = [];

  // 1. Stop-loss recommendation (most impactful for losing traders)
  if (stats.avgLoss > stats.avgWin * 1.3 && stats.losers >= 2) {
    // Simulate: what if losses were capped at avg win * 1.2?
    const cappedLoss = stats.avgWin * 1.2;
    const savedPerLoss = stats.avgLoss - cappedLoss;
    const totalSaved = savedPerLoss * stats.losers;
    const simulatedPnl = stats.totalPnl + totalSaved;

    recs.push({
      priority: 1,
      icon: "x",
      title: `Set a ${formatUSD(cappedLoss)} stop-loss`,
      problem: `Your avg loss (${formatUSD(stats.avgLoss)}) is ${(stats.avgLoss / stats.avgWin).toFixed(1)}x your avg win (${formatUSD(stats.avgWin)}).`,
      action: `Cap losses at ${formatUSD(cappedLoss)} (1.2x your avg win). Use hard stop-loss orders, not mental stops.`,
      impact: `If applied to your ${stats.losers} losing trades, P&L would be ${formatUSD(simulatedPnl)} instead of ${formatUSD(stats.totalPnl)} (${formatUSD(totalSaved)} improvement).`,
    });
  }

  // 2. Position sizing with Kelly
  if (stats.kellyCriterion === 0) {
    recs.push({
      priority: 2,
      icon: "s",
      title: "Reduce position sizes immediately",
      problem: `Kelly Criterion is 0% — your current win rate (${(stats.winRate * 100).toFixed(0)}%) and payoff ratio (${stats.payoffRatio.toFixed(2)}) don't justify any position.`,
      action: "Trade paper or micro-size (0.5% of account per trade) until you develop a consistent edge. Focus on improving payoff ratio first.",
      impact: `At your current expectancy of ${formatUSD(stats.expectancy)}/trade, every trade you take has negative expected value.`,
    });
  } else if (stats.kellyCriterion > 0 && stats.kellyCriterion < 0.05) {
    recs.push({
      priority: 2,
      icon: "s",
      title: `Size positions at ${(stats.kellyCriterion * 50 * 100).toFixed(1)}% of account`,
      problem: `Your edge is thin. Kelly suggests ${(stats.kellyCriterion * 100).toFixed(1)}%, so half-Kelly is safer.`,
      action: `Risk no more than ${formatUSD((stats.kellyCriterion * 0.5) * 197)} per trade (half-Kelly on $197 account).`,
      impact: "Prevents ruin while your edge compounds. You can size up as metrics improve.",
    });
  }

  // 3. Take-profit recommendation
  if (stats.winners >= 3 && stats.bestTrade && stats.avgWin > 0) {
    const bestToAvg = stats.bestTrade.pnl / stats.avgWin;
    if (bestToAvg > 3) {
      // Best trade is way above average — winners might be getting closed too early on most trades
      recs.push({
        priority: 3,
        icon: "t",
        title: "Let winners run with trailing stops",
        problem: `Your best trade (${formatUSD(stats.bestTrade.pnl)}) was ${bestToAvg.toFixed(1)}x your avg win. Most winners are being closed too early.`,
        action: "Use trailing stop-losses instead of fixed take-profits. Move stop to breakeven after 1R of profit, then trail at 0.5R.",
        impact: "If avg winners increased to even half your best trade, profit factor would exceed 1.0.",
      });
    }
  }

  // 4. Fee reduction
  if (stats.totalFeesPaid > 0 && stats.grossProfit > 0) {
    const feePct = stats.totalFeesPaid / stats.grossProfit;
    if (feePct > 0.15) {
      recs.push({
        priority: 4,
        icon: "f",
        title: "Switch to limit orders",
        problem: `${formatUSD(stats.totalFeesPaid)} in fees = ${(feePct * 100).toFixed(0)}% of your gross profit. Market orders (taker fees ~0.035%) are 7x more expensive than limits (maker rebate ~0.005%).`,
        action: "Place limit orders 0.01-0.05% away from mid price. You'll save on fees AND get better entry prices.",
        impact: `Could save ~${formatUSD(stats.totalFeesPaid * 0.7)} (70% fee reduction) over the same trades.`,
      });
    }
  }

  // 5. Duration-based recommendation
  if (stats.avgLossDuration > stats.avgWinDuration * 2 && stats.losers >= 2) {
    const lossHrs = stats.avgLossDuration / (1000 * 60 * 60);
    const winHrs = stats.avgWinDuration / (1000 * 60 * 60);
    recs.push({
      priority: 3,
      icon: "d",
      title: `Add a ${Math.ceil(winHrs * 1.5)}h time stop`,
      problem: `Losing trades last ${lossHrs.toFixed(1)}h vs winners at ${winHrs.toFixed(1)}h. You're "hoping" losers recover.`,
      action: `If a trade hasn't hit your target within ${Math.ceil(winHrs * 1.5)} hours, close it regardless. Good trades work quickly.`,
      impact: "Time stops prevent the slow bleed that turns small losses into large ones.",
    });
  }

  // 6. Streak management
  if (stats.longestLoseStreak >= 3) {
    recs.push({
      priority: 4,
      icon: "p",
      title: `Cool-off rule: pause after ${Math.min(stats.longestLoseStreak - 1, 3)} consecutive losses`,
      problem: `You hit a ${stats.longestLoseStreak}-trade losing streak. Tilt and revenge trading compound losses.`,
      action: `After ${Math.min(stats.longestLoseStreak - 1, 3)} consecutive losses, stop trading for 4+ hours. Review what went wrong before re-entering.`,
      impact: "Prevents the emotional spiral that turns a bad day into a blown account.",
    });
  }

  // 7. Funding optimization
  if (stats.totalFundingNet < -5) {
    recs.push({
      priority: 5,
      icon: "r",
      title: "Trade in the direction of funding",
      problem: `You've paid ${formatUSD(Math.abs(stats.totalFundingNet))} in funding. You're consistently on the crowded side of the trade.`,
      action: "Check funding rates before entering. When funding is extremely positive (>0.01%/8h), consider shorting. When negative, consider longing. This puts funding payments in your pocket.",
      impact: `At minimum, you'd save ${formatUSD(Math.abs(stats.totalFundingNet))} over the same period.`,
    });
  }

  return recs.sort((a, b) => a.priority - b.priority);
}

export default function Recommendations() {
  const { stats } = usePortfolio();

  if (!stats || stats.totalTrades < 3) return null;

  const recs = generateRecommendations(stats);

  if (recs.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-zinc-400 mb-1">
        Action Plan
      </h3>
      <p className="text-xs text-zinc-600 mb-4">
        Specific changes ranked by expected impact
      </p>

      <div className="space-y-3">
        {recs.map((rec, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg border p-3",
              i === 0
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-zinc-700 bg-zinc-800/30",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                  i === 0
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-zinc-700 text-zinc-400",
                )}
              >
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-200">
                  {rec.title}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  <strong>Problem:</strong> {rec.problem}
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  <strong>Do this:</strong> {rec.action}
                </div>
                <div className="text-xs text-emerald-400/80 mt-1">
                  <strong>Expected impact:</strong> {rec.impact}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
