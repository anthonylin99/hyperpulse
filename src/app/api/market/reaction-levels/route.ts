import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
  validateCoin,
} from "@/lib/security";
import { getReactionLevelMap } from "@/lib/reactionLevelStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WINDOW_MS: Record<string, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
};

function parseWindowMs(value: string | null): number {
  if (!value) return WINDOW_MS["15m"];
  return WINDOW_MS[value] ?? WINDOW_MS["15m"];
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-market-reaction-levels",
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const url = new URL(request.url);
  const coin = validateCoin(url.searchParams.get("coin"));
  const windowMs = parseWindowMs(url.searchParams.get("window"));

  if (!coin) {
    return jsonError("A valid coin is required.", {
      status: 400,
      cache: "public-market",
    });
  }

  try {
    const payload = await getReactionLevelMap({ coin, windowMs });
    return jsonSuccess(payload, { cache: "public-market" });
  } catch (error) {
    logServerError("api/market/reaction-levels", error);
    return jsonError("Unable to fetch Reaction Map right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
