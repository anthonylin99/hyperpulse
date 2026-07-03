"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { deriveHypeLevelPlan, type HypeLevelPlan } from "@/lib/hypeLevels";
import type { HypeFundamentalsContext } from "@/lib/hypeFundamentals";

export type HypeLevelPlanInput = {
  enabled?: boolean;
  mark: number | null;
  priceChange24h: number | null;
  oiChangePct: number | null;
  fundingApr: number | null;
  levelBias?: HypeFundamentalsContext["levelBias"];
};

export function useHypeLevelPlan(input: HypeLevelPlanInput) {
  const enabled = input.enabled ?? true;
  const [researchedLevelPlan, setResearchedLevelPlan] = useState<HypeLevelPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fallbackLevelPlan = useMemo(
    () =>
      deriveHypeLevelPlan({
        mark: input.mark,
        priceChange24h: input.priceChange24h,
        oiChangePct: input.oiChangePct,
        fundingApr: input.fundingApr,
        levelBias: input.levelBias,
      }),
    [input.fundingApr, input.levelBias, input.mark, input.oiChangePct, input.priceChange24h],
  );

  const refresh = useCallback(async () => {
    if (!enabled) {
      setResearchedLevelPlan(null);
      setError(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hype/levels?ts=${Date.now()}`);
      if (!response.ok) throw new Error("HYPE researched levels unavailable.");
      const plan = (await response.json()) as HypeLevelPlan;
      setResearchedLevelPlan(plan);
      return plan;
    } catch (err) {
      setError(err instanceof Error ? err.message : "HYPE researched levels unavailable.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    levelPlan: researchedLevelPlan ?? fallbackLevelPlan,
    researchedLevelPlan,
    loading,
    error,
    refresh,
  };
}
