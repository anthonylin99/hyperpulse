import { NextRequest } from "next/server";
import { buildHyperpulseFactorReport } from "@/lib/factorReport";
import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-factors-report",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const report = await buildHyperpulseFactorReport();
    return jsonSuccess({ report }, { cache: "public-market" });
  } catch (error) {
    logServerError("api/factors/report", error);
    return jsonError("Unable to build the HyperPulse factor report right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
