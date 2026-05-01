"use client";

import { useEffect, useMemo, useState } from "react";
import { Crosshair } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { withNetworkParam } from "@/lib/hyperliquid";
import { calculateSupportResistanceLevels, type LevelCandle } from "@/lib/supportResistance";
import { cn, formatUSD } from "@/lib/format";
import type { Position, SupportResistanceLevel } from "@/types";

type LevelState = {
  support: SupportResistanceLevel | null;
  resistance: SupportResistanceLevel | null;
  atr: number | null;
  lastPrice: number | null;
  status: "loading" | "ready" | "empty" | "error";
};

const LOOKBACK_MS = 5 * 24 * 60 * 60 * 1000;
const MIN_TARGET_DISTANCE_PCT = 0.9;
const MAX_ENTRY_DISTANCE_PCT = 4.5;
const MIN_RISK_REWARD = 1.35;

function normalizeMarketType(position: Position): "perp" | "spot" {
  return position.marketType === "hip3_spot" ? "spot" : "perp";
}

function candleCoinForPosition(position: Position): string {
  if (position.marketType === "hip3_perp" && position.dex) {
    return `${position.dex}:${position.coin}`;
  }
  return position.coin;
}

function positionLevelKey(position: Position): string {
  const market = position.marketType ?? "perp";
  const dex = position.dex ?? "main";
  const side = position.marketType === "hip3_spot" ? "spot" : position.szi >= 0 ? "long" : "short";
  return `${market}:${dex}:${position.coin}:${side}`;
}

function formatLevel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value >= 100) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (value >= 0.01) return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function nearestLevel(
  levels: SupportResistanceLevel[],
  kind: "support" | "resistance",
  markPx: number,
): SupportResistanceLevel | null {
  return (
    levels
      .filter((level) => {
        if (level.kind !== kind || level.status === "expired" || level.status === "broken") return false;
        return kind === "support" ? level.price < markPx : level.price > markPx;
      })
      .sort((a, b) => Math.abs(a.price - markPx) - Math.abs(b.price - markPx))[0] ?? null
  );
}

function levelDistance(level: SupportResistanceLevel | null, markPx: number): string {
  if (!level || markPx <= 0) return "";
  const distance = Math.abs(((level.price - markPx) / markPx) * 100);
  return `${distance.toFixed(1)}% away`;
}

function averageTrueRange(candles: LevelCandle[], length = 14): number | null {
  const scoped = candles.slice(-length);
  if (scoped.length < 2) return null;

  const atr =
    scoped.reduce((sum, candle, index) => {
      const previousClose = index === 0 ? candle.close : scoped[index - 1].close;
      const trueRange = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose),
      );
      return sum + Math.max(trueRange, 0);
    }, 0) / scoped.length;

  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

function pctDistance(from: number, to: number): number {
  if (from <= 0 || !Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.abs(((to - from) / from) * 100);
}

function minTargetDistancePct(state: LevelState, markPx: number): number {
  const atrPct = state.atr && markPx > 0 ? (state.atr / markPx) * 100 : 0;
  return Math.max(MIN_TARGET_DISTANCE_PCT, atrPct * 1.4);
}

function riskBuffer(position: Position, state: LevelState): number {
  const atrBuffer = (state.atr ?? 0) * 0.9;
  const pctBuffer = position.markPx * (position.marketType === "hip3_spot" ? 0.01 : 0.006);
  return Math.max(atrBuffer, pctBuffer);
}

function isTradableRange(args: {
  entry: number;
  target: number | null;
  stop: number | null;
  direction: "long" | "short";
  minTargetPct: number;
}): boolean {
  const { entry, target, stop, direction, minTargetPct } = args;
  if (target == null || stop == null || entry <= 0) return false;

  const reward = direction === "long" ? target - entry : entry - target;
  const risk = direction === "long" ? entry - stop : stop - entry;
  if (reward <= 0 || risk <= 0) return false;

  const rewardPct = (reward / entry) * 100;
  if (rewardPct < minTargetPct) return false;
  return reward / risk >= MIN_RISK_REWARD;
}

function planForPosition(position: Position, state: LevelState) {
  const isSpot = position.marketType === "hip3_spot";
  const isLong = isSpot || position.szi > 0;
  const support = state.support;
  const resistance = state.resistance;
  const minTargetPct = minTargetDistancePct(state, position.markPx);
  const supportDistancePct = support ? pctDistance(position.markPx, support.price) : null;
  const resistanceDistancePct = resistance ? pctDistance(position.markPx, resistance.price) : null;
  const supportStop = support ? support.price - riskBuffer(position, state) : null;
  const resistanceStop = resistance ? resistance.price + riskBuffer(position, state) : null;
  const targetIsTooClose =
    resistanceDistancePct != null && resistanceDistancePct < minTargetPct;
  const coverIsTooClose =
    supportDistancePct != null && supportDistancePct < minTargetPct;

  if (state.status === "loading") {
    return {
      buy: "Scanning",
      sell: "Scanning",
      invalidation: "Scanning",
      note: "Loading closed-candle structure.",
      buyTone: "neutral" as const,
      sellTone: "neutral" as const,
    };
  }

  if (state.status !== "ready") {
    return {
      buy: "No clean buy",
      sell: "No clean sell",
      invalidation: "Use liq/risk",
      note: "No reliable levels for this asset yet.",
      buyTone: "neutral" as const,
      sellTone: "neutral" as const,
    };
  }

  if (isSpot) {
    const canBuy =
      support != null &&
      supportDistancePct != null &&
      supportDistancePct <= MAX_ENTRY_DISTANCE_PCT &&
      isTradableRange({
        entry: support.price,
        target: resistance?.price ?? null,
        stop: supportStop,
        direction: "long",
        minTargetPct,
      });

    return {
      buy: canBuy ? `Buy zone ${formatLevel(support.price)}` : support ? `Wait for ${formatLevel(support.price)}` : "No buy zone",
      sell: targetIsTooClose ? "Target too close" : resistance ? `Target ${formatLevel(resistance.price)}` : "No target",
      invalidation: supportStop ? `Below ${formatLevel(supportStop)}` : "n/a",
      note: canBuy
        ? "Dip-buy only if price actually trades into the zone."
        : "No clean spot setup from these levels right now.",
      buyTone: canBuy ? ("green" as const) : ("neutral" as const),
      sellTone: targetIsTooClose || !resistance ? ("neutral" as const) : ("red" as const),
    };
  }

  if (isLong) {
    const canAdd =
      support != null &&
      supportDistancePct != null &&
      supportDistancePct <= MAX_ENTRY_DISTANCE_PCT &&
      isTradableRange({
        entry: support.price,
        target: resistance?.price ?? null,
        stop: supportStop,
        direction: "long",
        minTargetPct,
      });

    return {
      buy: canAdd ? `Add zone ${formatLevel(support.price)}` : support ? `No add yet` : "No buy zone",
      sell: targetIsTooClose ? "Target too close" : resistance ? `Trim ${formatLevel(resistance.price)}` : "No target",
      invalidation: supportStop ? `Below ${formatLevel(supportStop)}` : "Use stop/liq",
      note: canAdd
        ? "Only add into the zone; do not chase current price."
        : "Range is too tight or R/R is not clean enough to add.",
      buyTone: canAdd ? ("green" as const) : ("neutral" as const),
      sellTone: targetIsTooClose || !resistance ? ("neutral" as const) : ("red" as const),
    };
  }

  const canAddShort =
    resistance != null &&
    resistanceDistancePct != null &&
    resistanceDistancePct <= MAX_ENTRY_DISTANCE_PCT &&
    isTradableRange({
      entry: resistance.price,
      target: support?.price ?? null,
      stop: resistanceStop,
      direction: "short",
      minTargetPct,
    });

  return {
    buy: coverIsTooClose ? "Cover too close" : support ? `Cover ${formatLevel(support.price)}` : "No cover target",
    sell: canAddShort ? `Short zone ${formatLevel(resistance.price)}` : resistance ? "No short add" : "No short zone",
    invalidation: resistanceStop ? `Above ${formatLevel(resistanceStop)}` : "Use stop/liq",
    note: canAddShort
      ? "Only add short into resistance; do not chase weakness."
      : "Range is too tight or R/R is not clean enough to add.",
    buyTone: coverIsTooClose || !support ? ("neutral" as const) : ("green" as const),
    sellTone: canAddShort ? ("red" as const) : ("neutral" as const),
  };
}

function PlanPill({ label, value, tone }: { label: string; value: string; tone: "green" | "red" | "neutral" }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-xs",
          tone === "green" && "text-emerald-300",
          tone === "red" && "text-rose-300",
          tone === "neutral" && "text-zinc-300",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default function PositionTradeLevelsPanel() {
  const { accountState } = useWallet();
  const positions = useMemo(
    () => [...(accountState?.positions ?? []), ...(accountState?.spotPositions ?? [])].slice(0, 8),
    [accountState?.positions, accountState?.spotPositions],
  );
  const [levelsByCoin, setLevelsByCoin] = useState<Record<string, LevelState>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadLevels() {
      if (positions.length === 0) {
        setLevelsByCoin({});
        return;
      }

      setLevelsByCoin((prev) => {
        const next: Record<string, LevelState> = {};
        for (const position of positions) {
          const key = positionLevelKey(position);
          next[key] = prev[key] ?? {
            support: null,
            resistance: null,
            atr: null,
            lastPrice: null,
            status: "loading",
          };
        }
        return next;
      });

      for (const position of positions) {
        try {
          const now = Date.now();
          const response = await fetch(
            withNetworkParam(
              `/api/market/candles?coin=${encodeURIComponent(candleCoinForPosition(position))}&marketType=${normalizeMarketType(position)}&interval=15m&startTime=${now - LOOKBACK_MS}&endTime=${now}`,
            ),
          );
          if (!response.ok) throw new Error("Unable to load candles");
          const rawCandles = (await response.json()) as Array<Record<string, string | number>>;
          const candles: LevelCandle[] = rawCandles
            .map((candle) => ({
              time: Number(candle.t ?? candle.T ?? candle.time),
              open: Number(candle.o ?? candle.open),
              high: Number(candle.h ?? candle.high),
              low: Number(candle.l ?? candle.low),
              close: Number(candle.c ?? candle.close),
              volume: Number(candle.v ?? candle.vlm ?? 0),
            }))
            .filter((candle) => Number.isFinite(candle.close) && candle.close > 0);
          const levels = calculateSupportResistanceLevels(candles, "15m");
          const markPx = candles.at(-1)?.close ?? position.markPx;
          const key = positionLevelKey(position);
          const nextState: LevelState = {
            support: nearestLevel(levels, "support", markPx),
            resistance: nearestLevel(levels, "resistance", markPx),
            atr: averageTrueRange(candles),
            lastPrice: markPx,
            status: levels.length > 0 ? "ready" : "empty",
          };
          if (!cancelled) {
            setLevelsByCoin((prev) => ({ ...prev, [key]: nextState }));
          }
        } catch {
          if (!cancelled) {
            const key = positionLevelKey(position);
            setLevelsByCoin((prev) => ({
              ...prev,
              [key]: { support: null, resistance: null, atr: null, lastPrice: null, status: "error" },
            }));
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
    }

    loadLevels();
    return () => {
      cancelled = true;
    };
  }, [positions]);

  if (positions.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-800 bg-zinc-950/85">
      <div className="border-b border-zinc-800 px-5 py-4">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-emerald-300" />
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400/75">Buy / Sell Levels</div>
        </div>
        <div className="mt-2 text-sm text-zinc-500">
          Closed-candle support and resistance mapped onto your live holdings. Treat these as review levels, not auto-trade instructions.
        </div>
      </div>
      <div className="grid gap-3 p-4 xl:grid-cols-2">
        {positions.map((position) => {
          const key = positionLevelKey(position);
          const state = levelsByCoin[key] ?? {
            support: null,
            resistance: null,
            atr: null,
            lastPrice: null,
            status: "loading" as const,
          };
          const plan = planForPosition(position, state);
          const supportDistance = levelDistance(state.support, position.markPx);
          const resistanceDistance = levelDistance(state.resistance, position.markPx);
          const side = position.marketType === "hip3_spot" ? "Spot" : position.szi > 0 ? "Long" : "Short";

          return (
            <div key={key} className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{position.coin}</span>
                    <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-400">{side}</span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-zinc-500">Mark {formatUSD(position.markPx, position.markPx < 1 ? 5 : 2)}</div>
                </div>
                <div className="text-right font-mono text-xs text-zinc-500">
                  <div>S {state.support ? formatLevel(state.support.price) : "n/a"}</div>
                  <div>R {state.resistance ? formatLevel(state.resistance.price) : "n/a"}</div>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <PlanPill label={side === "Short" ? "Cover" : "Add"} value={plan.buy} tone={plan.buyTone} />
                <PlanPill label={side === "Short" ? "Short" : "Target"} value={plan.sell} tone={plan.sellTone} />
                <PlanPill label="Risk" value={plan.invalidation} tone="neutral" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-600">
                <span>{plan.note}</span>
                {supportDistance ? <span>Support {supportDistance}</span> : null}
                {resistanceDistance ? <span>Resistance {resistanceDistance}</span> : null}
                {state.status === "loading" ? <span>Scanning levels...</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
