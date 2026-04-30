import type { AccountState, Position, TradeSizingSnapshot } from "@/types";

function normalizeTradeAsset(asset: string): string {
  const normalized = asset.toUpperCase();
  const parts = normalized.split(":");
  return parts.length > 1 ? parts[parts.length - 1] : normalized;
}

export function getTradeableUsdcCapital(accountState: AccountState | null): number {
  if (!accountState) return 0;
  return Math.max(accountState.withdrawable + accountState.totalMarginUsed, 0);
}

export function getPositionSide(position: Position): "long" | "short" {
  return position.szi >= 0 ? "long" : "short";
}

export function positionSizingPct(position: Position, accountState: AccountState | null): number | null {
  if (position.marketType === "hip3_spot") return null;
  const tradeableCapital = getTradeableUsdcCapital(accountState);
  if (tradeableCapital <= 0 || position.marginUsed <= 0) return null;
  return (position.marginUsed / tradeableCapital) * 100;
}

export function positionKey(position: Position): string {
  const market = position.dex ? `${position.marketType ?? "perp"}:${position.dex}` : position.marketType ?? "perp";
  return `${market}:${position.coin}:${getPositionSide(position)}`;
}

export function findSizingForTrade(
  trade: { coin: string; direction: "long" | "short"; entryTime: number; exitTime: number },
  snapshots: TradeSizingSnapshot[],
): TradeSizingSnapshot | null {
  const tradeAsset = normalizeTradeAsset(trade.coin);
  const matches = snapshots
    .filter(
      (snapshot) =>
        normalizeTradeAsset(snapshot.asset) === tradeAsset &&
        snapshot.side === trade.direction &&
        snapshot.capturedAt >= trade.entryTime &&
        snapshot.capturedAt <= trade.exitTime,
    )
    .sort((a, b) => a.capturedAt - b.capturedAt);

  return matches[0] ?? null;
}

export function enrichTradeWithSizing<
  T extends {
    coin: string;
    direction: "long" | "short";
    entryTime: number;
    exitTime: number;
    notional: number;
    fills?: Array<{ dir: string }>;
  },
>(trade: T, snapshots: TradeSizingSnapshot[]): T & {
  capitalUsedUsd: number | null;
  leverageUsed: number | null;
  capitalSource: "captured" | "estimated" | "spot" | "unavailable";
} {
  const sizing = findSizingForTrade(trade, snapshots);
  if (sizing) {
    return {
      ...trade,
      capitalUsedUsd: sizing.marginUsedUsd,
      leverageUsed: sizing.leverage,
      capitalSource: "captured",
    };
  }

  const isSpot = trade.fills?.some((fill) => fill.dir === "Buy" || fill.dir === "Sell") ?? false;
  if (isSpot) {
    return {
      ...trade,
      capitalUsedUsd: trade.notional,
      leverageUsed: 1,
      capitalSource: "spot",
    };
  }

  return {
    ...trade,
    capitalUsedUsd: null,
    leverageUsed: null,
    capitalSource: "unavailable",
  };
}

export function enrichTradesWithSizing<
  T extends {
    coin: string;
    direction: "long" | "short";
    entryTime: number;
    exitTime: number;
    notional: number;
    fills?: Array<{ dir: string }>;
  },
>(trades: T[], snapshots: TradeSizingSnapshot[]) {
  return trades.map((trade) => enrichTradeWithSizing(trade, snapshots));
}
