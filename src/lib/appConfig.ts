export const ENABLE_TRADING_DEFAULT = false;
export const ENABLE_WHALES_DEFAULT = false;

function readEnvFlag(value: string | undefined): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function resolveFlag(...values: Array<boolean | null>): boolean | null {
  for (const value of values) {
    if (value != null) return value;
  }
  return null;
}

export function isTradingEnabled() {
  return (
    resolveFlag(
      readEnvFlag(process.env.ENABLE_TRADING),
      readEnvFlag(process.env.NEXT_PUBLIC_ENABLE_TRADING),
    ) ?? ENABLE_TRADING_DEFAULT
  );
}

export function isWhalesEnabled() {
  return (
    resolveFlag(
      readEnvFlag(process.env.ENABLE_WHALES),
      readEnvFlag(process.env.NEXT_PUBLIC_ENABLE_WHALES),
    ) ?? ENABLE_WHALES_DEFAULT
  );
}

export const PUBLIC_DEPLOYMENT_MODE = isTradingEnabled() ? "trading" : "read-only";
