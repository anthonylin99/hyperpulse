// Composes the signal families into one ranked "what to trade right now"
// answer. Pure logic — the /api/ideas route feeds it live daily-setup
// candidates and crowding alerts. The contract with the reader: at most
// three ideas, ranked by conviction, each with a trigger, an invalidation,
// and a plain-English "wrong if" — or an explicit stand-aside. Never a
// wall of context without a decision.

import type { DailySetup } from "./dailySetup";
import type { PositioningStressAlert } from "./crowding";
import type { TrackRecordCell } from "./crowdingHistory";

export type TradeIdeaSide = "long" | "short";
export type TradeIdeaConviction = "A" | "B" | "C";
export type TradeIdeaSource = "crowding" | "funding_setup" | "combined";

export type TradeIdea = {
  id: string;
  coin: string;
  displayName: string;
  side: TradeIdeaSide;
  conviction: TradeIdeaConviction;
  headline: string;
  thesis: string;
  action: string;
  wrongIf: string;
  trigger: number | null;
  invalidation: number | null;
  target: number | null;
  horizonHours: number;
  markPx: number;
  fundingApr: number;
  priceChange24h: number;
  evidence: string[];
  source: TradeIdeaSource;
  trackRecordNote: string | null;
  score: number;
};

export type TradeIdeasPayload = {
  generatedAt: number;
  ideas: TradeIdea[];
  standAside: boolean;
  marketNote: string;
  methodology: string;
};

const MAX_IDEAS = 3;
const CONVICTION_RANK: Record<TradeIdeaConviction, number> = { A: 3, B: 2, C: 1 };

function formatUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 1 ? 2 : 4;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function trackRecordNoteFrom(cell: TrackRecordCell | null): string | null {
  if (!cell) return null;
  return `Backtest: fading alerts like this averaged +${cell.meanNetPct.toFixed(1)}% net in 24h (${cell.n} events, ${cell.positiveMonths}/${cell.totalMonths} months positive). Not live results.`;
}

function ideaFromCrowdingAlert(
  alert: PositioningStressAlert,
  trackRecordCell: TrackRecordCell | null,
): TradeIdea | null {
  // HIP-3 builder markets are view-only in the app, thin, and outside the
  // backtest basket — the track-record claim does not transfer to them.
  if (alert.asset.includes(":")) return null;
  if (alert.severity !== "high" && alert.severity !== "extreme") return null;
  if (alert.side !== "longs_crowded" && alert.side !== "shorts_crowded") return null;
  const side: TradeIdeaSide = alert.side === "longs_crowded" ? "short" : "long";
  const actionable = alert.status === "actionable_watch";
  const trigger = alert.triggerLevel;
  const invalidation = alert.invalidationLevel;
  const risk = trigger != null && invalidation != null ? Math.abs(invalidation - trigger) : null;
  const target =
    trigger != null && risk != null ? (side === "short" ? trigger - risk * 1.5 : trigger + risk * 1.5) : null;
  const crowdedSide = side === "short" ? "longs" : "shorts";
  return {
    id: `crowding-${alert.asset.toLowerCase()}-${side}`,
    coin: alert.asset,
    displayName: alert.displayName,
    side,
    conviction: actionable ? "A" : "B",
    headline: side === "short" ? `Fade crowded ${alert.displayName} longs` : `Ride the ${alert.displayName} short squeeze`,
    thesis: `${crowdedSide === "longs" ? "Longs" : "Shorts"} are paying ${alert.fundingApr >= 0 ? "+" : ""}${alert.fundingApr.toFixed(0)}% APR to hold and price is ${actionable ? "already turning against them" : "not confirming yet"} — stressed positioning like this usually unwinds over 1–3 days.`,
    action:
      trigger != null
        ? `${side === "short" ? "Short" : "Long"} on a ${side === "short" ? "break below" : "reclaim of"} ${formatUsd(trigger)}. Exit at ${formatUsd(invalidation)} if wrong. Review after 24h, done by 72h.`
        : "Wait for a clean trigger. No trigger, no trade.",
    wrongIf: `Price ${side === "short" ? "holds above" : "stays below"} ${formatUsd(invalidation)} — the crowd was right, stand down and do not average.`,
    trigger,
    invalidation,
    target,
    horizonHours: 72,
    markPx: alert.markPx,
    fundingApr: alert.fundingApr,
    priceChange24h: alert.priceChange24h,
    evidence: alert.evidence.slice(0, 3),
    source: "crowding",
    trackRecordNote: actionable ? trackRecordNoteFrom(trackRecordCell) : null,
    score: alert.score,
  };
}

function ideaFromDailySetup(setup: DailySetup): TradeIdea | null {
  if (setup.status !== "watch" || (setup.side !== "long" && setup.side !== "short")) return null;
  const side = setup.side;
  return {
    id: `setup-${setup.coin.toLowerCase()}-${side}`,
    coin: setup.coin,
    displayName: setup.coin,
    side,
    conviction: setup.score >= 8 ? "B" : "C",
    headline: setup.title,
    thesis: setup.rationale[0] ?? "Funding is stretched against this side.",
    action:
      setup.trigger != null
        ? `${side === "short" ? "Short" : "Long"} on a ${side === "short" ? "break below" : "reclaim of"} ${formatUsd(setup.trigger)}. Exit at ${formatUsd(setup.invalidation)} if wrong${setup.target != null ? `, take profit near ${formatUsd(setup.target)}` : ""}. Max hold ${setup.maxHoldHours}h.`
        : "Wait for a clean trigger. No trigger, no trade.",
    wrongIf: setup.guardrails[0] ?? "Price reclaims the invalidation level.",
    trigger: setup.trigger,
    invalidation: setup.invalidation,
    target: setup.target,
    horizonHours: setup.maxHoldHours,
    markPx: setup.markPx,
    fundingApr: setup.fundingApr,
    priceChange24h: setup.priceChange24h,
    evidence: setup.rationale.slice(0, 3),
    source: "funding_setup",
    trackRecordNote: null,
    score: setup.score,
  };
}

function mergeIdeas(crowding: TradeIdea, setup: TradeIdea): TradeIdea {
  // Same coin flagged by both families: the funding setup carries the
  // sharper levels (it has a target and 24h-range anchoring); crowding
  // upgrades the conviction and contributes its evidence.
  return {
    ...setup,
    id: `combined-${setup.coin.toLowerCase()}-${setup.side}`,
    conviction: "A",
    source: "combined",
    thesis: crowding.thesis,
    evidence: [...crowding.evidence.slice(0, 2), ...setup.evidence.slice(0, 2)],
    trackRecordNote: crowding.trackRecordNote ?? setup.trackRecordNote,
    score: Math.max(setup.score, crowding.score / 10) + 2,
  };
}

export function composeTradeIdeas(args: {
  setups: DailySetup[];
  crowdingAlerts: PositioningStressAlert[];
  trackRecordCell: TrackRecordCell | null;
  now?: number;
}): TradeIdeasPayload {
  const now = args.now ?? Date.now();
  const crowdingIdeas = args.crowdingAlerts
    .map((alert) => ideaFromCrowdingAlert(alert, args.trackRecordCell))
    .filter((idea): idea is TradeIdea => idea != null);
  const setupIdeas = args.setups
    .map(ideaFromDailySetup)
    .filter((idea): idea is TradeIdea => idea != null);

  const byCoin = new Map<string, TradeIdea>();
  for (const idea of setupIdeas) {
    const existing = byCoin.get(idea.coin);
    if (!existing || idea.score > existing.score) byCoin.set(idea.coin, idea);
  }
  const merged: TradeIdea[] = [];
  for (const idea of crowdingIdeas) {
    const setupMatch = byCoin.get(idea.coin);
    if (setupMatch && setupMatch.side === idea.side) {
      merged.push(mergeIdeas(idea, setupMatch));
      byCoin.delete(idea.coin);
    } else {
      merged.push(idea);
      // Conflicting sides on the same coin: crowding (severity-gated and
      // backtested) wins; drop the setup rather than show a contradiction.
      if (setupMatch) byCoin.delete(idea.coin);
    }
  }
  merged.push(...byCoin.values());

  const ideas = merged
    .sort((a, b) => {
      const rankDelta = CONVICTION_RANK[b.conviction] - CONVICTION_RANK[a.conviction];
      if (rankDelta !== 0) return rankDelta;
      return b.score - a.score;
    })
    .slice(0, MAX_IDEAS);

  const aCount = ideas.filter((idea) => idea.conviction === "A").length;
  const standAside = ideas.length === 0;
  const marketNote = standAside
    ? "No liquid market has stressed positioning with price confirmation right now. Standing aside is the trade. Check back in a few hours."
    : aCount > 0
      ? `${aCount === 1 ? "One idea has" : `${aCount} ideas have`} both stressed positioning and price confirmation. Everything below its trigger is a watch, not an entry.`
      : "Setups are forming but nothing is confirmed. These are watches — the trigger decides, not the funding.";

  return {
    generatedAt: now,
    ideas,
    standAside,
    marketNote,
    methodology:
      "Ideas combine the daily funding setup scan and the positioning-stress desk. Conviction A = stressed positioning with price confirmation (the backtested condition). B = one clean signal, unconfirmed. C = early watch. Never more than three. No idea without an invalidation.",
  };
}
