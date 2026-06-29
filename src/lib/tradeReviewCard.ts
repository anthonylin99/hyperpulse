import type { PortfolioStats } from "@/types";

// ─── Trade Review Card ──────────────────────────────────────────
// Pure model + verdict generator for the shareable "trade review" card.
// All P&L here is NET (after fees + funding) — the same honest basis the
// portfolio analytics now use. Keep this dependency-free so it can run in the
// edge OG-image runtime as well as in a server component.

export type TradeReviewTone = "win" | "loss" | "flat";

export interface TradeReviewInput {
  address: string;
  /** Human label for the window, e.g. "all time". */
  period: string;
  /** Capital the trader put in, used as the denominator for return %. */
  startingBalanceUsd: number;
  /** True when startingBalance came from real ledger capital, not the floor fallback. */
  startingBalanceConfident: boolean;
  stats: PortfolioStats;
}

// Above this, a "return %" almost certainly means we couldn't size the deposited
// capital (denominator collapsed to the floor) rather than a real 1000x. We refuse
// to headline a number we don't trust on a public card.
const MAX_TRUSTWORTHY_RETURN_PCT = 5000;

export interface TradeReviewStat {
  coin: string;
  usd: number;
}

export interface TradeReviewCard {
  address: string;
  handleShort: string;
  period: string;
  tone: TradeReviewTone;
  /** Capital denominator — lets views render sub-stats as % (default) or $ (opt-in). */
  startingBalanceUsd: number;
  /** When false, the deposited capital is unknown — hero falls back to win rate, not a bogus %. */
  returnConfident: boolean;
  /** Pre-resolved hero figure: return % when trusted, else win rate. */
  heroValue: string;
  heroLabel: string;
  netReturnPct: number;
  netPnlUsd: number;
  winRatePct: number;
  totalTrades: number;
  profitFactor: number;
  maxDrawdownPct: number;
  biggestWin: TradeReviewStat | null;
  biggestLoss: TradeReviewStat | null;
  /** Net funding over the window — negative means the trader paid funding. */
  fundingUsd: number;
  feesUsd: number;
  /** One adaptive line: a flex when up, a witty roast when down. */
  verdict: string;
}

function shortAddress(address: string): string {
  const a = String(address ?? "");
  if (a.length <= 11) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * Pick the single most salient adaptive line. Winners get a flex keyed to *why*
 * they won; losers get a roast keyed to *how* they lost. Deterministic so the
 * same wallet always renders the same card.
 */
function buildVerdict(card: Omit<TradeReviewCard, "verdict">): string {
  const {
    tone,
    profitFactor,
    winRatePct,
    totalTrades,
    maxDrawdownPct,
    netPnlUsd,
    fundingUsd,
    feesUsd,
    biggestWin,
  } = card;

  if (tone === "flat") return "Flat. The house always wins the spread.";

  if (tone === "win") {
    // Most salient flex first.
    if (biggestWin && netPnlUsd > 0 && biggestWin.usd >= netPnlUsd * 0.8) {
      return "One good call carried the whole book.";
    }
    if (profitFactor >= 2.5 && winRatePct >= 55) return "Disciplined sniper.";
    if (winRatePct >= 65) return "Death by a thousand wins.";
    if (maxDrawdownPct <= 8) return "Smooth operator — barely a scratch.";
    if (profitFactor >= 1.8) return "Cutting losers, riding winners.";
    return "Up and to the right.";
  }

  // Loss tone — roast, keyed to the failure mode.
  const fundingBled = fundingUsd < 0 && Math.abs(fundingUsd) >= Math.abs(netPnlUsd) * 0.5 && Math.abs(fundingUsd) > 50;
  if (fundingBled) return "Funding ate you alive.";
  if (feesUsd >= Math.abs(netPnlUsd) * 0.5 && feesUsd > 50) return "The exchange thanks you for the fees.";
  if (totalTrades >= 100 && winRatePct < 45) return "Overtrading into oblivion.";
  if (maxDrawdownPct >= 40) return "Held it all the way down.";
  if (winRatePct < 35) return "Revenge trading is not a strategy.";
  return "Rough patch. Touch grass, then reset.";
}

export function buildTradeReviewCard(input: TradeReviewInput): TradeReviewCard {
  const { address, period, startingBalanceUsd, startingBalanceConfident, stats } = input;

  // Net P&L after fees + funding (same identity the StatsGrid "Trading P&L" uses).
  const netPnlUsd = stats.totalPnl + stats.totalFundingNet - stats.totalFeesPaid;
  const netReturnPct =
    startingBalanceUsd > 0 && Number.isFinite(startingBalanceUsd)
      ? (netPnlUsd / startingBalanceUsd) * 100
      : 0;
  const returnConfident =
    startingBalanceConfident &&
    Number.isFinite(netReturnPct) &&
    Math.abs(netReturnPct) <= MAX_TRUSTWORTHY_RETURN_PCT;

  const tone: TradeReviewTone = netPnlUsd > 0 ? "win" : netPnlUsd < 0 ? "loss" : "flat";

  const biggestWin =
    stats.bestTrade && stats.bestTrade.netPnl > 0
      ? { coin: stats.bestTrade.coin, usd: stats.bestTrade.netPnl }
      : null;
  const biggestLoss =
    stats.worstTrade && stats.worstTrade.netPnl < 0
      ? { coin: stats.worstTrade.coin, usd: stats.worstTrade.netPnl }
      : null;

  const base: Omit<TradeReviewCard, "verdict"> = {
    address,
    handleShort: shortAddress(address),
    period,
    tone,
    startingBalanceUsd,
    returnConfident,
    heroValue: returnConfident ? formatSignedPct(netReturnPct) : `${(stats.winRate * 100).toFixed(0)}%`,
    heroLabel: returnConfident ? "net return · after fees & funding" : "win rate",
    netReturnPct,
    netPnlUsd,
    winRatePct: stats.winRate * 100,
    totalTrades: stats.totalTrades,
    profitFactor: Number.isFinite(stats.profitFactor) ? stats.profitFactor : 0,
    maxDrawdownPct: stats.maxDrawdown * 100,
    biggestWin,
    biggestLoss,
    fundingUsd: stats.totalFundingNet,
    feesUsd: stats.totalFeesPaid,
  };

  return { ...base, verdict: buildVerdict(base) };
}

/** Format a percent with a leading sign, e.g. "+34.2%". */
export function formatSignedPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/** Compact USD with sign, e.g. "+$4.1k", "−$1.2k". Used only when the owner opts into $. */
export function formatCardUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}
