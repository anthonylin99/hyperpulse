import type {
  Fill,
  RoundTripTrade,
  FundingEntry,
  PortfolioStats,
  AssetBreakdown,
  HourlyBreakdown,
  DailyBreakdown,
  EquityPoint,
} from "@/types";

// ─── Round-Trip Trade Grouping ──────────────────────────────────
// Groups raw fills into round-trip trades (open → close).
// HL fills include a `dir` field: "Open Long", "Close Long", "Open Short", "Close Short"
// We accumulate fills per coin until the position flips or closes.

export function groupFillsIntoTrades(fills: Fill[]): RoundTripTrade[] {
  // Sort chronologically
  const sorted = [...fills].sort((a, b) => a.time - b.time);
  const trades: RoundTripTrade[] = [];

  // Track open positions per coin
  const openPositions = new Map<
    string,
    { direction: "long" | "short"; fills: Fill[]; size: number }
  >();

  for (const fill of sorted) {
    const normalized = (() => {
      if (fill.dir === "Open Long" || fill.dir === "Close Long") {
        return { isOpen: fill.dir === "Open Long", direction: "long" as const };
      }
      if (fill.dir === "Open Short" || fill.dir === "Close Short") {
        return { isOpen: fill.dir === "Open Short", direction: "short" as const };
      }
      // Spot fills typically use Buy/Sell. Treat Buy as open/add long, Sell as close/reduce long.
      if (fill.dir === "Buy") {
        return { isOpen: true, direction: "long" as const };
      }
      if (fill.dir === "Sell") {
        return { isOpen: false, direction: "long" as const };
      }
      // Fallback: assume open long to avoid dropping fills silently
      return { isOpen: true, direction: "long" as const };
    })();

    const isOpen = normalized.isOpen;
    const direction = normalized.direction;

    const pos = openPositions.get(fill.coin);

    if (isOpen) {
      // Opening a new position or adding to existing
      if (pos && pos.direction === direction) {
        pos.fills.push(fill);
        pos.size += fill.sz;
      } else {
        // New position (or flipped direction)
        openPositions.set(fill.coin, {
          direction,
          fills: [fill],
          size: fill.sz,
        });
      }
    } else if (pos) {
      // Closing fill
      pos.fills.push(fill);
      pos.size -= fill.sz;

      // Position fully closed (or close enough due to rounding)
      if (pos.size <= 0.000001) {
        const entryFills = pos.fills.filter(
          (f) => f.dir.startsWith("Open") || f.dir === "Buy",
        );
        const exitFills = pos.fills.filter(
          (f) => f.dir.startsWith("Close") || f.dir === "Sell",
        );

        if (entryFills.length > 0 && exitFills.length > 0) {
          const totalEntryNotional = entryFills.reduce(
            (s, f) => s + f.px * f.sz,
            0,
          );
          const totalEntrySz = entryFills.reduce((s, f) => s + f.sz, 0);
          const avgEntry = totalEntryNotional / totalEntrySz;

          const totalExitNotional = exitFills.reduce(
            (s, f) => s + f.px * f.sz,
            0,
          );
          const totalExitSz = exitFills.reduce((s, f) => s + f.sz, 0);
          const avgExit = totalExitNotional / totalExitSz;

          const totalFees = pos.fills.reduce((s, f) => s + f.fee, 0);
          const closedPnl = pos.fills.reduce(
            (s, f) => s + f.closedPnl,
            0,
          );

          const notional = avgEntry * totalEntrySz;
          const pnlPct = notional > 0 ? (closedPnl / notional) * 100 : 0;

          trades.push({
            id: `${fill.coin}-${entryFills[0].time}-${fill.time}`,
            coin: fill.coin,
            direction: pos.direction,
            entryPx: avgEntry,
            exitPx: avgExit,
            size: totalEntrySz,
            notional,
            entryTime: entryFills[0].time,
            exitTime: fill.time,
            duration: fill.time - entryFills[0].time,
            pnl: closedPnl,
            pnlPct,
            fees: totalFees,
            fundingPaid: 0, // merged later
            fills: [...pos.fills],
          });
        }

        openPositions.delete(fill.coin);
      }
    }
  }

  return trades;
}

// ─── Merge Funding into Trades ──────────────────────────────────

export function mergeFundingIntoTrades(
  trades: RoundTripTrade[],
  funding: FundingEntry[],
): RoundTripTrade[] {
  return trades.map((trade) => {
    const tradeFunding = funding.filter(
      (f) =>
        f.coin === trade.coin &&
        f.time >= trade.entryTime &&
        f.time <= trade.exitTime,
    );
    const fundingPaid = tradeFunding.reduce((s, f) => s + f.usdc, 0);
    return { ...trade, fundingPaid };
  });
}

// ─── Portfolio Statistics ───────────────────────────────────────

export function computePortfolioStats(
  trades: RoundTripTrade[],
  funding: FundingEntry[],
  startingBalance = 1000,
): PortfolioStats {
  const empty: PortfolioStats = {
    totalTrades: 0,
    winners: 0,
    losers: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: 0,
    payoffRatio: 0,
    kellyCriterion: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    maxDrawdown: 0,
    maxDrawdownPeriod: null,
    calmarRatio: 0,
    recoveryFactor: 0,
    avgWinDuration: 0,
    avgLossDuration: 0,
    avgTradeDuration: 0,
    totalPnl: 0,
    grossProfit: 0,
    grossLoss: 0,
    totalFeesPaid: 0,
    totalFundingNet: 0,
    bestTrade: null,
    worstTrade: null,
    longestWinStreak: 0,
    longestLoseStreak: 0,
    expectancy: 0,
    largestWin: 0,
    largestLoss: 0,
    avgRMultiple: 0,
  };

  if (trades.length === 0) return empty;

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);

  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const totalFees = trades.reduce((s, t) => s + t.fees, 0);
  const totalFundingNet = funding.reduce((s, f) => s + f.usdc, 0);

  // Streaks
  let winStreak = 0,
    loseStreak = 0,
    maxWinStreak = 0,
    maxLoseStreak = 0;
  for (const t of trades) {
    if (t.pnl > 0) {
      winStreak++;
      loseStreak = 0;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
    } else {
      loseStreak++;
      winStreak = 0;
      maxLoseStreak = Math.max(maxLoseStreak, loseStreak);
    }
  }

  // Sharpe ratio (annualized, using daily returns proxy)
  const returns = trades.map((t) => t.pnlPct / 100);
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  // Sortino ratio (only downside deviation)
  const downsideReturns = returns.filter((r) => r < 0);
  const downsideVariance =
    downsideReturns.length > 0
      ? downsideReturns.reduce((s, r) => s + r ** 2, 0) /
        downsideReturns.length
      : 0;
  const downsideDev = Math.sqrt(downsideVariance);
  const sortinoRatio =
    downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(252) : 0;

  // Max drawdown from equity curve (starting balance + cumulative P&L)
  const { maxDrawdown, maxDrawdownPeriod } = computeMaxDrawdown(trades, startingBalance);

  // Calmar ratio
  const tradingDays =
    trades.length > 1
      ? (trades[trades.length - 1].exitTime - trades[0].entryTime) /
        (1000 * 60 * 60 * 24)
      : 1;
  const annualizedReturn = tradingDays > 0 ? (totalPnl / tradingDays) * 365 : 0;
  const calmarRatio =
    maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

  const sorted = [...trades].sort((a, b) => a.pnl - b.pnl);

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;

  // Payoff ratio (risk/reward): how much you make on wins vs lose on losses
  const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

  // Kelly Criterion: f* = W - (1-W)/R where W = win rate, R = payoff ratio
  // Tells you optimal fraction of capital to risk per trade
  const winRate = wins.length / trades.length;
  const kellyRaw = payoffRatio > 0
    ? winRate - (1 - winRate) / payoffRatio
    : 0;
  const kellyCriterion = Math.max(kellyRaw, 0); // negative kelly = don't trade

  // Recovery factor: net profit / max drawdown (in absolute terms)
  const maxDDAbsolute = maxDrawdown * startingBalance;
  const recoveryFactor = maxDDAbsolute > 0 ? totalPnl / maxDDAbsolute : 0;

  // Win/loss duration analysis
  const avgWinDuration = wins.length > 0
    ? wins.reduce((s, t) => s + t.duration, 0) / wins.length
    : 0;
  const avgLossDuration = losses.length > 0
    ? losses.reduce((s, t) => s + t.duration, 0) / losses.length
    : 0;

  // Largest single win/loss
  const largestWin = wins.length > 0 ? Math.max(...wins.map((t) => t.pnl)) : 0;
  const largestLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.pnl)) : 0;

  // R-multiple: express each trade's P&L as a multiple of avg loss ("1R")
  const avgRMultiple = avgLoss > 0
    ? (totalPnl / trades.length) / avgLoss
    : 0;

  return {
    totalTrades: trades.length,
    winners: wins.length,
    losers: losses.length,
    winRate,
    avgWin,
    avgLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    payoffRatio,
    kellyCriterion,
    sharpeRatio,
    sortinoRatio,
    maxDrawdown,
    maxDrawdownPeriod,
    calmarRatio,
    recoveryFactor,
    avgWinDuration,
    avgLossDuration,
    avgTradeDuration:
      trades.reduce((s, t) => s + t.duration, 0) / trades.length,
    totalPnl,
    grossProfit,
    grossLoss,
    totalFeesPaid: totalFees,
    totalFundingNet,
    bestTrade: sorted[sorted.length - 1] ?? null,
    worstTrade: sorted[0] ?? null,
    longestWinStreak: maxWinStreak,
    longestLoseStreak: maxLoseStreak,
    expectancy: totalPnl / trades.length,
    largestWin,
    largestLoss,
    avgRMultiple,
  };
}

// ─── Max Drawdown ───────────────────────────────────────────────

function computeMaxDrawdown(trades: RoundTripTrade[], startingBalance: number): {
  maxDrawdown: number;
  maxDrawdownPeriod: { start: number; end: number } | null;
} {
  if (trades.length === 0)
    return { maxDrawdown: 0, maxDrawdownPeriod: null };

  // Use equity (startingBalance + cumPnl) so drawdown is relative to actual portfolio value
  let equity = startingBalance;
  let peak = equity;
  let maxDD = 0;
  let ddStart = trades[0].exitTime;
  let ddEnd = trades[0].exitTime;
  let currentDDStart = trades[0].exitTime;

  for (const trade of trades) {
    equity += trade.pnl;
    if (equity > peak) {
      peak = equity;
      currentDDStart = trade.exitTime;
    }
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDD) {
      maxDD = dd;
      ddStart = currentDDStart;
      ddEnd = trade.exitTime;
    }
  }

  // Cap at 100% — can't lose more than everything
  maxDD = Math.min(maxDD, 1);

  return {
    maxDrawdown: maxDD,
    maxDrawdownPeriod: maxDD > 0 ? { start: ddStart, end: ddEnd } : null,
  };
}

// ─── Equity Curve ───────────────────────────────────────────────

export function computeEquityCurve(
  trades: RoundTripTrade[],
  startingBalance: number,
): EquityPoint[] {
  if (trades.length === 0) return [];

  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime);
  const points: EquityPoint[] = [];
  let equity = startingBalance;
  let peak = equity;

  // Starting point
  points.push({ time: sorted[0].entryTime, equity, drawdown: 0 });

  for (const trade of sorted) {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    const drawdown = peak > 0 ? (equity - peak) / peak : 0;
    points.push({ time: trade.exitTime, equity, drawdown });
  }

  return points;
}

// ─── Breakdown by Asset ─────────────────────────────────────────

export function computeByAsset(
  trades: RoundTripTrade[],
): AssetBreakdown[] {
  const map = new Map<string, RoundTripTrade[]>();
  for (const t of trades) {
    const arr = map.get(t.coin) ?? [];
    arr.push(t);
    map.set(t.coin, arr);
  }

  return Array.from(map.entries())
    .map(([coin, coinTrades]) => {
      const wins = coinTrades.filter((t) => t.pnl > 0);
      return {
        coin,
        trades: coinTrades.length,
        pnl: coinTrades.reduce((s, t) => s + t.pnl, 0),
        winRate:
          coinTrades.length > 0 ? wins.length / coinTrades.length : 0,
        avgHoldTime:
          coinTrades.reduce((s, t) => s + t.duration, 0) /
          coinTrades.length,
        totalVolume: coinTrades.reduce((s, t) => s + t.notional, 0),
      };
    })
    .sort((a, b) => b.pnl - a.pnl);
}

// ─── Breakdown by Hour of Day ───────────────────────────────────

export function computeByTimeOfDay(
  trades: RoundTripTrade[],
): HourlyBreakdown[] {
  const buckets: Map<number, RoundTripTrade[]> = new Map();
  for (let h = 0; h < 24; h++) buckets.set(h, []);

  for (const t of trades) {
    const hour = new Date(t.entryTime).getUTCHours();
    buckets.get(hour)!.push(t);
  }

  return Array.from(buckets.entries()).map(([hour, hTrades]) => ({
    hour,
    trades: hTrades.length,
    pnl: hTrades.reduce((s, t) => s + t.pnl, 0),
    winRate:
      hTrades.length > 0
        ? hTrades.filter((t) => t.pnl > 0).length / hTrades.length
        : 0,
  }));
}

// ─── Breakdown by Day of Week ───────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function computeByDayOfWeek(
  trades: RoundTripTrade[],
): DailyBreakdown[] {
  const buckets: Map<number, RoundTripTrade[]> = new Map();
  for (let d = 0; d < 7; d++) buckets.set(d, []);

  for (const t of trades) {
    const day = new Date(t.entryTime).getUTCDay();
    buckets.get(day)!.push(t);
  }

  return Array.from(buckets.entries()).map(([day, dTrades]) => ({
    day,
    dayName: DAY_NAMES[day],
    trades: dTrades.length,
    pnl: dTrades.reduce((s, t) => s + t.pnl, 0),
    winRate:
      dTrades.length > 0
        ? dTrades.filter((t) => t.pnl > 0).length / dTrades.length
        : 0,
  }));
}
