export type SocialTakeStance = "bullish" | "bearish" | "neutral";
export type SocialTakeConfidence = "high" | "medium" | "low";
export type SocialAlignment = "confirms" | "contradicts" | "mixed" | "none";

export type SocialTake = {
  id: string;
  ticker: string;
  title: string;
  analystHandle: string;
  sourceUrl: string;
  publishedAt: string;
  summary: string;
  stance: SocialTakeStance;
  tags: string[];
  confidence: SocialTakeConfidence;
  relatedTickers?: string[];
};

export type SocialAlignmentResult = {
  alignment: SocialAlignment;
  label: string;
  note: string;
  takes: SocialTake[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
};

export const CURATED_SOCIAL_TAKES: SocialTake[] = [
  {
    id: "hype-0xmediaco-market-share-2026-06-15",
    ticker: "HYPE",
    title: "Hyperliquid's expanding market share",
    analystHandle: "@0xmediaco",
    sourceUrl: "https://fundamental-labs.xyz/t/HYPE",
    publishedAt: "2026-06-15",
    summary: "The take frames Hyperliquid as a leading onchain perp venue with improving exchange-level traction.",
    stance: "bullish",
    tags: ["perps", "market-share", "exchange"],
    confidence: "medium",
    relatedTickers: ["BTC", "ETH", "SOL"],
  },
  {
    id: "hype-smart-ape-usdc-2026-06-12",
    ticker: "HYPE",
    title: "USDC growth as a Hyperliquid demand signal",
    analystHandle: "@the_smart_ape",
    sourceUrl: "https://fundamental-labs.xyz/t/HYPE",
    publishedAt: "2026-06-12",
    summary: "The take treats USDC growth and onchain usage as evidence that Hyperliquid activity is broadening.",
    stance: "bullish",
    tags: ["stablecoins", "usage", "onchain"],
    confidence: "medium",
  },
  {
    id: "sol-minnus-solana-protocol-base-2026-06-15",
    ticker: "SOL",
    title: "Solana as a base layer for new financial protocols",
    analystHandle: "@minnus",
    sourceUrl: "https://fundamental-labs.xyz/browse",
    publishedAt: "2026-06-15",
    summary: "The take argues Solana's execution environment continues to attract high-velocity financial applications.",
    stance: "bullish",
    tags: ["ecosystem", "payments", "apps"],
    confidence: "medium",
  },
  {
    id: "eth-joechalom-institutional-2026-06-15",
    ticker: "ETH",
    title: "Ethereum institutional adoption",
    analystHandle: "@joechalom",
    sourceUrl: "https://fundamental-labs.xyz/browse",
    publishedAt: "2026-06-15",
    summary: "The take highlights institutional adoption as a core Ethereum demand narrative.",
    stance: "bullish",
    tags: ["institutional", "etf", "adoption"],
    confidence: "medium",
  },
  {
    id: "eth-trustless-state-issuance-2026-06-15",
    ticker: "ETH",
    title: "Ethereum issuance and post-merge mechanics",
    analystHandle: "@TrustlessState",
    sourceUrl: "https://fundamental-labs.xyz/browse",
    publishedAt: "2026-06-15",
    summary: "The take focuses on Ethereum issuance mechanics and monetary design rather than a direct directional trade.",
    stance: "neutral",
    tags: ["issuance", "monetary-policy", "protocol"],
    confidence: "medium",
  },
  {
    id: "aave-0xmedico-evolution-2026-06-06",
    ticker: "AAVE",
    title: "Aave's product evolution",
    analystHandle: "@0xmedico",
    sourceUrl: "https://fundamental-labs.xyz/t/AAVE",
    publishedAt: "2026-06-06",
    summary: "The take argues Aave's product surface and DeFi role continue to compound over time.",
    stance: "bullish",
    tags: ["defi", "lending", "protocol"],
    confidence: "medium",
  },
];

function normalizeTicker(value: string) {
  return value.trim().toUpperCase();
}

export function findSocialTakesForAsset(asset: string, limit = 8): SocialTake[] {
  const ticker = normalizeTicker(asset);
  return CURATED_SOCIAL_TAKES
    .filter((take) => {
      if (normalizeTicker(take.ticker) === ticker) return true;
      return (take.relatedTickers ?? []).some((related) => normalizeTicker(related) === ticker);
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit);
}

export function socialAlignmentForSetup(args: {
  asset: string;
  side: "long" | "short" | "watch";
  takes?: SocialTake[];
  limit?: number;
}): SocialAlignmentResult {
  const takes = (args.takes ?? findSocialTakesForAsset(args.asset)).slice(0, args.limit ?? 3);
  const bullishCount = takes.filter((take) => take.stance === "bullish").length;
  const bearishCount = takes.filter((take) => take.stance === "bearish").length;
  const neutralCount = takes.filter((take) => take.stance === "neutral").length;

  if (args.side === "watch" || takes.length === 0 || (bullishCount === 0 && bearishCount === 0)) {
    return {
      alignment: "none",
      label: "No curated social confirmation",
      note: "No matching curated analyst take is loaded for this asset yet.",
      takes,
      bullishCount,
      bearishCount,
      neutralCount,
    };
  }

  if (bullishCount > 0 && bearishCount > 0) {
    return {
      alignment: "mixed",
      label: "Social tape is mixed",
      note: "Curated takes disagree, so funding and price confirmation should carry more weight.",
      takes,
      bullishCount,
      bearishCount,
      neutralCount,
    };
  }

  const confirms =
    (args.side === "long" && bullishCount > 0) ||
    (args.side === "short" && bearishCount > 0);

  if (confirms) {
    return {
      alignment: "confirms",
      label: "Social tape confirms",
      note: "Curated analyst stance points in the same direction as the setup, but price trigger still rules.",
      takes,
      bullishCount,
      bearishCount,
      neutralCount,
    };
  }

  return {
    alignment: "contradicts",
    label: args.side === "short" && bullishCount > 0 ? "Crowded narrative risk" : "Social tape contradicts",
    note:
      args.side === "short" && bullishCount > 0
        ? "Bullish curated takes can mark narrative crowding, but they also raise squeeze risk until price breaks down."
        : "Curated analyst stance points against this setup, so keep it watch-only unless price confirms.",
    takes,
    bullishCount,
    bearishCount,
    neutralCount,
  };
}
