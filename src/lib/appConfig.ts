export const ENABLE_TRADING_DEFAULT = false;
export const ENABLE_FACTORS_DEFAULT = false;
export const ENABLE_FACTORS_PROD_DEFAULT = false;
export const ENABLE_AGENT_DEV_DEFAULT = process.env.NODE_ENV !== "production";
export const ENABLE_VAULTS_DEV_DEFAULT = true;
export const ENABLE_VAULTS_PROD_DEFAULT = true;

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

function isPublicProduction() {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === "production"
  );
}

export function isTradingEnabled() {
  return (
    resolveFlag(
      readEnvFlag(process.env.ENABLE_TRADING),
      readEnvFlag(process.env.NEXT_PUBLIC_ENABLE_TRADING),
    ) ?? ENABLE_TRADING_DEFAULT
  );
}

export function isFactorsEnabled() {
  const defaultValue = isPublicProduction() ? ENABLE_FACTORS_PROD_DEFAULT : ENABLE_FACTORS_DEFAULT;
  return (
    resolveFlag(
      readEnvFlag(process.env.ENABLE_FACTORS),
      readEnvFlag(process.env.NEXT_PUBLIC_ENABLE_FACTORS),
    ) ?? defaultValue
  );
}

export function isAgentDevEnabled() {
  const defaultValue = isPublicProduction() ? false : ENABLE_AGENT_DEV_DEFAULT;
  return (
    resolveFlag(
      readEnvFlag(process.env.ENABLE_AGENT_DEV),
      readEnvFlag(process.env.NEXT_PUBLIC_ENABLE_AGENT_DEV),
    ) ?? defaultValue
  );
}

export function isVaultsEnabled() {
  const defaultValue = isPublicProduction()
    ? ENABLE_VAULTS_PROD_DEFAULT
    : ENABLE_VAULTS_DEV_DEFAULT;
  return (
    resolveFlag(
      readEnvFlag(process.env.ENABLE_VAULTS),
      readEnvFlag(process.env.NEXT_PUBLIC_ENABLE_VAULTS),
    ) ?? defaultValue
  );
}

export const PUBLIC_DEPLOYMENT_MODE = isTradingEnabled() ? "trading" : "read-only";
