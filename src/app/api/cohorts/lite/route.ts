import { NextRequest } from "next/server";
import { isWhalesEnabled } from "@/lib/appConfig";
import { enforceRateLimit, jsonError, jsonSuccess } from "@/lib/security";
import { listTrackedWhaleProfiles } from "@/lib/whaleStore";
import type { CohortsLiteBucket, WhaleWalletProfile } from "@/types";

export const dynamic = "force-dynamic";

type CohortDefinition = {
  id: string;
  label: string;
  description: string;
  predicate: (profile: WhaleWalletProfile) => boolean;
};

const DEFINITIONS: CohortDefinition[] = [
  {
    id: "smart_wallets",
    label: "Smart wallets",
    description: "Tracked wallets with at least +$200K realized P&L in the sampled 30d window.",
    predicate: (profile) => profile.realizedPnl30d >= 200_000,
  },
  {
    id: "whales",
    label: "Whales",
    description: "Tracked wallets with at least $500K account equity or live open notional.",
    predicate: (profile) => Math.max(profile.accountEquity, profile.totalOpenNotionalUsd) >= 500_000,
  },
  {
    id: "stressed",
    label: "Stressed books",
    description: "Tracked wallets with large negative realized or unrealized P&L.",
    predicate: (profile) => profile.realizedPnl30d <= -100_000 || profile.unrealizedPnl <= -500_000,
  },
  {
    id: "high_leverage",
    label: "High leverage",
    description: "Tracked wallets currently running at least 10x average live leverage.",
    predicate: (profile) => profile.averageLeverage >= 10,
  },
  {
    id: "deposit_led",
    label: "Deposit-led",
    description: "Tracked wallets with meaningful 24h inflows or deposit-led behavior tags.",
    predicate: (profile) => profile.netFlow24hUsd >= 250_000 || profile.behaviorTags.includes("Deposit-led"),
  },
];

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function buildBucket(definition: CohortDefinition, profiles: WhaleWalletProfile[]): CohortsLiteBucket {
  const members = profiles.filter(definition.predicate);
  const netLongUsd = members.reduce(
    (sum, profile) => sum + profile.positions.filter((position) => position.side === "long").reduce((inner, position) => inner + position.notionalUsd, 0),
    0,
  );
  const netShortUsd = members.reduce(
    (sum, profile) => sum + profile.positions.filter((position) => position.side === "short").reduce((inner, position) => inner + position.notionalUsd, 0),
    0,
  );
  const assetCounts = new Map<string, number>();
  for (const profile of members) {
    for (const asset of profile.dominantAssets) {
      assetCounts.set(asset, (assetCounts.get(asset) ?? 0) + 1);
    }
  }
  const topAsset = Array.from(assetCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const gross = netLongUsd + netShortUsd;
  const ratio = gross > 0 ? (netLongUsd - netShortUsd) / gross : 0;

  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    walletCount: members.length,
    netLongUsd,
    netShortUsd,
    netBias: ratio > 0.15 ? "long" : ratio < -0.15 ? "short" : "balanced",
    topAsset,
    medianTradeSizeUsd: median(members.map((profile) => profile.medianTradeSize30d).filter((value) => value > 0)),
    avgLeverage:
      members.length > 0
        ? members.reduce((sum, profile) => sum + profile.averageLeverage, 0) / members.length
        : 0,
  };
}

export async function GET(req: NextRequest) {
  if (!isWhalesEnabled()) {
    return jsonError("Not found.", { status: 404 });
  }
  const limited = enforceRateLimit(req, {
    key: "api-cohorts-lite",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const profiles = await listTrackedWhaleProfiles(750);
  const cohorts = DEFINITIONS.map((definition) => buildBucket(definition, profiles));
  const updatedAt = profiles.reduce((latest, profile) => Math.max(latest, profile.lastSeenAt ?? 0), 0);

  return jsonSuccess({
    cohorts,
    coverage: {
      label: "Tracked wallets only",
      walletCount: profiles.length,
      caveat: "This is HyperPulse's currently indexed/tracked sample, not full-network Hyperliquid coverage.",
    },
    updatedAt: updatedAt || null,
  });
}
