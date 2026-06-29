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
// Groups raw fills into realized trade lots. Adds are kept inside the same
// position and each close is matched FIFO so partial exits do not drop later legs.

export function isPerpFill(fill: { dir?: unknown }): boolean {
  const dir = String(fill.dir ?? "");
  return (
    dir === "Open Long" ||
    dir === "Close Long" ||
    dir === "Open Short" ||
    dir === "Close Short"
  );
}

export function groupFillsIntoTrades(fills: Fill[]): RoundTripTrade[] {
  // Sort chronologically
  const sorted = [...fills].filter(isPerpFill).sort((a, b) => a.time - b.time);
  const trades: RoundTripTrade[] = [];

  type OpenLot = {
    fill: Fill;
    remainingSize: number;
    remainingFee: number;
  };

  // Track open lots per coin. Hyperliquid gives explicit open/close dirs, so
  // matching closes to prior opens gives more accurate P&L for adds/reduces.
  const openPositions = new Map<
    string,
    { direction: "long" | "short"; lots: OpenLot[] }
  >();

  for (let index = 0; index < sorted.length; index += 1) {
    const fill = sorted[index];
    const normalized = (() => {
      if (fill.dir === "Open Long" || fill.dir === "Close Long") {
        return { isOpen: fill.dir === "Open Long", direction: "long" as const };
      }
      if (fill.dir === "Open Short" || fill.dir === "Close Short") {
        return { isOpen: fill.dir === "Open Short", direction: "short" as const };
      }
      return null;
    })();

    if (!normalized) continue;

    const isOpen = normalized.isOpen;
    const direction = normalized.direction;

    const pos = openPositions.get(fill.coin);

    if (isOpen) {
      // Opening a new position or adding to existing
      if (pos && pos.direction === direction) {
        pos.lots.push({
          fill,
          remainingSize: fill.sz,
          remainingFee: fill.fee,
        });
      } else {
        // New position (or flipped direction)
        openPositions.set(fill.coin, {
          direction,
          lots: [{
            fill,
            remainingSize: fill.sz,
            remainingFee: fill.fee,
          }],
        });
      }
    } else if (pos && pos.direction === direction) {
      let sizeToClose = fill.sz;
      const matchedOpenFills: Fill[] = [];
      let matchedSize = 0;
      let matchedEntryNotional = 0;
      let matchedOpenFees = 0;
      let entryTime: number | null = null;

      while (sizeToClose > 0.000001 && pos.lots.length > 0) {
        const lot = pos.lots[0];
        const take = Math.min(sizeToClose, lot.remainingSize);
        const lotShare = lot.remainingSize > 0 ? take / lot.remainingSize : 0;

        matchedOpenFills.push(lot.fill);
        matchedSize += take;
        matchedEntryNotional += lot.fill.px * take;
        matchedOpenFees += lot.remainingFee * lotShare;
        entryTime = entryTime == null ? lot.fill.time : Math.min(entryTime, lot.fill.time);

        lot.remainingSize -= take;
        lot.remainingFee -= lot.remainingFee * lotShare;
        sizeToClose -= take;

        if (lot.remainingSize <= 0.000001) {
          pos.lots.shift();
        }
      }

      if (matchedSize > 0 && entryTime != null) {
        const closeShare = fill.sz > 0 ? matchedSize / fill.sz : 0;
        const closedPnl = fill.closedPnl * closeShare;
        const closeFee = fill.fee * closeShare;
        const entryPx = matchedEntryNotional / matchedSize;
        const notional = entryPx * matchedSize;
        const pnlPct = notional > 0 ? (closedPnl / notional) * 100 : 0;

        trades.push({
          id: `${fill.coin}-${entryTime}-${fill.time}-${fill.oid ?? index}`,
          coin: fill.coin,
          direction: pos.direction,
          entryPx,
          exitPx: fill.px,
          size: matchedSize,
          notional,
          entryTime,
          exitTime: fill.time,
          duration: fill.time - entryTime,
          pnl: closedPnl,
          netPnl: closedPnl - (matchedOpenFees + closeFee), // funding merged in later
          pnlPct,
          fees: matchedOpenFees + closeFee,
          fundingPaid: 0, // merged later
          fills: Array.from(new Set([...matchedOpenFills, fill])),
        });
      }

      if (pos.lots.length === 0) {
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
  // Each funding payment must be counted once. Adds + partial closes can produce
  // several round-trip trades on the same coin whose [entryTime, exitTime] windows
  // overlap; a naive per-trade filter would assign the same funding entry to all of
  // them and overstate per-trade funding. Allocate each entry once, by size, across
  // the trades that were genuinely open when it accrued.
  const fundingByTrade = new Map<string, number>();
  for (const trade of trades) fundingByTrade.set(trade.id, 0);

  const tradesByCoin = new Map<string, RoundTripTrade[]>();
  for (const trade of trades) {
    const arr = tradesByCoin.get(trade.coin) ?? [];
    arr.push(trade);
    tradesByCoin.set(trade.coin, arr);
  }

  for (const f of funding) {
    const open = (tradesByCoin.get(f.coin) ?? []).filter(
      (t) => f.time >= t.entryTime && f.time <= t.exitTime,
    );
    const matchedSize = open.reduce((s, t) => s + t.size, 0);
    if (matchedSize <= 0) continue; // funding while flat / outside any round trip

    // Funding is charged on the whole position (f.positionSize). When the matched
    // round trips cover less size than that — e.g. open 2, pay funding, close 1 while
    // 1 stays open (not yet a round trip) — only allocate the closed share so the
    // closed trade does not absorb funding for still-open size. Fall back to a full
    // split when positionSize is missing/unreliable so closed-size funding is never dropped.
    const fundingSize = Math.abs(f.positionSize);
    const allocatable =
      Number.isFinite(fundingSize) && fundingSize > 0 && matchedSize < fundingSize
        ? f.usdc * (matchedSize / fundingSize)
        : f.usdc;
    for (const t of open) {
      fundingByTrade.set(t.id, (fundingByTrade.get(t.id) ?? 0) + allocatable * (t.size / matchedSize));
    }
  }

  return trades.map((trade) => {
    const fundingPaid = fundingByTrade.get(trade.id) ?? 0;
    return { ...trade, fundingPaid, netPnl: trade.pnl - trade.fees + fundingPaid };
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

  // Win/loss outcomes use NET P&L (after fees + funding) — that's what actually hit
  // the account and matches the documented win-rate definition. Gross profit/loss are
  // kept separately (below) for the P&L waterfall and the gross-based profit factor.
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl <= 0);

  const grossProfit = trades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0));
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0); // gross closed P&L
  const netTotalPnl = trades.reduce((s, t) => s + t.netPnl, 0); // after fees + funding
  const totalFees = trades.reduce((s, t) => s + t.fees, 0);
  const totalFundingNet = funding.reduce((s, f) => s + f.usdc, 0);

  // Streaks (net outcome)
  let winStreak = 0,
    loseStreak = 0,
    maxWinStreak = 0,
    maxLoseStreak = 0;
  for (const t of trades) {
    if (t.netPnl > 0) {
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

  // Calmar ratio — net return vs the (net) max drawdown, so a gross-positive but
  // net-negative account can't show a positive ratio against a losing equity curve.
  const tradingDays =
    trades.length > 1
      ? (trades[trades.length - 1].exitTime - trades[0].entryTime) /
        (1000 * 60 * 60 * 24)
      : 1;
  const annualizedReturn = tradingDays > 0 ? (netTotalPnl / tradingDays) * 365 : 0;
  const calmarRatio =
    maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

  const sorted = [...trades].sort((a, b) => a.netPnl - b.netPnl);

  // Average winner / loser use net P&L, consistent with the net win/loss split.
  const netWinTotal = wins.reduce((s, t) => s + t.netPnl, 0);
  const netLossTotal = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const avgWin = wins.length > 0 ? netWinTotal / wins.length : 0;
  const avgLoss = losses.length > 0 ? netLossTotal / losses.length : 0;

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
  const recoveryFactor = maxDDAbsolute > 0 ? netTotalPnl / maxDDAbsolute : 0;

  // Win/loss duration analysis
  const avgWinDuration = wins.length > 0
    ? wins.reduce((s, t) => s + t.duration, 0) / wins.length
    : 0;
  const avgLossDuration = losses.length > 0
    ? losses.reduce((s, t) => s + t.duration, 0) / losses.length
    : 0;

  // Largest single net win/loss
  const largestWin = wins.length > 0 ? Math.max(...wins.map((t) => t.netPnl)) : 0;
  const largestLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.netPnl)) : 0;

  // R-multiple: express each trade's net P&L as a multiple of avg loss ("1R")
  const avgRMultiple = avgLoss > 0
    ? (netTotalPnl / trades.length) / avgLoss
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
    expectancy: netTotalPnl / trades.length,
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
    equity += trade.netPnl;
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
    equity += trade.netPnl;
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
