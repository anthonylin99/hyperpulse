export const DATABASE_ENV_NAMES =
  "NEON_DATABASE_URL_POOLING, NEON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL";

const PG_SSL_MODES_TO_PIN = new Set(["prefer", "require", "verify-ca"]);

export function isDatabaseEnabled(): boolean {
  const explicit = String(process.env.HYPERPULSE_DB_ENABLED ?? "").trim().toLowerCase();
  return explicit === "true" || explicit === "1" || explicit === "yes";
}

export function normalizeDatabaseUrl(value: string | undefined): string {
  const cleaned = String(value ?? "").trim().replace(/^["']|["']$/g, "");
  if (!cleaned) return "";

  try {
    const url = new URL(cleaned);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return cleaned;

    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    if (sslMode && PG_SSL_MODES_TO_PIN.has(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
  } catch {
    return cleaned;
  }

  return cleaned;
}

// Pick the first env var that holds a non-empty value. Empty strings count as
// "not set": the compose database-env anchor defaults the NEON_* vars to "",
// and a plain `??` chain would select that empty string and never fall through
// to DATABASE_URL / POSTGRES_URL (the self-hosted Postgres case).
function firstFilledEnv(...values: Array<string | undefined>): string {
  for (const value of values) {
    const cleaned = String(value ?? "").trim().replace(/^["']|["']$/g, "");
    if (cleaned) return cleaned;
  }
  return "";
}

export function getPooledDatabaseUrl(): string {
  if (!isDatabaseEnabled()) return "";
  return normalizeDatabaseUrl(
    firstFilledEnv(
      process.env.NEON_DATABASE_URL_POOLING,
      process.env.NEON_DATABASE_URL,
      process.env.DATABASE_URL,
      process.env.POSTGRES_URL
    )
  );
}

export function getDirectDatabaseUrl(): string {
  if (!isDatabaseEnabled()) return "";
  return normalizeDatabaseUrl(
    firstFilledEnv(
      process.env.NEON_DATABASE_URL,
      process.env.DATABASE_URL,
      process.env.POSTGRES_URL,
      process.env.NEON_DATABASE_URL_POOLING
    )
  );
}
