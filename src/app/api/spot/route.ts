import { NextResponse } from "next/server";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

const transport = new HttpTransport({ isTestnet: false });
const info = new InfoClient({ transport });

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

export async function GET() {
  try {
    const [meta, assetCtxs] = await info.spotMetaAndAssetCtxs();

    const ctxByCoin = new Map(
      assetCtxs.map((ctx) => [String((ctx as { coin?: string }).coin ?? ""), ctx])
    );

    const assets = meta.universe
      .map((u, i) => {
        if (!u.isCanonical) return null;

        const baseTokenIndex = u.tokens[0];
        const token = meta.tokens.find((t) => t.index === baseTokenIndex);
        const symbol = token?.name ?? u.name.split("/")[0] ?? `SPOT-${i}`;

        const ctx = ctxByCoin.get(symbol) ?? assetCtxs[i];
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

        return {
          symbol,
          name: token?.fullName ?? symbol,
          market: u.name,
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

    return NextResponse.json({ assets, updatedAt: Date.now() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch spot data" },
      { status: 500 }
    );
  }
}
