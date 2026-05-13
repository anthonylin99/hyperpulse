"use client";

import { FilterChip } from "@/components/trading-ui";

export type VaultFilterState = {
  minTvl: boolean;
  minHistory: boolean;
  sharpePositive: boolean;
};

export const DEFAULT_VAULT_FILTERS: VaultFilterState = {
  minTvl: true,
  minHistory: true,
  sharpePositive: false,
};

export function VaultFilters({
  state,
  onChange,
}: {
  state: VaultFilterState;
  onChange: (next: VaultFilterState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChip
        label="Min $100K TVL"
        active={state.minTvl}
        onClick={() => onChange({ ...state, minTvl: !state.minTvl })}
      />
      <FilterChip
        label="Min 30d history"
        active={state.minHistory}
        onClick={() => onChange({ ...state, minHistory: !state.minHistory })}
      />
      <FilterChip
        label="High risk-adjusted sample"
        active={state.sharpePositive}
        onClick={() => onChange({ ...state, sharpePositive: !state.sharpePositive })}
      />
    </div>
  );
}
