import { NextRequest } from "next/server";
import { getMomentumAlertOutcomes } from "@/lib/momentumAlertOutcomes";
import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-alerts-outcomes",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? 50), 1), 50);
    const payload = await getMomentumAlertOutcomes(limit);
    return jsonSuccess(payload, { cache: "public-market" });
  } catch (error) {
    logServerError("api/alerts/outcomes", error);
    return jsonError("Unable to evaluate momentum alert outcomes right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
