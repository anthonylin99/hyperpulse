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

  // ─── Best/worst asset ─────────────────────────────────────────
  const assetsWithTrades = byAsset.filter((a) => a.trades >= 3);
  if (assetsWithTrades.length > 0) {
    const best = assetsWithTrades[0]; // already sorted by P&L desc
    if (best.pnl > 0) {
      insights.push({
        type: "positive",
        title: `Most profitable on ${best.coin}`,
        detail: `${best.trades} trades, ${(best.winRate * 100).toFixed(0)}% win rate, ${formatUSD(best.pnl)} total P&L`,
        metric: "Best Asset",
        value: best.coin,
      });
    }

    const worst = assetsWithTrades[assetsWithTrades.length - 1];
    if (worst.pnl < 0 && worst.coin !== best.coin) {
      insights.push({
        type: "warning",
        title: `Losing money on ${worst.coin}`,
        detail: `${worst.trades} trades, ${(worst.winRate * 100).toFixed(0)}% win rate, ${formatUSD(worst.pnl)} total P&L. Consider reducing size or avoiding.`,
        metric: "Worst Asset",
        value: worst.coin,
      });
    }
  }

  // ─── Best trading hours ───────────────────────────────────────
  const activeHours = byHour.filter((h) => h.trades >= 3);
  if (activeHours.length >= 2) {
    const bestHour = activeHours.reduce((a, b) =>
      a.winRate > b.winRate ? a : b,
    );
    const worstHour = activeHours.reduce((a, b) =>
      a.winRate < b.winRate ? a : b,
    );

    if (bestHour.winRate > stats.winRate + 0.1) {
      insights.push({
        type: "positive",
        title: `Best hours: ${bestHour.hour}:00-${bestHour.hour + 1}:00 UTC`,
        detail: `${(bestHour.winRate * 100).toFixed(0)}% win rate (${bestHour.trades} trades) vs your overall ${(stats.winRate * 100).toFixed(0)}%`,
        metric: "Peak Hour",
        value: `${bestHour.hour}:00 UTC`,
      });
    }

    if (
      worstHour.winRate < stats.winRate - 0.1 &&
      worstHour.hour !== bestHour.hour
    ) {
      insights.push({
        type: "warning",
        title: `Worst hours: ${worstHour.hour}:00-${worstHour.hour + 1}:00 UTC`,
        detail: `Only ${(worstHour.winRate * 100).toFixed(0)}% win rate (${worstHour.trades} trades). Consider avoiding this window.`,
        metric: "Weak Hour",
        value: `${worstHour.hour}:00 UTC`,
      });
    }
  }

  // ─── Best trading day ─────────────────────────────────────────
  const activeDays = byDay.filter((d) => d.trades >= 3);
  if (activeDays.length >= 2) {
    const bestDay = activeDays.reduce((a, b) => (a.pnl > b.pnl ? a : b));
    if (bestDay.pnl > 0) {
      insights.push({
        type: "positive",
        title: `${bestDay.dayName}s are your best day`,
        detail: `${formatUSD(bestDay.pnl)} total P&L across ${bestDay.trades} trades (${(bestDay.winRate * 100).toFixed(0)}% win rate)`,
        metric: "Best Day",
        value: bestDay.dayName,
      });
    }
  }

  // ─── Win/loss ratio analysis ──────────────────────────────────
  if (stats.avgWin > 0 && stats.avgLoss > 0) {
    const ratio = stats.avgLoss / stats.avgWin;
    if (ratio > 2) {
      insights.push({
        type: "warning",
        title: "Losses are outsized vs wins",
        detail: `Avg loss (${formatUSD(stats.avgLoss)}) is ${ratio.toFixed(1)}x your avg win (${formatUSD(stats.avgWin)}). Consider tighter stop losses.`,
        metric: "Loss/Win Ratio",
        value: `${ratio.toFixed(1)}x`,
      });
    } else if (ratio < 0.7) {
      insights.push({
        type: "positive",
        title: "Strong risk management",
        detail: `Avg loss (${formatUSD(stats.avgLoss)}) is smaller than avg win (${formatUSD(stats.avgWin)}). Good discipline.`,
        metric: "Loss/Win Ratio",
        value: `${ratio.toFixed(1)}x`,
      });
    }
  }

  // ─── Sharpe ratio context ─────────────────────────────────────
  if (stats.sharpeRatio > 2) {
    insights.push({
      type: "positive",
      title: "Excellent risk-adjusted returns",
      detail: `Sharpe ratio of ${stats.sharpeRatio.toFixed(2)} is well above the 1.0 benchmark. Institutional-grade performance.`,
      metric: "Sharpe",
      value: stats.sharpeRatio.toFixed(2),
    });
  } else if (stats.sharpeRatio < 0.5 && stats.sharpeRatio !== 0) {
    insights.push({
      type: "warning",
      title: "Low risk-adjusted returns",
      detail: `Sharpe ratio of ${stats.sharpeRatio.toFixed(2)} is below the 1.0 benchmark. Returns may not justify the risk taken.`,
      metric: "Sharpe",
      value: stats.sharpeRatio.toFixed(2),
    });
  }

  // ─── Max drawdown warning ─────────────────────────────────────
  if (stats.maxDrawdown > 0.3) {
    insights.push({
      type: "warning",
      title: `${(stats.maxDrawdown * 100).toFixed(1)}% max drawdown`,
      detail: `Your worst peak-to-trough decline exceeded 30%. Consider reducing leverage or position sizes.`,
      metric: "Max DD",
      value: formatPct(-stats.maxDrawdown * 100),
    });
  }

  // ─── Funding costs ────────────────────────────────────────────
  if (stats.totalFundingNet < 0 && stats.totalPnl > 0) {
    const fundingPct =
      (Math.abs(stats.totalFundingNet) / stats.totalPnl) * 100;
    if (fundingPct > 10) {
      insights.push({
        type: "warning",
        title: "High funding costs eating into profits",
        detail: `You've paid ${formatUSD(Math.abs(stats.totalFundingNet))} in funding — ${fundingPct.toFixed(0)}% of your gross profit. Consider shorter hold times or trading during low-funding periods.`,
        metric: "Funding Drag",
        value: `${fundingPct.toFixed(0)}%`,
      });
    }
  } else if (stats.totalFundingNet > 0) {
    insights.push({
      type: "positive",
      title: "Earning from funding",
      detail: `You've earned ${formatUSD(stats.totalFundingNet)} in funding payments. Positioning well relative to the market.`,
      metric: "Funding Income",
      value: formatUSD(stats.totalFundingNet),
    });
  }

  // ─── Streak analysis ──────────────────────────────────────────
  if (stats.longestLoseStreak >= 5) {
    insights.push({
      type: "warning",
      title: `${stats.longestLoseStreak}-trade losing streak detected`,
      detail: `Consider adding a cool-off rule: stop trading after 3-4 consecutive losses to avoid tilt.`,
      metric: "Lose Streak",
      value: `${stats.longestLoseStreak}`,
    });
  }

  if (stats.longestWinStreak >= 7) {
    insights.push({
      type: "positive",
      title: `${stats.longestWinStreak}-trade winning streak`,
      detail: `Strong momentum. Be cautious of overconfidence — this is when sizing can get too aggressive.`,
      metric: "Win Streak",
      value: `${stats.longestWinStreak}`,
    });
  }

  // ─── Trade frequency ──────────────────────────────────────────
  const avgDurationHours = stats.avgTradeDuration / (1000 * 60 * 60);
  if (avgDurationHours < 0.5 && stats.totalTrades > 20) {
    insights.push({
      type: "neutral",
      title: "High-frequency scalping pattern",
      detail: `Average trade lasts ${avgDurationHours < 1 ? `${(avgDurationHours * 60).toFixed(0)} minutes` : `${avgDurationHours.toFixed(1)} hours`}. Fees matter more at this pace — ${formatUSD(stats.totalFeesPaid)} total fees paid.`,
      metric: "Avg Duration",
      value: `${(avgDurationHours * 60).toFixed(0)}m`,
    });
  }

  // ─── Expectancy ───────────────────────────────────────────────
  if (stats.expectancy > 0) {
    insights.push({
      type: "positive",
      title: `Positive expectancy: ${formatUSD(stats.expectancy)}/trade`,
      detail: `On average, each trade makes ${formatUSD(stats.expectancy)}. Over ${stats.totalTrades} trades that compounds.`,
      metric: "Expectancy",
      value: formatUSD(stats.expectancy),
    });
  } else if (stats.expectancy < 0 && stats.totalTrades > 10) {
    insights.push({
      type: "warning",
      title: `Negative expectancy: ${formatUSD(stats.expectancy)}/trade`,
      detail: `On average, each trade loses ${formatUSD(Math.abs(stats.expectancy))}. Review your edge and consider paper trading.`,
      metric: "Expectancy",
      value: formatUSD(stats.expectancy),
    });
  }

  // Sort: warnings first, then positives, then neutral
  const priority = { warning: 0, positive: 1, neutral: 2 };
  insights.sort((a, b) => priority[a.type] - priority[b.type]);

  return insights;
}
