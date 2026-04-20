import { NextRequest } from "next/server";
import { addWhaleWatchlist, listWhaleWatchlist } from "@/lib/whaleStore";
import { enforceRateLimit, jsonError, jsonSuccess, validateAddress } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-whales-watchlist-get",
    limit: 40,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const watchlist = await listWhaleWatchlist();
  return jsonSuccess({ watchlist });
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-whales-watchlist-post",
    limit: 12,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { address?: string; nickname?: string | null } | null;
  const address = validateAddress(body?.address ?? null);
  if (!address) {
    return jsonError("A valid wallet address is required.", { status: 400 });
  }

  const entry = await addWhaleWatchlist(address, body?.nickname ?? null);
  return jsonSuccess({ entry }, { status: 201 });
}
