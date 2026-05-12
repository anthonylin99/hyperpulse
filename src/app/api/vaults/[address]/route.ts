import { NextRequest } from "next/server";
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
  SAMPLE_WINDOW_DAYS,
} from "@/lib/vaults";
import {
  computeEquityCurve,
  computePortfolioStats,
  groupFillsIntoTrades,
  mergeFundingIntoTrades,
} from "@/lib/analytics";
import type { Fill, FundingEntry, PortfolioStats } from "@/types";

export const dynamic = "force-dynamic";

const OPERATOR_LOOKBACK_DAYS = 90;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
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
  const info = getInfoClient(network);

  try {
    const vault = await fetchVaultDetails(address, network);
    if (!vault) {
      return jsonError("Vault not found.", { status: 404 });
    }

    const now = Date.now();
    const startTime = now - OPERATOR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

    // Fetch operator fills + funding in parallel. The vault's `leader` is the
    // operator wallet — same data shape as /portfolio analytics.
    const [fillsRaw, fundingRaw] = await Promise.all([
      info
        .userFillsByTime({
          user: vault.leader as `0x${string}`,
          startTime,
          aggregateByTime: true,
        })
        .catch(() => [] as unknown[]),
      info
        .userFunding({
          user: vault.leader as `0x${string}`,
          startTime,
          endTime: now,
        })
        .catch(() => [] as unknown[]),
    ]);

    const fills = fillsRaw as Fill[];
    const funding = (fundingRaw as Array<{
      time: number;
      delta: {
        type: string;
        coin: string;
        usdc: string;
        szi?: string;
        fundingRate?: string;
        nSamples?: number;
      };
    }>)
      .filter((f) => f.delta?.type === "funding")
      .map<FundingEntry>((f) => ({
        time: f.time,
        coin: f.delta.coin,
        // HL ledger funding `usdc` is the cash flow; negative means paid out.
        usdc: -Number.parseFloat(f.delta.usdc),
        positionSize: f.delta.szi ? Number.parseFloat(f.delta.szi) : 0,
        fundingRate: f.delta.fundingRate ? Number.parseFloat(f.delta.fundingRate) : 0,
        nSamples: f.delta.nSamples ?? 1,
      }));

    const metrics = computeVaultMetrics(vault);
    const fingerprint = computeStrategyFingerprint(fills, SAMPLE_WINDOW_DAYS);

    const trades = mergeFundingIntoTrades(groupFillsIntoTrades(fills), funding);
    const operatorStats: PortfolioStats = computePortfolioStats(trades, funding);
    const equityCurve = computeEquityCurve(trades, 1000);

    return jsonSuccess(
      {
        vault,
        metrics,
        fingerprint,
        operator: {
          address: vault.leader,
          lookbackDays: OPERATOR_LOOKBACK_DAYS,
          stats: operatorStats,
          equityCurve,
        },
      },
      { cache: "public-market" },
    );
  } catch (err) {
    logServerError("api/vaults/[address]", err);
    return jsonError("Unable to fetch vault detail right now.", { status: 502 });
  }
}
