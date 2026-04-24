import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import type { SpotCategory } from "@/types";

export const dynamic = "force-dynamic";

function classifySpot(symbol: string): SpotCategory {
  const normalized = symbol.toUpperCase().replace(/\/USDC$/, "");
  const stocks = new Set(["TSLA", "NVDA", "AAPL", "AMZN", "GOOGL", "META", "MSFT", "NFLX"]);
  const indices = new Set(["SPY", "QQQ", "USPYX", "DIA", "IWM", "US500", "NDX", "NASDAQ"]);
  const metals = new Set(["XAUT0", "HOLD", "PAXG", "XAU", "XAG", "SLV", "GLD"]);
  const energy = new Set(["WTI", "BRENT", "BRENTOIL", "USO", "XBR", "XTI", "OIL"]);
  const commodities = new Set(["CORN", "WHEAT", "SOY", "COFFEE", "COCOA", "SUGAR"]);

  if (indices.has(normalized)) return "Indices/ETFs";
  if (stocks.has(normalized)) return "Stocks";
  if (metals.has(normalized)) return "Metals";
  if (energy.has(normalized)) return "Energy";
  if (commodities.has(normalized)) return "Commodities";

  if (/USD|USDC/.test(normalized)) return "Other";
  if (/^[A-Z0-9]{2,12}$/.test(normalized)) return "Crypto";

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
