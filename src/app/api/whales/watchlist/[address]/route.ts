import { NextRequest } from "next/server";
import { removeWhaleWatchlist } from "@/lib/whaleStore";
import { enforceRateLimit, jsonError, jsonSuccess, validateAddress } from "@/lib/security";
import { isWhalesEnabled } from "@/lib/appConfig";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  if (!isWhalesEnabled()) {
    return jsonError("Not found.", { status: 404 });
  }
  const limited = enforceRateLimit(req, {
    key: "api-whales-watchlist-delete",
    limit: 12,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { address } = await params;
  const normalized = validateAddress(address);
  if (!normalized) {
    return jsonError("A valid wallet address is required.", { status: 400 });
  }

  await removeWhaleWatchlist(normalized);
  return jsonSuccess({ ok: true });
}
