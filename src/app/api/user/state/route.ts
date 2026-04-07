import { NextRequest } from "next/server";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
  validateAddress,
} from "@/lib/security";

const transport = new HttpTransport({ isTestnet: false });
const info = new InfoClient({ transport });

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-user-state",
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const address = validateAddress(req.nextUrl.searchParams.get("address"));
  if (!address) {
    return jsonError("A valid wallet address is required.", { status: 400 });
  }

  try {
    const [perpState, spotState] = await Promise.all([
      info.clearinghouseState({ user: address as `0x${string}` }),
      info.spotClearinghouseState({ user: address as `0x${string}` }),
    ]);
    return jsonSuccess({ perpState, spotState });
  } catch (err) {
    logServerError("api/user/state", err);
    return jsonError("Unable to fetch wallet state right now.", { status: 502 });
  }
}
