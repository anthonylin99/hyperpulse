const PG_SSL_MODES_TO_PIN = new Set(["prefer", "require", "verify-ca"]);

export const DATABASE_ENV_NAMES =
  "NEON_DATABASE_URL_POOLING, NEON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL";

export function cleanEnv(value) {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "");
}

export function normalizeDatabaseUrl(value) {
  const cleaned = cleanEnv(value);
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

export function getPooledDatabaseUrl() {
  return normalizeDatabaseUrl(
    process.env.NEON_DATABASE_URL_POOLING ??
      process.env.NEON_DATABASE_URL ??
      process.env.DATABASE_URL ??
      process.env.POSTGRES_URL ??
      "",
  );
}

export function getDirectDatabaseUrl() {
  return normalizeDatabaseUrl(
    process.env.NEON_DATABASE_URL ??
      process.env.DATABASE_URL ??
      process.env.POSTGRES_URL ??
      process.env.NEON_DATABASE_URL_POOLING ??
      "",
  );
}
