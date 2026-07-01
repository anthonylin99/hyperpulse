import { NextRequest } from "next/server";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { buildHighFundingReversalReport, evaluateHighFundingReversalCandidate, HIGH_FUNDING_REVERSAL_UNIVERSE } from "@/lib/highFundingReversal";
import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";

export const dynamic = "force-dynamic";

type AssetCtx = Record<string, string | number | undefined>;

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAssets(value: string | null) {
  if (!value) return HIGH_FUNDING_REVERSAL_UNIVERSE;
  const parsed = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  const allowed = new Set(HIGH_FUNDING_REVERSAL_UNIVERSE);
  const filtered = parsed.filter((asset) => allowed.has(asset));
  return filtered.length > 0 ? filtered : HIGH_FUNDING_REVERSAL_UNIVERSE;
}

async function fundingRatesForAsset(info: ReturnType<typeof getInfoClient>, coin: string, endTime: number) {
  const startTime = endTime - 8 * 24 * 60 * 60 * 1000;
  const rows = await info.fundingHistory({ coin, startTime, endTime });
  return Array.isArray(rows)
    ? rows
        .map((row) => asNumber((row as Record<string, unknown>).fundingRate))
        .filter((rate): rate is number => rate != null)
    : [];
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-strategy-high-funding-reversal",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const info = getInfoClient(resolveNetworkFromRequest(req.nextUrl));
    const requestedAssets = parseAssets(req.nextUrl.searchParams.get("assets"));
    const [meta, ctxs] = await info.metaAndAssetCtxs();
    const universe = Array.isArray(meta?.universe) ? meta.universe : [];
    const endTime = Date.now();
    const rows = await Promise.all(
      requestedAssets.map(async (asset) => {
        const index = universe.findIndex((item: { name?: string }) => String(item?.name ?? "").toUpperCase() === asset);
        const ctx = index >= 0 ? (ctxs[index] as unknown as AssetCtx | undefined) : undefined;
        const markPx = asNumber(ctx?.markPx);
        const prevDayPx = asNumber(ctx?.prevDayPx);
        const fundingRate = asNumber(ctx?.funding);
        const fundingApr = fundingRate == null ? null : fundingRate * 8760 * 100;

        try {
          const fundingRates = index >= 0 ? await fundingRatesForAsset(info, asset, endTime) : [];
          return evaluateHighFundingReversalCandidate({
            asset,
            markPx,
            prevDayPx,
            fundingApr,
            fundingRates,
          });
        } catch {
          return evaluateHighFundingReversalCandidate({
            asset,
            markPx,
            prevDayPx,
            fundingApr,
            fundingRates: [],
          });
        }
      }),
    );

    return jsonSuccess({ report: buildHighFundingReversalReport(rows) }, { cache: "public-market" });
  } catch (error) {
    logServerError("api/strategy/high-funding-reversal", error);
    return jsonError("Unable to build the high-funding reversal scan right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
