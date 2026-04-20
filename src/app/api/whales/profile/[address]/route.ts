import { NextRequest } from "next/server";
import { enforceRateLimit, jsonError, jsonSuccess, logServerError, validateAddress } from "@/lib/security";
import { isWhaleStoreConfigured } from "@/lib/whaleStore";
import { fetchLiveWhaleProfile } from "@/lib/whaleService";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const limited = enforceRateLimit(req, {
    key: "api-whales-profile",
    limit: 25,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { address } = await params;
  const normalized = validateAddress(address);
  if (!normalized) {
    return jsonError("A valid wallet address is required.", { status: 400 });
  }

  try {
    const profile = await fetchLiveWhaleProfile(normalized);
    return jsonSuccess({ profile, workerConfigured: isWhaleStoreConfigured() });
  } catch (error) {
    logServerError("api/whales/profile", error);
    return jsonError("Unable to fetch whale profile right now.", { status: 502 });
  }
}
