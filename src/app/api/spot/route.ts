import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";

export const dynamic = "force-dynamic";

type SpotCategory = "Stocks" | "Commodities" | "Crypto" | "Other";

function classifySpot(symbol: string): SpotCategory {
  const stocks = new Set(["TSLA", "NVDA", "AAPL", "MSFT", "SPY", "QQQ", "USPYX"]);
  const commodities = new Set(["XAUT0", "HOLD", "PAXG", "XAU", "WTI", "BRENT"]);

  if (stocks.has(symbol)) return "Stocks";
  if (commodities.has(symbol)) return "Commodities";

  if (/USD|USDC/.test(symbol)) return "Other";
  if (/^[A-Z0-9]{2,12}$/.test(symbol)) return "Crypto";

  return "Other";
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-spot",
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const info = getInfoClient(resolveNetworkFromRequest(new URL(request.url)));
  try {
    const [meta, assetCtxs] = await info.spotMetaAndAssetCtxs();
    const tokenByIndex = new Map(meta.tokens.map((token) => [token.index, token]));

    const assets = meta.universe
      .map((u) => {
        if (!Array.isArray(u.tokens) || u.tokens.length < 2) return null;

        const baseToken = tokenByIndex.get(u.tokens[0]);
        const quoteToken = tokenByIndex.get(u.tokens[1]);
        if (!baseToken || !quoteToken) return null;

        const pair = `${baseToken.name}/${quoteToken.name}`;
        const symbol = baseToken.name;
        const ctx = assetCtxs[u.index];
        if (!ctx) return null;

        const markPx = parseFloat(ctx.markPx);
        const midPx = ctx.midPx ? parseFloat(ctx.midPx) : markPx;
        const prevDayPx = parseFloat(ctx.prevDayPx);
        const dayVolume = parseFloat(ctx.dayNtlVlm);
        const circulatingSupply = parseFloat(ctx.circulatingSupply);
        const totalSupply = parseFloat(ctx.totalSupply);
        const marketCap = circulatingSupply * markPx;
        const priceChange24h =
          prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0;
        if (
          !Number.isFinite(markPx) ||
          !Number.isFinite(midPx) ||
          !Number.isFinite(prevDayPx) ||
          !Number.isFinite(dayVolume)
        ) {
          return null;
        }

        return {
          marketIndex: u.index,
          spotAssetId: 10000 + u.index,
          symbol,
          name: baseToken.fullName ?? symbol,
          market: pair,
          markPx,
          midPx,
          prevDayPx,
          priceChange24h,
          dayVolume,
          circulatingSupply,
          totalSupply,
          marketCap,
          category: classifySpot(symbol),
        };
      })
      .filter((a): a is NonNullable<typeof a> => a != null)
      .sort((a, b) => b.dayVolume - a.dayVolume);

    return jsonSuccess({ assets, updatedAt: Date.now() }, { cache: "public-market" });
  } catch (err) {
    logServerError("api/spot", err);
    return jsonError("Unable to fetch spot market data right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
