import type { AccountState, Position, TradeSizingSnapshot } from "@/types";

export const SIZING_TARGET_MIN_PCT = 5;
export const SIZING_TARGET_MAX_PCT = 12;

export function getDeployableCapital(accountState: AccountState | null): number {
  if (!accountState) return 0;
  return Math.max(accountState.withdrawable + accountState.totalMarginUsed, 0);
}

export function getPositionSide(position: Position): "long" | "short" {
  return position.szi >= 0 ? "long" : "short";
}

export function positionSizingPct(position: Position, accountState: AccountState | null): number | null {
  if (position.marketType === "hip3_spot") return null;
  const deployableCapital = getDeployableCapital(accountState);
  if (deployableCapital <= 0 || position.marginUsed <= 0) return null;
  return (position.marginUsed / deployableCapital) * 100;
}

export function sizingTone(sizingPct: number | null): "under" | "target" | "over" | "unknown" {
  if (sizingPct == null || !Number.isFinite(sizingPct)) return "unknown";
  if (sizingPct > SIZING_TARGET_MAX_PCT) return "over";
  if (sizingPct >= SIZING_TARGET_MIN_PCT) return "target";
  return "under";
}

export function positionKey(position: Position): string {
  return `${position.marketType ?? "perp"}:${position.coin}:${getPositionSide(position)}`;
}

export function findSizingForTrade(
  trade: { coin: string; direction: "long" | "short"; entryTime: number; exitTime: number },
  snapshots: TradeSizingSnapshot[],
): TradeSizingSnapshot | null {
  const matches = snapshots
    .filter(
      (snapshot) =>
        snapshot.asset === trade.coin &&
        snapshot.side === trade.direction &&
        snapshot.capturedAt >= trade.entryTime &&
        snapshot.capturedAt <= trade.exitTime,
    )
    .sort((a, b) => a.capturedAt - b.capturedAt);

  return matches[0] ?? null;
}
