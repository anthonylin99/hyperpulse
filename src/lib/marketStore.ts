import { Pool } from "pg";
import type { SupportResistanceLevel } from "@/types";

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
const STORE_BACKOFF_MS = 5 * 60 * 1000;

let pool: Pool | null = null;
let disabledUntil = 0;

function markStoreUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("quota") || message.includes("XX000")) {
    disabledUntil = Date.now() + STORE_BACKOFF_MS;
  }
  console.warn("[market-store] unavailable", error);
}

function getPool(): Pool | null {
  if (disabledUntil > Date.now()) return null;
  if (!DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
  }
  return pool;
}

export function isMarketStoreConfigured(): boolean {
  return Boolean(getPool());
}

type LevelObservationPayload = {
  currentPrice?: unknown;
  pivotTime?: unknown;
  discoveredAt?: unknown;
  confirmationBars?: unknown;
  zoneLow?: unknown;
  zoneHigh?: unknown;
  antiRepaint?: unknown;
  replay?: unknown;
};

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function confidenceFor(strength: number): "low" | "medium" | "high" {
  if (strength >= 8) return "high";
  if (strength >= 5) return "medium";
  return "low";
}

function normalizeLevelObservation(row: Record<string, unknown>): SupportResistanceLevel {
  const payload = (row.payload ?? {}) as LevelObservationPayload;
  const price = Number(row.level_price);
  const strength = Number(row.strength ?? 0);
  const pivotTime = asNumber(payload.pivotTime);
  const discoveredAt = asNumber(payload.discoveredAt) ?? Number(row.observed_at);
  const zoneLow = asNumber(payload.zoneLow);
  const zoneHigh = asNumber(payload.zoneHigh);
  const kind = String(row.kind) === "resistance" ? "resistance" : "support";

  return {
    id: String(row.id),
    label: kind === "support" ? "Stored Support" : "Stored Resistance",
    kind,
    source: "structure_pivot",
    price,
    zoneLow: zoneLow ?? undefined,
    zoneHigh: zoneHigh ?? undefined,
    strength,
    touches: Number(row.touches ?? 1),
    distancePct: row.distance_pct == null ? undefined : Number(row.distance_pct),
    pivotTimeMs: pivotTime ?? undefined,
    discoveredTimeMs: discoveredAt,
    updatedAtMs: Number(row.observed_at),
    confidence: confidenceFor(strength),
    status: "active",
    confirmationBars: asNumber(payload.confirmationBars) ?? undefined,
    reason: payload.antiRepaint
      ? "Stored point-in-time level generated from closed candles only."
      : "Stored point-in-time level observation.",
  };
}

export async function listMarketLevels(args: {
  asset: string;
  interval?: string | null;
  kind?: "support" | "resistance" | null;
  limit?: number;
}): Promise<SupportResistanceLevel[]> {
  const client = getPool();
  if (!client) return [];

  try {
    const assetResult = await client.query(
      `
      select asset_key
      from market_assets
      where upper(asset) = $1
        and is_active = true
      order by last_seen_at desc
      limit 1
      `,
      [args.asset.toUpperCase()],
    );
    const assetKey = assetResult.rows[0]?.asset_key;
    if (!assetKey) return [];

    const values: unknown[] = [assetKey];
    const clauses = ["asset_key = $1"];

    if (args.interval) {
      values.push(args.interval);
      clauses.push(`interval = $${values.length}`);
    }

    if (args.kind) {
      values.push(args.kind);
      clauses.push(`kind = $${values.length}`);
    }

    values.push(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const staleCutoffParam = `$${values.length}`;
    values.push(Math.min(Math.max(Math.round(args.limit ?? 12), 1), 50));
    const limitParam = `$${values.length}`;

    const result = await client.query(
      `
      select *
      from level_observations
      where ${clauses.join(" and ")}
        and observed_at >= ${staleCutoffParam}
      order by observed_at desc, strength desc
      limit ${limitParam}
      `,
      values,
    );

    return result.rows.map(normalizeLevelObservation);
  } catch (error) {
    markStoreUnavailable(error);
    return [];
  }
}
