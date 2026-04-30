import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
  validateAddress,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { isResearchStoreConfigured, listSizingSnapshots, upsertSizingSnapshots } from "@/lib/researchStore";
import type { TradeSizingSnapshot } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RawAssetPosition = {
  type: string;
  position: {
    coin: string;
    szi: string;
    entryPx: string;
    unrealizedPnl: string;
    marginUsed: string;
    leverage: { value: number };
    liquidationPx: string | null;
    returnOnEquity: string;
  };
};

type PerpStateSnapshot = {
  dex: string | null;
  state: {
    marginSummary: { accountValue: string; totalMarginUsed: string };
    crossMarginSummary: { accountValue: string; totalMarginUsed: string };
    withdrawable: string;
    assetPositions: RawAssetPosition[];
  };
};

function parseNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fiveMinuteBucket(timestamp: number): number {
  return Math.floor(timestamp / 300_000) * 300_000;
}

function deriveSnapshots(args: {
  address: string;
  dex: string | null;
  rawPositions: RawAssetPosition[];
  accountEquityUsd: number;
  tradeableCapitalUsd: number;
  existingPositionKeys: Set<string>;
}): TradeSizingSnapshot[] {
  const capturedAt = fiveMinuteBucket(Date.now());
  const snapshots: TradeSizingSnapshot[] = [];

  for (const item of args.rawPositions) {
    const position = item.position;
    const szi = parseNumber(position.szi);
    if (szi === 0) continue;

    const rawAsset = String(position.coin ?? "");
    const asset =
      args.dex && rawAsset.toLowerCase().startsWith(`${args.dex.toLowerCase()}:`)
        ? rawAsset.slice(args.dex.length + 1)
        : rawAsset;
    if (!asset) continue;

    const side = szi >= 0 ? "long" : "short";
    const entryPrice = parseNumber(position.entryPx);
    const unrealizedPnl = parseNumber(position.unrealizedPnl);
    const absSize = Math.abs(szi);
    const pnlPerUnit = absSize > 0 ? unrealizedPnl / absSize : 0;
    const markPrice = szi > 0 ? entryPrice + pnlPerUnit : entryPrice - pnlPerUnit;
    const marginUsedUsd = parseNumber(position.marginUsed);
    const notionalUsd = Math.abs(szi) * Math.max(markPrice, 0);
    const leverage = parseNumber(position.leverage?.value);
    const liquidationPx = position.liquidationPx == null ? null : parseNumber(position.liquidationPx);
    const sizingPct =
      args.tradeableCapitalUsd > 0 && marginUsedUsd > 0
        ? (marginUsedUsd / args.tradeableCapitalUsd) * 100
        : 0;
    const marketPrefix = args.dex ? `hip3_perp:${args.dex}` : "perp";
    const positionKey = `${marketPrefix}:${asset}:${side}`;
    const source = args.existingPositionKeys.has(positionKey) ? "snapshot" : "first_captured";

    snapshots.push({
      id: `${args.address.toLowerCase()}:${positionKey}:${capturedAt}`,
      walletAddress: args.address.toLowerCase(),
      asset,
      side,
      marketType: args.dex ? "hip3_perp" : "perp",
      positionKey,
      capturedAt,
      entryTime: null,
      entryPrice,
      markPrice,
      size: absSize,
      notionalUsd,
      marginUsedUsd,
      liquidationPx,
      accountEquityUsd: args.accountEquityUsd,
      tradeableCapitalUsd: args.tradeableCapitalUsd,
      leverage,
      sizingPct,
      status: "open",
      source,
    });
  }

  return snapshots;
}

async function fetchDexPerpStates(
  info: ReturnType<typeof getInfoClient>,
  address: string,
): Promise<PerpStateSnapshot[]> {
  try {
    const dexs = await info.perpDexs();
    const dexNames = dexs
      .filter(
        (dex): dex is NonNullable<typeof dex> =>
          dex != null && typeof dex.name === "string" && dex.name.length > 0,
      )
      .map((dex) => dex.name);

    const settled = await Promise.allSettled(
      dexNames.map(async (dex) => ({
        dex,
        state: await info.clearinghouseState({ user: address as `0x${string}`, dex }),
      })),
    );

    return settled.flatMap((result) => (result.status === "fulfilled" ? [result.value as PerpStateSnapshot] : []));
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-portfolio-sizing-snapshot",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { address?: string } | null;
  const address = validateAddress(body?.address ?? null);
  if (!address) {
    return jsonError("A valid wallet address is required.", { status: 400 });
  }

  const info = getInfoClient(resolveNetworkFromRequest(req.nextUrl));

  try {
    const [state, dexStates] = await Promise.all([
      info.clearinghouseState({ user: address as `0x${string}` }),
      fetchDexPerpStates(info, address),
    ]);
    const perpStates: PerpStateSnapshot[] = [{ dex: null, state: state as PerpStateSnapshot["state"] }, ...dexStates];
    const isolatedAccountValue = perpStates.reduce(
      (sum, entry) => sum + parseNumber(entry.state.marginSummary.accountValue),
      0,
    );
    const totalMarginUsed = perpStates.reduce(
      (sum, entry) => sum + parseNumber(entry.state.marginSummary.totalMarginUsed),
      0,
    );
    const withdrawable = perpStates.reduce((sum, entry) => {
      const explicitWithdrawable = parseNumber(entry.state.withdrawable);
      if (explicitWithdrawable > 0) return sum + explicitWithdrawable;
      const accountValue = parseNumber(entry.state.crossMarginSummary.accountValue);
      const marginUsed = parseNumber(entry.state.crossMarginSummary.totalMarginUsed);
      return sum + Math.max(accountValue - marginUsed, 0);
    }, 0);
    const tradeableCapitalUsd = Math.max(withdrawable + totalMarginUsed, 0);

    let existingPositionKeys = new Set<string>();
    if (isResearchStoreConfigured()) {
      const existing = await listSizingSnapshots({ walletAddress: address, days: 730 }).catch(() => []);
      existingPositionKeys = new Set(existing.map((snapshot) => snapshot.positionKey));
    }

    const snapshots = perpStates.flatMap((entry) =>
      deriveSnapshots({
        address,
        dex: entry.dex,
        rawPositions: entry.state.assetPositions as RawAssetPosition[],
        accountEquityUsd: isolatedAccountValue,
        tradeableCapitalUsd,
        existingPositionKeys,
      }),
    );

    let stored = false;
    if (isResearchStoreConfigured()) {
      stored = await upsertSizingSnapshots(snapshots);
    }

    return jsonSuccess({
      configured: isResearchStoreConfigured(),
      stored,
      snapshots,
      updatedAt: Date.now(),
    });
  } catch (error) {
    logServerError("api/portfolio/sizing-snapshot", error);
    return jsonSuccess({
      configured: isResearchStoreConfigured(),
      stored: false,
      snapshots: [],
      unavailable: true,
      updatedAt: Date.now(),
    });
  }
}
