const DEX_PREFIX_REGEX = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const MARKET_ASSET_REGEX = /^[A-Z0-9][A-Z0-9/_-]{0,31}$/;
const COIN_REGEX = /^[A-Z0-9][A-Z0-9/:_-]{0,31}$/;

export function normalizeMarketCoin(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.includes(":")) {
    const normalized = trimmed.toUpperCase();
    return COIN_REGEX.test(normalized) ? normalized : null;
  }

  const parts = trimmed.split(":");
  if (parts.length !== 2) return null;

  const dex = parts[0].toLowerCase();
  const asset = parts[1].toUpperCase();
  if (!DEX_PREFIX_REGEX.test(dex) || !MARKET_ASSET_REGEX.test(asset)) {
    return null;
  }

  return `${dex}:${asset}`;
}
