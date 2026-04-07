import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";

const transport = new HttpTransport({ isTestnet: false });
const info = new InfoClient({ transport });

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-market",
    limit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const data = await info.metaAndAssetCtxs();
    return jsonSuccess(data, { cache: "public-market" });
  } catch (err) {
    logServerError("api/market", err);
    return jsonError("Unable to fetch market data right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
