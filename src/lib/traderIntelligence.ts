import type {
  TraderCohort,
  TraderProfileTag,
  WalletIntelligenceSummary,
  WhaleBucketExposure,
  WhalePositionSnapshot,
  WhaleWalletBaselineStats,
  WhaleWalletProfile,
} from "@/types";

type ProfileLike = Pick<
  WhaleWalletProfile,
  | "accountEquity"
  | "perpsEquity"
  | "realizedPnl30d"
  | "unrealizedPnl"
  | "averageLeverage"
  | "dominantAssets"
  | "behaviorTags"
  | "styleTags"
  | "focusTags"
> & {
  baseline: WhaleWalletBaselineStats;
  positions: WhalePositionSnapshot[];
  bucketExposures: WhaleBucketExposure[];
};

const SIZE_COHORTS: TraderCohort[] = [
  {
    id: "observer",
    family: "size",
    label: "Observer",
    minUsd: 0,
    maxUsd: 10_000,
    tone: "neutral",
    description: "Small account; useful for color, not market impact.",
  },
  {
    id: "active_trader",
    family: "size",
    label: "Active Trader",
    minUsd: 10_000,
    maxUsd: 100_000,
    tone: "neutral",
    description: "Meaningful trader with enough margin to express directional views.",
  },
  {
    id: "whale",
    family: "size",
    label: "Whale",
    minUsd: 100_000,
    maxUsd: 1_000_000,
    tone: "amber",
    description: "Large enough to matter when positioning is concentrated.",
  },
  {
    id: "leviathan",
    family: "size",
    label: "Leviathan",
    minUsd: 1_000_000,
    maxUsd: null,
    tone: "green",
    description: "Institutional-scale wallet; changes in exposure deserve review.",
  },
];

const PNL_COHORTS: TraderCohort[] = [
  {
    id: "stressed",
    family: "performance",
    label: "Stressed",
    minUsd: null,
    maxUsd: -100_000,
    tone: "red",
    description: "Recently deeply negative; useful as a crowding or stress input.",
  },
  {
    id: "underwater",
    family: "performance",
    label: "Underwater",
    minUsd: -100_000,
    maxUsd: 0,
    tone: "amber",
    description: "Recently negative; treat as context rather than smart-money signal.",
  },
  {
    id: "grinder",
    family: "performance",
    label: "Grinder",
    minUsd: 0,
    maxUsd: 200_000,
    tone: "neutral",
    description: "Positive but not yet a default main-tape wallet.",
  },
  {
    id: "smart_money",
    family: "performance",
    label: "Smart Money",
    minUsd: 200_000,
    maxUsd: 1_000_000,
    tone: "green",
    description: "Strong recent realized P&L; eligible for higher-priority review.",
  },
  {
    id: "money_printer",
    family: "performance",
    label: "Money Printer",
    minUsd: 1_000_000,
    maxUsd: null,
    tone: "green",
    description: "Exceptional recent realized P&L; still verify the current setup.",
  },
];

function selectCohort(value: number, cohorts: TraderCohort[]) {
  return (
    cohorts.find((cohort) => {
      const aboveMin = cohort.minUsd == null || value >= cohort.minUsd;
      const belowMax = cohort.maxUsd == null || value < cohort.maxUsd;
      return aboveMin && belowMax;
    }) ?? cohorts[0]
  );
}

function formatCompact(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function directionBias(bucketExposures: WhaleBucketExposure[]): WalletIntelligenceSummary["directionBias"] {
  const net = bucketExposures.reduce((sum, bucket) => sum + bucket.netNotionalUsd, 0);
  const gross = bucketExposures.reduce((sum, bucket) => sum + bucket.longNotionalUsd + bucket.shortNotionalUsd, 0);
  if (gross <= 0) return "balanced";
  const ratio = net / gross;
  if (ratio >= 0.2) return "long";
  if (ratio <= -0.2) return "short";
  return "balanced";
}

function buildRiskLabel(profile: ProfileLike) {
  const nearestLiq = profile.positions.reduce<number | null>((best, position) => {
    if (position.liquidationDistancePct == null) return best;
    return best == null ? position.liquidationDistancePct : Math.min(best, position.liquidationDistancePct);
  }, null);

  if (nearestLiq != null && nearestLiq < 10) return "Liquidation-sensitive";
  if (profile.averageLeverage >= 10) return "High leverage";
  if (profile.unrealizedPnl <= -500_000) return "Under pressure";
  if (profile.positions.some((position) => position.side === "long") && profile.positions.some((position) => position.side === "short")) {
    return "Two-sided book";
  }
  return "Normal risk";
}

export function getTraderSizeCohort(accountEquity: number): TraderCohort {
  return selectCohort(Math.max(accountEquity, 0), SIZE_COHORTS);
}

export function getTraderPnlCohort(realizedPnl30d: number): TraderCohort {
  return selectCohort(realizedPnl30d, PNL_COHORTS);
}

export function buildWalletIntelligenceSummary(profile: ProfileLike): WalletIntelligenceSummary {
  const sizeCohort = getTraderSizeCohort(Math.max(profile.perpsEquity, profile.accountEquity));
  const pnlCohort = getTraderPnlCohort(profile.realizedPnl30d);
  const bias = directionBias(profile.bucketExposures);
  const qualityLabel =
    profile.realizedPnl30d >= 1_000_000
      ? "Elite recent performer"
      : profile.realizedPnl30d >= 200_000
        ? "Strong recent performer"
        : profile.realizedPnl30d >= 0
          ? "Positive but review-only"
          : "Negative recent P&L";
  const riskLabel = buildRiskLabel(profile);
  const topAssets = profile.dominantAssets.length > 0 ? profile.dominantAssets.slice(0, 4) : profile.baseline.favoriteAssets.slice(0, 4);
  const tags = Array.from(
    new Set<TraderProfileTag>([
      ...(profile.realizedPnl30d >= 200_000 ? (["Smart money"] as TraderProfileTag[]) : []),
      ...(Math.max(profile.accountEquity, profile.perpsEquity) >= 100_000 ? (["Large account"] as TraderProfileTag[]) : []),
      ...(profile.realizedPnl30d < 200_000 ? (["Review-only"] as TraderProfileTag[]) : []),
      ...profile.styleTags,
      ...profile.focusTags,
      ...profile.behaviorTags,
    ]),
  ).slice(0, 8);

  return {
    sizeCohort,
    pnlCohort,
    qualityLabel,
    riskLabel,
    directionBias: bias,
    topAssets,
    tags,
    evidence: [
      `${formatCompact(profile.realizedPnl30d)} realized P&L over the sampled 30d window`,
      `${formatCompact(profile.baseline.volume30d)} sampled trade volume`,
      `${profile.baseline.directionalHitRate30d.toFixed(1)}% closed-trade win rate`,
      `${profile.averageLeverage.toFixed(1)}x average live leverage`,
    ],
  };
}

export const TRADER_SIZE_COHORTS = SIZE_COHORTS;
export const TRADER_PNL_COHORTS = PNL_COHORTS;
