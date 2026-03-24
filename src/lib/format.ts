export function formatUSD(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export function formatPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatFundingRate(rate: number): string {
  // rate is decimal (e.g. 0.0001 = 0.01%)
  return `${(rate * 100).toFixed(4)}%`;
}

export function formatFundingAPR(apr: number): string {
  const sign = apr >= 0 ? "+" : "";
  return `${sign}${apr.toFixed(1)}%`;
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
