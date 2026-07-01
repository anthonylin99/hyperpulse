import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
  validateCoin,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { getHypeFundamentalsContext } from "@/lib/hypeFundamentals";
import { getReactionLevelMap } from "@/lib/reactionLevelStore";
import type { ReactionLevelsPayload, ReactionOrderBookShelf } from "@/lib/reactionLevels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WINDOW_MS: Record<string, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

function parseWindowMs(value: string | null): number {
  if (!value) return WINDOW_MS["15m"];
  return WINDOW_MS[value] ?? WINDOW_MS["15m"];
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-market-reaction-levels",
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const url = new URL(request.url);
  const coin = validateCoin(url.searchParams.get("coin"));
  const coins = (url.searchParams.get("coins") ?? "")
    .split(",")
    .map((value) => validateCoin(value))
    .filter((value): value is string => value != null)
    .slice(0, 24);
  const windowMs = parseWindowMs(url.searchParams.get("window"));

  if (coins.length > 0) {
    try {
      const entries = await Promise.all(
        coins.map(async (asset) => [asset, await getReactionLevelMap({ coin: asset, windowMs })] as const),
      );
      return jsonSuccess(
        {
          assets: Object.fromEntries(entries),
          generatedAt: Date.now(),
          source: "reaction-levels-batch",
        },
        { cache: "public-market" },
      );
    } catch (error) {
      logServerError("api/market/reaction-levels.batch", error);
      return jsonError("Unable to fetch Reaction Map right now.", {
        status: 502,
        cache: "public-market",
      });
    }
  }

  if (!coin) {
    return jsonError("A valid coin is required.", {
      status: 400,
    });
  }

  try {
    const payload = await getReactionLevelMap({ coin, windowMs });
    const payloadWithLiveBook = await attachLiveOrderBookShelves({
      payload,
      coin,
      windowMs,
      requestUrl: url,
    });
    const enrichedPayload = await attachHypeFundamentals(payloadWithLiveBook, coin);
    return jsonSuccess(enrichedPayload, { cache: "public-market" });
  } catch (error) {
    logServerError("api/market/reaction-levels", error);
    return jsonError("Unable to fetch Reaction Map right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}

async function attachHypeFundamentals(
  payload: ReactionLevelsPayload,
  coin: string,
): Promise<ReactionLevelsPayload> {
  if (coin.toUpperCase() !== "HYPE") return payload;
  try {
    return {
      ...payload,
      hypeFundamentals: await getHypeFundamentalsContext(),
    };
  } catch {
    return payload;
  }
}

async function attachLiveOrderBookShelves(args: {
  payload: ReactionLevelsPayload;
  coin: string;
  windowMs: number;
  requestUrl: URL;
}): Promise<ReactionLevelsPayload> {
  try {
    const info = getInfoClient(resolveNetworkFromRequest(args.requestUrl));
    const book = await info.l2Book({ coin: args.coin });
    const bids = book?.levels?.[0] ?? [];
    const asks = book?.levels?.[1] ?? [];
    const bestBid = Number(bids[0]?.px);
    const bestAsk = Number(asks[0]?.px);
    const mid =
      Number.isFinite(bestBid) && Number.isFinite(bestAsk) && bestBid > 0 && bestAsk > 0
        ? (bestBid + bestAsk) / 2
        : args.payload.currentPrice;
    if (mid == null || mid <= 0) return args.payload;
    const bookTime = Number(book?.time) || Date.now();

    const toShelf = (
      level: { px: string; sz: string; n: number },
      side: "bid" | "ask",
      index: number,
    ): ReactionOrderBookShelf | null => {
      const price = Number(level.px);
      const size = Number(level.sz);
      if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) return null;
      const notionalUsd = price * size;
      return {
        id: `live-l2-${args.coin}-${side}-${price}-${index + 1}`,
        side,
        price,
        zoneLow: price,
        zoneHigh: price,
        distancePct: ((price - mid) / mid) * 100,
        notionalUsd,
        peakNotionalUsd: notionalUsd,
        sampleCount: Math.max(Number(level.n) || 1, 1),
        confidence: "low",
        ageMs: Math.max(0, Date.now() - bookTime),
        windowMs: args.windowMs,
        sourceCaveat: {
          exactPositions: false,
          source: "hyperliquid_public_streams",
          text: "Live Hyperliquid l2Book shelves are real resting orders. They can still pull before price trades there.",
        },
      };
    };

    const bidShelves = bids
      .slice(0, 5)
      .map((level, index) => toShelf(level, "bid", index))
      .filter((shelf): shelf is ReactionOrderBookShelf => shelf != null);
    const askShelves = asks
      .slice(0, 5)
      .map((level, index) => toShelf(level, "ask", index))
      .filter((shelf): shelf is ReactionOrderBookShelf => shelf != null);
    if (bidShelves.length === 0 && askShelves.length === 0) return args.payload;

    return {
      ...args.payload,
      currentPrice: args.payload.currentPrice ?? mid,
      orderBook: {
        bidShelves,
        askShelves,
        hidden: [],
        sourceCaveat: {
          exactPositions: false,
          source: "hyperliquid_public_streams",
          text: "Order-book shelves are live Hyperliquid l2Book levels, not inferred positioning.",
        },
      },
    };
  } catch {
    return args.payload;
  }
}
