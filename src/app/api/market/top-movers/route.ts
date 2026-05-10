import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { MIN_OI_USD } from "@/lib/constants";

export const dynamic = "force-dynamic";

const MIN_VOLUME_USD = 1_000_000;
const TOP_N = 5;
const SEVEN_DAY_CANDIDATE_LIMIT = 220;

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
  openInterestUsd: number;
};

type ScoredMover = {
  asset: ParsedAsset;
  pctChange: number;
  baselinePx?: number;
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
      const openInterestSize = Number(ctx.openInterest);
      const openInterestUsd = Number.isFinite(openInterestSize)
        ? openInterestSize * markPx
        : 0;
      return {
        coin: asset.name,
        markPx,
        prevDayPx,
        priceChange24h: ((markPx - prevDayPx) / prevDayPx) * 100,
        dayVolumeUsd: Number(ctx.dayNtlVlm) || 0,
        openInterestUsd,
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
  currentMarkPx: number,
): Promise<{ pctChange: number; baselinePx: number } | null> {
  const now = Date.now();
  const target = now - 7 * 24 * 60 * 60 * 1000;
  const start = target - 6 * 60 * 60 * 1000;
  try {
    const candles = (await info.candleSnapshot({
      coin,
      interval: "1h",
      startTime: start,
      endTime: now,
    })) as Array<{ t?: string | number; T?: string | number; c: string | number }> | string;

    const arr = typeof candles === "string"
      ? (JSON.parse(candles) as Array<{ t?: string | number; T?: string | number; c: string | number }>)
      : candles;
    if (!Array.isArray(arr) || arr.length < 2) return null;

    const baselineCandle =
      arr
        .filter((c) => {
          const t = Number(c.t ?? c.T);
          return Number.isFinite(t) && t <= target;
        })
        .at(-1) ?? arr[0];
    const baseline = Number(baselineCandle?.c);
    if (!Number.isFinite(currentMarkPx) || currentMarkPx <= 0) return null;
    if (!Number.isFinite(baseline) || baseline <= 0) return null;
    return {
      pctChange: ((currentMarkPx - baseline) / baseline) * 100,
      baselinePx: baseline,
    };
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
      (a) => a.openInterestUsd >= MIN_OI_USD && a.dayVolumeUsd >= MIN_VOLUME_USD,
    );

    let scored: ScoredMover[] = [];

    if (range === "1d") {
      scored = assets.map((a) => ({ asset: a, pctChange: a.priceChange24h }));
    } else {
      const candidates = [...assets]
        .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd)
        .slice(0, SEVEN_DAY_CANDIDATE_LIMIT);
      const results: Array<ScoredMover | null> = await Promise.all(
        candidates.map(async (a) => {
          const result = await compute7dChange(info, a.coin, a.markPx);
          return result == null
            ? null
            : { asset: a, pctChange: result.pctChange, baselinePx: result.baselinePx };
        }),
      );
      scored = results.filter(
        (r): r is ScoredMover => r !== null,
      );
    }

    const toMover = (s: ScoredMover): TopMover => ({
      coin: s.asset.coin,
      pctChange: s.pctChange,
      markPx: s.asset.markPx,
      prevPx: range === "7d" && s.baselinePx ? s.baselinePx : s.asset.prevDayPx,
      iconUrl: iconUrlFor(s.asset.coin),
    });
    const gainers = scored
      .filter((s) => s.pctChange > 0)
      .sort((a, b) => b.pctChange - a.pctChange)
      .slice(0, TOP_N)
      .map(toMover);
    const losers = scored
      .filter((s) => (range === "7d" ? Number.isFinite(s.pctChange) : s.pctChange < 0))
      .sort((a, b) => a.pctChange - b.pctChange)
      .slice(0, TOP_N)
      .map(toMover);

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
