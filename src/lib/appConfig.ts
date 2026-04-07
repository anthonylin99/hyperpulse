export const ENABLE_TRADING =
  process.env.NEXT_PUBLIC_ENABLE_TRADING === "true";

export const PUBLIC_DEPLOYMENT_MODE = ENABLE_TRADING ? "trading" : "read-only";
