import { NextRequest } from "next/server";
import { buildHyperpulseSentimentReport } from "@/lib/sentimentReport";
import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-sentiment-report",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const report = await buildHyperpulseSentimentReport();
    return jsonSuccess({ report }, { cache: "public-market" });
  } catch (error) {
    logServerError("api/sentiment/report", error);
    return jsonError("Unable to build the HyperPulse sentiment report right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
