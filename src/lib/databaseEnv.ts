export const DATABASE_ENV_NAMES =
  "NEON_DATABASE_URL_POOLING, NEON_DATABASE_URL, DATABASE_URL, or POSTGRES_URL";

export function getPooledDatabaseUrl(): string {
  return (
    process.env.NEON_DATABASE_URL_POOLING ??
    process.env.NEON_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    ""
  );
}

export function getDirectDatabaseUrl(): string {
  return (
    process.env.NEON_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.NEON_DATABASE_URL_POOLING ??
    ""
  );
}
