import { NextRequest } from "next/server";
import { enforceRateLimit, jsonError, jsonSuccess } from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { getResearchDailyPrices, normalizeResearchAssets } from "@/lib/researchMarketData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseDays(value: string | null): number {
  const parsed = Number(value ?? 90);
  if (!Number.isFinite(parsed)) return 90;
  return Math.min(Math.max(Math.round(parsed), 30), 365);
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-research-daily-prices",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const assets = normalizeResearchAssets((req.nextUrl.searchParams.get("assets") ?? "").split(","));
  const days = parseDays(req.nextUrl.searchParams.get("days"));
  const marketType = req.nextUrl.searchParams.get("marketType") === "spot" ? "spot" : "perp";

  if (assets.length === 0) {
    return jsonError("At least one valid asset is required.", { status: 400 });
  }

  const info = getInfoClient(resolveNetworkFromRequest(req.nextUrl));
  const result = await getResearchDailyPrices({ info, assets, days, marketType });

  return jsonSuccess({
    ...result,
    assets,
    days,
    marketType,
    updatedAt: Date.now(),
  });
}
