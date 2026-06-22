import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { HIP3_DEXS } from "@/lib/constants";

export const dynamic = "force-dynamic";

type MetaAndAssetCtxs = Awaited<
  ReturnType<ReturnType<typeof getInfoClient>["metaAndAssetCtxs"]>
>;
type Meta = MetaAndAssetCtxs[0];
type AssetCtxs = MetaAndAssetCtxs[1];

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-market",
    limit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const info = getInfoClient(resolveNetworkFromRequest(new URL(request.url)));
  try {
    // Main perp dex (crypto) plus each HIP-3 builder dex (oil, metals,
    // equities, FX, indices). Each builder dex is requested with its `dex`
    // name; its universe entries are already prefixed (e.g. "xyz:BRENTOIL").
    const [main, ...hip3] = await Promise.all([
      info.metaAndAssetCtxs(),
      ...HIP3_DEXS.map((dex) =>
        info
          .metaAndAssetCtxs({ dex })
          // A single failed/unavailable builder dex must not break the
          // crypto perps table — skip it.
          .catch((err) => {
            logServerError(`api/market:dex:${dex}`, err);
            return null;
          }),
      ),
    ]);

    const universe: Meta["universe"] = [...main[0].universe];
    const assetCtxs: AssetCtxs = [...main[1]];

    for (const result of hip3) {
      if (!result) continue;
      const [meta, ctxs] = result;
      // Keep universe[i] aligned with assetCtxs[i] across the concatenation
      // so the existing index-paired client parser needs no changes.
      const count = Math.min(meta.universe.length, ctxs.length);
      for (let i = 0; i < count; i += 1) {
        universe.push(meta.universe[i]);
        assetCtxs.push(ctxs[i]);
      }
    }

    return jsonSuccess([{ ...main[0], universe }, assetCtxs], {
      cache: "public-market",
    });
  } catch (err) {
    logServerError("api/market", err);
    return jsonError("Unable to fetch market data right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
