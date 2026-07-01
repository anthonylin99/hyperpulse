import { findSocialTakesForAsset, socialAlignmentForSetup } from "@/lib/socialTakes";
import { enforceRateLimit, jsonError, jsonSuccess, validateCoin } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-social-alignment",
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const url = new URL(request.url);
  const asset = validateCoin(url.searchParams.get("asset"));
  const sideParam = url.searchParams.get("side");
  const side = sideParam === "long" || sideParam === "short" || sideParam === "watch" ? sideParam : null;

  if (!asset || !side) {
    return jsonError("Provide a valid asset and side.", {
      status: 400,
      cache: "public-market",
    });
  }

  const takes = findSocialTakesForAsset(asset, 8);
  return jsonSuccess(
    {
      generatedAt: Date.now(),
      asset,
      side,
      ...socialAlignmentForSetup({ asset, side, takes, limit: 3 }),
    },
    { cache: "public-market" },
  );
}
