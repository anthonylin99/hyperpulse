import type {
  PortfolioStats,
  AssetBreakdown,
  HourlyBreakdown,
  DailyBreakdown,
  Insight,
} from "@/types";
import { formatUSD, formatPct } from "./format";

export function generateInsights(
  stats: PortfolioStats,
  byAsset: AssetBreakdown[],
  byHour: HourlyBreakdown[],
  byDay: DailyBreakdown[],
): Insight[] {
  const insights: Insight[] = [];

  if (stats.totalTrades < 3) return insights;

  // ─── Core edge diagnosis ────────────────────────────────────────
  // This is THE most important insight — do they have a positive edge?
  if (stats.kellyCriterion === 0 && stats.totalTrades >= 5) {
    insights.push({
      type: "warning",
      title: "No statistical edge detected",
      detail: `Kelly Criterion is 0% — your win rate (${(stats.winRate * 100).toFixed(0)}%) combined with payoff ratio (${stats.payoffRatio.toFixed(2)}) doesn't produce a positive edge. Either increase win rate OR make winners bigger relative to losers.`,
      metric: "Kelly",
      value: "0%",
    });
  } else if (stats.kellyCriterion > 0.15) {
    insights.push({
      type: "positive",
      title: `Strong edge: Kelly suggests ${(stats.kellyCriterion * 100).toFixed(0)}% sizing`,
      detail: `Your win rate and payoff ratio combine to a meaningful edge. Half-Kelly (${(stats.kellyCriterion * 50).toFixed(0)}% per trade) is the conservative approach.`,
      metric: "Kelly",
      value: `${(stats.kellyCriterion * 100).toFixed(0)}%`,
    });
  }

  // ─── Payoff ratio analysis (the "cut winners / hold losers" diagnostic)
  if (stats.payoffRatio < 0.7 && stats.avgWin > 0 && stats.avgLoss > 0) {
    const ratio = stats.avgLoss / stats.avgWin;
    insights.push({
      type: "warning",
      title: "Cutting winners too early",
      detail: `Avg loss (${formatUSD(stats.avgLoss)}) is ${ratio.toFixed(1)}x your avg win (${formatUSD(stats.avgWin)}). ${stats.winRate > 0.5 ? `You win ${(stats.winRate * 100).toFixed(0)}% of the time but losses wipe out gains.` : ""} Consider wider take-profits or tighter stop-losses.`,
      metric: "Payoff Ratio",
      value: stats.payoffRatio.toFixed(2),
    });
  } else if (stats.payoffRatio > 2) {
    insights.push({
      type: "positive",
      title: "Excellent risk/reward discipline",
      detail: `Your winners (${formatUSD(stats.avgWin)}) are ${stats.payoffRatio.toFixed(1)}x your losers (${formatUSD(stats.avgLoss)}). This means you can be profitable even with a sub-50% win rate.`,
      metric: "Payoff Ratio",
      value: stats.payoffRatio.toFixed(2),
    });
  }

  // ─── Win rate + payoff combo diagnosis ──────────────────────────
  if (stats.winRate > 0.5 && stats.expectancy < 0) {
    insights.push({
      type: "warning",
      title: "Winning more but still losing money",
      detail: `You win ${(stats.winRate * 100).toFixed(0)}% of trades but expectancy is ${formatUSD(stats.expectancy)}/trade. Your losses are too big relative to wins. Focus on position sizing and stop-loss discipline.`,
      metric: "Edge Gap",
      value: `${(stats.winRate * 100).toFixed(0)}% WR, ${formatUSD(stats.expectancy)} EV`,
    });
  }

  // ─── Duration analysis ──────────────────────────────────────────
  if (stats.avgLossDuration > stats.avgWinDuration * 1.5 && stats.losers >= 3) {
    const winDurH = stats.avgWinDuration / (1000 * 60 * 60);
    const lossDurH = stats.avgLossDuration / (1000 * 60 * 60);
    insights.push({
      type: "warning",
      title: "Holding losers longer than winners",
      detail: `Losing trades last ${lossDurH < 24 ? `${lossDurH.toFixed(1)}h` : `${(lossDurH / 24).toFixed(1)}d`} vs winning trades at ${winDurH < 24 ? `${winDurH.toFixed(1)}h` : `${(winDurH / 24).toFixed(1)}d`}. Classic "hope it comes back" pattern. Set time-based stops.`,
      metric: "Hold Ratio",
      value: `${(stats.avgLossDuration / stats.avgWinDuration).toFixed(1)}x`,
    });
  }

  // ─── Best/worst asset ─────────────────────────────────────────
  const assetsWithTrades = byAsset.filter((a) => a.trades >= 2);
  if (assetsWithTrades.length > 0) {
    const best = assetsWithTrades[0]; // sorted by P&L desc
    if (best.pnl > 0) {
      insights.push({
        type: "positive",
        title: `Most profitable: ${best.coin}`,
        detail: `${best.trades} trades, ${(best.winRate * 100).toFixed(0)}% win rate, ${formatUSD(best.pnl)} P&L. ${formatUSD(best.totalVolume)} total volume traded.`,
        metric: "Best Asset",
        value: best.coin,
      });
    }

    const worst = assetsWithTrades[assetsWithTrades.length - 1];
    if (worst.pnl < 0 && worst.coin !== best.coin) {
      insights.push({
        type: "warning",
        title: `Losing on ${worst.coin}: ${formatUSD(worst.pnl)}`,
        detail: `${worst.trades} trades, ${(worst.winRate * 100).toFixed(0)}% win rate. Consider reducing size or avoiding ${worst.coin} until you find an edge.`,
        metric: "Worst Asset",
        value: worst.coin,
      });
    }
  }

  // ─── Best trading hours ───────────────────────────────────────
  const activeHours = byHour.filter((h) => h.trades >= 2);
  if (activeHours.length >= 2) {
    const bestHour = activeHours.reduce((a, b) =>
      a.pnl > b.pnl ? a : b,
    );
    const worstHour = activeHours.reduce((a, b) =>
      a.pnl < b.pnl ? a : b,
    );

    if (bestHour.pnl > 0) {
      insights.push({
        type: "positive",
        title: `Best hours: ${bestHour.hour}:00-${bestHour.hour + 1}:00 UTC`,
        detail: `${formatUSD(bestHour.pnl)} P&L, ${(bestHour.winRate * 100).toFixed(0)}% win rate across ${bestHour.trades} trades.`,
        metric: "Peak Hour",
        value: `${bestHour.hour}:00 UTC`,
      });
    }

    if (worstHour.pnl < 0 && worstHour.hour !== bestHour.hour) {
      insights.push({
        type: "warning",
        title: `Avoid ${worstHour.hour}:00-${worstHour.hour + 1}:00 UTC`,
        detail: `${formatUSD(worstHour.pnl)} P&L, ${(worstHour.winRate * 100).toFixed(0)}% win rate across ${worstHour.trades} trades. Your edge disappears in this window.`,
        metric: "Weak Hour",
        value: `${worstHour.hour}:00 UTC`,
      });
    }
  }

  // ─── Best trading day ─────────────────────────────────────────
  const activeDays = byDay.filter((d) => d.trades >= 2);
  if (activeDays.length >= 2) {
    const bestDay = activeDays.reduce((a, b) => (a.pnl > b.pnl ? a : b));
    if (bestDay.pnl > 0) {
      insights.push({
        type: "positive",
        title: `${bestDay.dayName}s are your best day`,
        detail: `${formatUSD(bestDay.pnl)} P&L across ${bestDay.trades} trades (${(bestDay.winRate * 100).toFixed(0)}% win rate).`,
        metric: "Best Day",
        value: bestDay.dayName,
      });
    }
  }

  // ─── Sharpe ratio context ─────────────────────────────────────
  if (stats.sharpeRatio > 2) {
    insights.push({
      type: "positive",
      title: "Excellent risk-adjusted returns",
      detail: `Sharpe of ${stats.sharpeRatio.toFixed(2)} is institutional-grade (>2.0). Your returns justify the risk taken.`,
      metric: "Sharpe",
      value: stats.sharpeRatio.toFixed(2),
    });
  } else if (stats.sharpeRatio < 0 && stats.totalTrades >= 5) {
    insights.push({
      type: "warning",
      title: `Negative Sharpe ratio: ${stats.sharpeRatio.toFixed(2)}`,
      detail: `Risk-adjusted returns are negative — you'd be better off in stables. Review your strategy before sizing up.`,
      metric: "Sharpe",
      value: stats.sharpeRatio.toFixed(2),
    });
  }

  // ─── Max drawdown warning ─────────────────────────────────────
  if (stats.maxDrawdown > 0.25) {
    insights.push({
      type: "warning",
      title: `${(stats.maxDrawdown * 100).toFixed(1)}% max drawdown`,
      detail: `Your worst peak-to-trough decline. At this level, you need a ${((1 / (1 - stats.maxDrawdown) - 1) * 100).toFixed(0)}% gain just to recover. Reduce leverage.`,
      metric: "Max DD",
      value: formatPct(-stats.maxDrawdown * 100),
    });
  }

  // ─── Funding costs ────────────────────────────────────────────
  if (stats.totalFundingNet < 0 && stats.grossProfit > 0) {
    const fundingPct =
      (Math.abs(stats.totalFundingNet) / stats.grossProfit) * 100;
    if (fundingPct > 10) {
      insights.push({
        type: "warning",
        title: "Funding costs eating profits",
        detail: `${formatUSD(Math.abs(stats.totalFundingNet))} in funding — ${fundingPct.toFixed(0)}% of gross profit. Shorter hold times or counter-funding-flow positioning helps.`,
        metric: "Funding Drag",
        value: `${fundingPct.toFixed(0)}%`,
      });
    }
  } else if (stats.totalFundingNet > 0) {
    insights.push({
      type: "positive",
      title: `Earned ${formatUSD(stats.totalFundingNet)} from funding`,
      detail: `Positioning well relative to the crowd. Funding is a profit center for you.`,
      metric: "Funding Income",
      value: formatUSD(stats.totalFundingNet),
    });
  }

  // ─── Streak analysis ──────────────────────────────────────────
  if (stats.longestLoseStreak >= 4) {
    insights.push({
      type: "warning",
      title: `${stats.longestLoseStreak}-trade losing streak`,
      detail: `Consider a cool-off rule: pause after 3 consecutive losses. Tilt compounds poor decision-making.`,
      metric: "Lose Streak",
      value: `${stats.longestLoseStreak}`,
    });
  }

  // ─── Largest win/loss analysis ────────────────────────────────
  if (stats.largestWin > 0 && stats.largestLoss < 0) {
    const concentration = stats.largestWin / stats.grossProfit;
    if (concentration > 0.5 && stats.winners >= 3) {
      insights.push({
        type: "neutral",
        title: "Profits concentrated in one trade",
        detail: `Your best trade (${formatUSD(stats.largestWin)}) accounts for ${(concentration * 100).toFixed(0)}% of total gross profit. This edge may not be repeatable.`,
        metric: "Concentration",
        value: `${(concentration * 100).toFixed(0)}%`,
      });
    }
  }

  // ─── Fee analysis ─────────────────────────────────────────────
  if (stats.totalFeesPaid > 0 && stats.grossProfit > 0) {
    const feePct = (stats.totalFeesPaid / stats.grossProfit) * 100;
    if (feePct > 20) {
      insights.push({
        type: "warning",
        title: `Fees consuming ${feePct.toFixed(0)}% of gross profit`,
        detail: `${formatUSD(stats.totalFeesPaid)} in total fees. Use limit orders (maker rebates) instead of market orders to reduce this.`,
        metric: "Fee Drag",
        value: `${feePct.toFixed(0)}%`,
      });
    }
  }

  // ─── R-multiple analysis ──────────────────────────────────────
  if (stats.avgRMultiple !== 0 && stats.avgLoss > 0) {
    insights.push({
      type: stats.avgRMultiple > 0 ? "positive" : "warning",
      title: `Avg R-multiple: ${stats.avgRMultiple.toFixed(2)}R`,
      detail: stats.avgRMultiple > 0
        ? `Each trade averages ${stats.avgRMultiple.toFixed(2)}x your typical loss. Positive R means your system works.`
        : `Each trade loses ${Math.abs(stats.avgRMultiple).toFixed(2)}x your typical loss on average. Negative R means the system needs adjustment.`,
      metric: "Avg R",
      value: `${stats.avgRMultiple.toFixed(2)}R`,
    });
  }

  // Sort: warnings first, then positives, then neutral
  const priority = { warning: 0, positive: 1, neutral: 2 };
  insights.sort((a, b) => priority[a.type] - priority[b.type]);

  return insights;
}
