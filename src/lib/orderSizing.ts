function truncateToDecimals(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** Math.max(0, decimals);
  return Math.trunc(value * factor) / factor;
}

export function formatOrderSize(value: number, decimals: number): string {
  const safeDecimals = Math.max(0, Math.floor(decimals));
  const truncated = truncateToDecimals(Math.abs(value), safeDecimals);
  if (!Number.isFinite(truncated) || truncated <= 0) return "0";

  if (safeDecimals === 0) {
    return String(Math.trunc(truncated));
  }

  return truncated.toFixed(safeDecimals).replace(/\.?0+$/, "");
}
