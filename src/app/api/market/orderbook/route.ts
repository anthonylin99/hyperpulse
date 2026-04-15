import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
  validateCoin,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-market-orderbook",
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const coin = validateCoin(searchParams.get("coin"));

  if (!coin) {
    return jsonError("A valid coin is required.", {
      status: 400,
      cache: "public-market",
    });
  }

  const info = getInfoClient(resolveNetworkFromRequest(new URL(request.url)));
  try {
    const data = await info.l2Book({ coin });
    if (!data) {
      return jsonError("Market not found.", {
        status: 404,
        cache: "public-market",
      });
    }

    const bids = data.levels[0].map((level) => ({
      px: parseFloat(level.px),
      sz: parseFloat(level.sz),
      n: level.n,
    }));
    const asks = data.levels[1].map((level) => ({
      px: parseFloat(level.px),
      sz: parseFloat(level.sz),
      n: level.n,
    }));

    const bestBid = bids.length > 0 ? bids[0].px : null;
    const bestAsk = asks.length > 0 ? asks[0].px : null;
    const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;
    const spreadBps =
      spread != null && bestAsk != null && bestBid != null
        ? (spread / ((bestAsk + bestBid) / 2)) * 10_000
        : null;

    return jsonSuccess({
      coin: data.coin,
      time: data.time,
      bestBid,
      bestAsk,
      spread,
      spreadBps,
      bids: bids.slice(0, 8),
      asks: asks.slice(0, 8),
    }, { cache: "public-market" });
  } catch (err) {
    logServerError("api/market/orderbook", err);
    return jsonError("Unable to fetch order book right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
