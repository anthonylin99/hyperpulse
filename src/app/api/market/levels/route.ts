import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  parseInterval,
  validateCoin,
} from "@/lib/security";
import { isMarketStoreConfigured, listMarketLevels } from "@/lib/marketStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? 12);
  if (!Number.isFinite(parsed)) return 12;
  return Math.min(Math.max(Math.round(parsed), 1), 50);
}

function parseKind(value: string | null): "support" | "resistance" | null {
  if (value === "support" || value === "resistance") return value;
  return null;
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-market-levels",
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const coin = validateCoin(req.nextUrl.searchParams.get("coin"));
  if (!coin) {
    return jsonError("A valid coin is required.", {
      status: 400,
      cache: "public-market",
    });
  }

  const intervalParam = req.nextUrl.searchParams.get("interval");
  const interval = intervalParam ? parseInterval(intervalParam, "15m") : null;
  const kind = parseKind(req.nextUrl.searchParams.get("kind"));
  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
  const configured = isMarketStoreConfigured();
  const levels = configured
    ? await listMarketLevels({
      asset: coin,
      interval,
      kind,
      limit,
    })
    : [];

  return jsonSuccess(
    {
      coin,
      configured,
      source: levels.length > 0 ? "db-observed" : "empty",
      interval,
      kind,
      levels,
      updatedAt: Date.now(),
    },
    { cache: "public-market" },
  );
}
