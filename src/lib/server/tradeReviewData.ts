import { getInfoClient } from "@/lib/hyperliquid";
import {
  groupFillsIntoTrades,
  mergeFundingIntoTrades,
  computePortfolioStats,
} from "@/lib/analytics";
import { summarizeCapitalFlows } from "@/lib/capitalFlows";
import { buildTradeReviewCard, type TradeReviewCard } from "@/lib/tradeReviewCard";
import type { Fill, FundingEntry } from "@/types";

// Server-side loader for the shareable trade review card. Mirrors the client
// PortfolioContext pipeline (fetch → normalize → analytics) so the public card
// shows the exact same net-accurate numbers the dashboard does. No DB, no auth.

function normalizeFills(raw: unknown): Fill[] {
  return (Array.isArray(raw) ? raw : []).map((value) => {
    const f = value as Record<string, unknown>;
    return {
      coin: String(f.coin ?? ""),
      side: String(f.side ?? "A") as Fill["side"],
      dir: String(f.dir ?? "") as Fill["dir"],
      px: parseFloat(String(f.px ?? "0")),
      sz: parseFloat(String(f.sz ?? "0")),
      time: Number(f.time ?? 0),
      fee: parseFloat(String(f.fee ?? "0")),
      feeToken: String(f.feeToken ?? "USDC"),
      closedPnl: parseFloat(String(f.closedPnl ?? "0")),
      crossed: Boolean(f.crossed),
      hash: String(f.hash ?? ""),
      liquidation: Boolean(f.liquidation),
      oid: Number(f.oid ?? 0),
      cloid: f.cloid ? String(f.cloid) : null,
    };
  });
}

function normalizeFunding(raw: unknown): FundingEntry[] {
  return (Array.isArray(raw) ? raw : []).map((value) => {
    const f = value as Record<string, unknown>;
    const delta = f.delta && typeof f.delta === "object" ? (f.delta as Record<string, unknown>) : f;
    return {
      time: Number(f.time ?? delta.time ?? 0),
      coin: String(delta.coin ?? ""),
      usdc: parseFloat(String(delta.usdc ?? "0")),
      positionSize: parseFloat(String(delta.szi ?? "0")),
      fundingRate: parseFloat(String(delta.fundingRate ?? "0")),
      nSamples: Number(delta.nSamples ?? 0),
    };
  });
}

async function fetchAllTimeFills(info: ReturnType<typeof getInfoClient>, user: `0x${string}`): Promise<unknown> {
  const byTime = await info.userFillsByTime({ user, startTime: 0, aggregateByTime: true });
  if (Array.isArray(byTime) && byTime.length > 0) return byTime;
  // Fallback for wallets where the time query returns empty.
  return info.userFills({ user, aggregateByTime: true });
}

export interface TradeReviewLoadResult {
  card: TradeReviewCard | null;
  /** false = valid address but no closed perp trades to review. */
  hasTrades: boolean;
}

export async function loadTradeReviewCard(address: string): Promise<TradeReviewLoadResult> {
  const user = address as `0x${string}`;
  const info = getInfoClient();

  const [rawFills, rawFunding, rawLedger, state] = await Promise.all([
    fetchAllTimeFills(info, user),
    info.userFunding({ user, startTime: 0 }).catch(() => []),
    info.userNonFundingLedgerUpdates({ user, startTime: 0 }).catch(() => []),
    info.clearinghouseState({ user }).catch(() => null),
  ]);

  const fills = normalizeFills(rawFills);
  const funding = normalizeFunding(rawFunding);
  const trades = mergeFundingIntoTrades(groupFillsIntoTrades(fills), funding);

  if (trades.length === 0) {
    return { card: null, hasTrades: false };
  }

  const stats = computePortfolioStats(trades, funding, 1000);
  const capital = summarizeCapitalFlows(rawLedger, address);

  const accountValue = state ? parseFloat(String(state.marginSummary?.accountValue ?? "0")) : 0;
  const realizedNet = trades.reduce((sum, t) => sum + t.netPnl, 0);
  // Trust the denominator only when it comes from real ledger capital. The
  // accountValue−realizedNet fallback can collapse to the floor and produce a
  // meaningless return %, so we flag it as low-confidence for the card.
  const startingBalanceConfident = Math.abs(capital.netExternalCapitalUsd) > 1;
  const startingBalanceUsd = startingBalanceConfident
    ? Math.max(Math.abs(capital.netExternalCapitalUsd), 100)
    : Math.max(accountValue - realizedNet, 100);

  const card = buildTradeReviewCard({
    address,
    period: "all time",
    startingBalanceUsd,
    startingBalanceConfident,
    stats,
  });

  return { card, hasTrades: true };
}
