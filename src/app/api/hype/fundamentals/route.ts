import { getHypeFundamentalsContext } from "@/lib/hypeFundamentals";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-hype-fundamentals",
    limit: 45,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    return jsonSuccess(await getHypeFundamentalsContext(), { cache: "public-market" });
  } catch (error) {
    logServerError("api/hype/fundamentals", error);
    return jsonError("Unable to fetch HYPE fundamentals right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
