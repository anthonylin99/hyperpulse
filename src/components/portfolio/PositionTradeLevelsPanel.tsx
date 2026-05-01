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
  status: "loading" | "ready" | "empty" | "error";
};

const LOOKBACK_MS = 5 * 24 * 60 * 60 * 1000;

function normalizeMarketType(position: Position): "perp" | "spot" {
  return position.marketType === "hip3_spot" ? "spot" : "perp";
}

function formatLevel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value >= 100) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
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

function planForPosition(position: Position, state: LevelState) {
  const isSpot = position.marketType === "hip3_spot";
  const isLong = isSpot || position.szi > 0;
  const support = state.support;
  const resistance = state.resistance;

  if (state.status === "loading") {
    return {
      buy: "Scanning",
      sell: "Scanning",
      invalidation: "Scanning",
      buyTone: "neutral" as const,
      sellTone: "neutral" as const,
    };
  }

  if (state.status !== "ready") {
    return {
      buy: "No clean buy",
      sell: "No clean sell",
      invalidation: "Use liq/risk",
      buyTone: "neutral" as const,
      sellTone: "neutral" as const,
    };
  }

  if (isSpot) {
    return {
      buy: support ? `Buy near ${formatLevel(support.price)}` : resistance ? `Buy > ${formatLevel(resistance.price)}` : "Wait",
      sell: resistance ? `Sell near ${formatLevel(resistance.price)}` : support ? `Cut < ${formatLevel(support.price)}` : "Wait",
      invalidation: support ? `Below ${formatLevel(support.zoneLow ?? support.price)}` : "n/a",
      buyTone: "green" as const,
      sellTone: "red" as const,
    };
  }

  if (isLong) {
    return {
      buy: support ? `Add near ${formatLevel(support.price)}` : resistance ? `Long > ${formatLevel(resistance.price)}` : "Wait",
      sell: resistance ? `Trim near ${formatLevel(resistance.price)}` : support ? `Cut < ${formatLevel(support.price)}` : "Wait",
      invalidation: support ? `Below ${formatLevel(support.zoneLow ?? support.price)}` : "Use stop/liq",
      buyTone: "green" as const,
      sellTone: "red" as const,
    };
  }

  return {
    buy: support ? `Cover near ${formatLevel(support.price)}` : resistance ? `Cover > ${formatLevel(resistance.price)}` : "Wait",
    sell: resistance ? `Add short near ${formatLevel(resistance.price)}` : support ? `Short < ${formatLevel(support.price)}` : "Wait",
    invalidation: resistance ? `Above ${formatLevel(resistance.zoneHigh ?? resistance.price)}` : "Use stop/liq",
    buyTone: "green" as const,
    sellTone: "red" as const,
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
          next[position.coin] = prev[position.coin] ?? { support: null, resistance: null, status: "loading" };
        }
        return next;
      });

      for (const position of positions) {
        try {
          const now = Date.now();
          const response = await fetch(
            withNetworkParam(
              `/api/market/candles?coin=${encodeURIComponent(position.coin)}&marketType=${normalizeMarketType(position)}&interval=15m&startTime=${now - LOOKBACK_MS}&endTime=${now}`,
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
          const nextState: LevelState = {
            support: nearestLevel(levels, "support", markPx),
            resistance: nearestLevel(levels, "resistance", markPx),
            status: levels.length > 0 ? "ready" : "empty",
          };
          if (!cancelled) {
            setLevelsByCoin((prev) => ({ ...prev, [position.coin]: nextState }));
          }
        } catch {
          if (!cancelled) {
            setLevelsByCoin((prev) => ({
              ...prev,
              [position.coin]: { support: null, resistance: null, status: "error" },
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
          const state = levelsByCoin[position.coin] ?? { support: null, resistance: null, status: "loading" as const };
          const plan = planForPosition(position, state);
          const supportDistance = levelDistance(state.support, position.markPx);
          const resistanceDistance = levelDistance(state.resistance, position.markPx);
          const side = position.marketType === "hip3_spot" ? "Spot" : position.szi > 0 ? "Long" : "Short";

          return (
            <div key={`${position.marketType ?? "perp"}-${position.dex ?? "main"}-${position.coin}-${side}`} className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-3">
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
                <PlanPill label="Buy" value={plan.buy} tone={plan.buyTone} />
                <PlanPill label="Sell" value={plan.sell} tone={plan.sellTone} />
                <PlanPill label="Invalid" value={plan.invalidation} tone="neutral" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-600">
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
