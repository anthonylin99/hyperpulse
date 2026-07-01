import { CURATED_SOCIAL_TAKES, findSocialTakesForAsset } from "@/lib/socialTakes";
import { enforceRateLimit, jsonSuccess, validateCoin } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-social-takes",
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const url = new URL(request.url);
  const asset = validateCoin(url.searchParams.get("asset"));
  const takes = asset ? findSocialTakesForAsset(asset, 20) : CURATED_SOCIAL_TAKES;

  return jsonSuccess(
    {
      generatedAt: Date.now(),
      source: "manual-curated",
      caveat: "Curated analyst sentiment, not exhaustive X sentiment. Summaries are paraphrased and source links are preserved.",
      takes,
    },
    { cache: "public-market" },
  );
}
