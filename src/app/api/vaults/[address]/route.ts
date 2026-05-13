import { NextRequest } from "next/server";
import { isVaultsEnabled } from "@/lib/appConfig";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
  validateAddress,
} from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import {
  computeStrategyFingerprint,
  computeVaultMetrics,
  fetchVaultDetails,
  normalizeVaultFill,
  SAMPLE_WINDOW_DAYS,
} from "@/lib/vaults";
import {
  computePortfolioStats,
  groupFillsIntoTrades,
  mergeFundingIntoTrades,
} from "@/lib/analytics";
import type { Fill, FundingEntry, PortfolioStats } from "@/types";
import type { HyperliquidNetwork } from "@/lib/hyperliquid";

export const dynamic = "force-dynamic";

const OPERATOR_LOOKBACK_DAYS = 90;
const PAGE_LIMIT = 2_000;
const MAX_PAGES = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

type RawFundingRow = {
  time: number;
  delta?: {
    type?: string;
    coin?: string;
    usdc?: string;
    szi?: string;
    fundingRate?: string;
    nSamples?: number;
  };
};

function parseNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchOperatorFills(args: {
  user: string;
  network: HyperliquidNetwork;
  startTime: number;
  endTime: number;
}): Promise<Fill[]> {
  const info = getInfoClient(args.network);
  const normalized = new Map<string, Fill>();
  let cursor = args.startTime;

  for (let page = 0; page < MAX_PAGES && cursor < args.endTime; page++) {
    const rows = (await info.userFillsByTime({
      user: args.user as `0x${string}`,
      startTime: cursor,
      endTime: args.endTime,
      aggregateByTime: true,
    })) as unknown[];

    for (const row of rows) {
      const fill = normalizeVaultFill(row);
      if (!fill) continue;
      normalized.set(`${fill.hash}:${fill.oid}:${fill.time}:${fill.coin}:${fill.px}:${fill.sz}`, fill);
    }

    if (rows.length < PAGE_LIMIT) break;
    const maxTime = Math.max(
      cursor,
      ...rows.map((row) => Number((row as { time?: unknown }).time)).filter(Number.isFinite),
    );
    if (maxTime <= cursor) break;
    cursor = maxTime + 1;
  }

  return Array.from(normalized.values()).sort((a, b) => a.time - b.time);
}

async function fetchOperatorFunding(args: {
  user: string;
  network: HyperliquidNetwork;
  startTime: number;
  endTime: number;
}): Promise<FundingEntry[]> {
  const info = getInfoClient(args.network);
  const normalized = new Map<string, FundingEntry>();
  let cursor = args.startTime;

  for (let page = 0; page < MAX_PAGES && cursor < args.endTime; page++) {
    const rows = (await info.userFunding({
      user: args.user as `0x${string}`,
      startTime: cursor,
      endTime: args.endTime,
    })) as RawFundingRow[];

    for (const row of rows) {
      if (row.delta?.type !== "funding" || !row.delta.coin) continue;
      const entry: FundingEntry = {
        time: row.time,
        coin: row.delta.coin,
        // Hyperliquid already signs this cash flow: negative means paid, positive means received.
        usdc: parseNumber(row.delta.usdc),
        positionSize: parseNumber(row.delta.szi),
        fundingRate: parseNumber(row.delta.fundingRate),
        nSamples: row.delta.nSamples ?? 1,
      };
      normalized.set(`${entry.time}:${entry.coin}:${entry.usdc}:${entry.positionSize}`, entry);
    }

    if (rows.length < PAGE_LIMIT) break;
    const maxTime = Math.max(cursor, ...rows.map((row) => Number(row.time)).filter(Number.isFinite));
    if (maxTime <= cursor) break;
    cursor = maxTime + 1;
  }

  return Array.from(normalized.values()).sort((a, b) => a.time - b.time);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  if (!isVaultsEnabled()) {
    return jsonError("Vault analytics are not enabled for this deployment.", { status: 404 });
  }

  const limited = enforceRateLimit(req, {
    key: "api-vaults-detail",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { address: rawAddress } = await params;
  const address = validateAddress(rawAddress);
  if (!address) {
    return jsonError("A valid vault address is required.", { status: 400 });
  }

  const network = resolveNetworkFromRequest(req.nextUrl);

  try {
    const vault = await fetchVaultDetails(address, network);
    if (!vault) {
      return jsonError("Vault not found.", { status: 404 });
    }

    const now = Date.now();
    const startTime = now - OPERATOR_LOOKBACK_DAYS * DAY_MS;

    const [fills, funding] = await Promise.all([
      fetchOperatorFills({ user: vault.leader, network, startTime, endTime: now }),
      fetchOperatorFunding({ user: vault.leader, network, startTime, endTime: now }),
    ]);

    const metrics = computeVaultMetrics(vault);
    const fingerprint = computeStrategyFingerprint(fills, SAMPLE_WINDOW_DAYS);
    const trades = mergeFundingIntoTrades(groupFillsIntoTrades(fills), funding);
    const operatorStats: PortfolioStats = computePortfolioStats(trades, funding);

    return jsonSuccess(
      {
        vault,
        metrics,
        fingerprint,
        operator: {
          address: vault.leader,
          lookbackDays: OPERATOR_LOOKBACK_DAYS,
          fundingEntryCount: funding.length,
          stats: operatorStats,
        },
      },
      { cache: "public-market" },
    );
  } catch (err) {
    logServerError("api/vaults/[address]", err);
    return jsonError("Unable to fetch vault detail right now.", { status: 502 });
  }
}
