import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";

export const dynamic = "force-dynamic";

const MIN_VOLUME_USD = 1_000_000;
const TOP_N = 10;
const SEVEN_DAY_CANDIDATE_LIMIT = 80;

type Range = "1d" | "7d";

export type TopMover = {
  coin: string;
  pctChange: number;
  markPx: number;
  prevPx: number;
  iconUrl: string | null;
};

type ParsedAsset = {
  coin: string;
  markPx: number;
  prevDayPx: number;
  priceChange24h: number;
  dayVolumeUsd: number;
};

function parseAssets(data: unknown): ParsedAsset[] {
  const [meta, assetCtxs] = data as [
    { universe?: Array<{ name: string; isDelisted?: boolean }> },
    Array<Record<string, string | number | undefined>>,
  ];
  if (!Array.isArray(meta?.universe) || !Array.isArray(assetCtxs)) return [];

  return meta.universe
    .map((asset, index): ParsedAsset | null => {
      if (asset.isDelisted) return null;
      const ctx = assetCtxs[index];
      if (!ctx) return null;
      const markPx = Number(ctx.markPx);
      const prevDayPx = Number(ctx.prevDayPx);
      if (!Number.isFinite(markPx) || markPx <= 0) return null;
      if (!Number.isFinite(prevDayPx) || prevDayPx <= 0) return null;
      return {
        coin: asset.name,
        markPx,
        prevDayPx,
        priceChange24h: ((markPx - prevDayPx) / prevDayPx) * 100,
        dayVolumeUsd: Number(ctx.dayNtlVlm) || 0,
      };
    })
    .filter((a): a is ParsedAsset => a !== null);
}

function iconUrlFor(coin: string): string {
  return `https://app.hyperliquid.xyz/coins/${coin}.svg`;
}

async function compute7dChange(
  info: ReturnType<typeof getInfoClient>,
  coin: string,
): Promise<number | null> {
  const now = Date.now();
  const start = now - 8 * 24 * 60 * 60 * 1000;
  try {
    const candles = (await info.candleSnapshot({
      coin,
      interval: "1d",
      startTime: start,
      endTime: now,
    })) as Array<{ c: string | number }> | string;

    const arr = typeof candles === "string"
      ? (JSON.parse(candles) as Array<{ c: string | number }>)
      : candles;
    if (!Array.isArray(arr) || arr.length < 2) return null;

    const last = Number(arr[arr.length - 1]?.c);
    const baseline = Number(arr[0]?.c);
    if (!Number.isFinite(last) || !Number.isFinite(baseline) || baseline <= 0) return null;
    return ((last - baseline) / baseline) * 100;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-market-top-movers",
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const url = new URL(req.url);
  const rawRange = url.searchParams.get("range");
  const range: Range = rawRange === "7d" ? "7d" : "1d";

  try {
    const info = getInfoClient(resolveNetworkFromRequest(url));
    const assets = parseAssets(await info.metaAndAssetCtxs()).filter(
      (a) => a.dayVolumeUsd >= MIN_VOLUME_USD,
    );

    let scored: Array<{ asset: ParsedAsset; pctChange: number }> = [];

    if (range === "1d") {
      scored = assets.map((a) => ({ asset: a, pctChange: a.priceChange24h }));
    } else {
      const candidates = [...assets]
        .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd)
        .slice(0, SEVEN_DAY_CANDIDATE_LIMIT);
      const results = await Promise.all(
        candidates.map(async (a) => {
          const pct = await compute7dChange(info, a.coin);
          return pct == null ? null : { asset: a, pctChange: pct };
        }),
      );
      scored = results.filter(
        (r): r is { asset: ParsedAsset; pctChange: number } => r !== null,
      );
    }

    const sortedDesc = [...scored].sort((a, b) => b.pctChange - a.pctChange);
    const gainers = sortedDesc.slice(0, TOP_N).map<TopMover>((s) => ({
      coin: s.asset.coin,
      pctChange: s.pctChange,
      markPx: s.asset.markPx,
      prevPx: s.asset.prevDayPx,
      iconUrl: iconUrlFor(s.asset.coin),
    }));
    const losers = sortedDesc
      .slice(-TOP_N)
      .reverse()
      .map<TopMover>((s) => ({
        coin: s.asset.coin,
        pctChange: s.pctChange,
        markPx: s.asset.markPx,
        prevPx: s.asset.prevDayPx,
        iconUrl: iconUrlFor(s.asset.coin),
      }));

    return jsonSuccess(
      { gainers, losers, range, asOf: Date.now() },
      { cache: "public-market" },
    );
  } catch (err) {
    logServerError("api/market/top-movers", err);
    return jsonError("Unable to fetch top movers right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
