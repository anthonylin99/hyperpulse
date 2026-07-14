import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";
import { getInfoClient, resolveNetworkFromRequest, type HyperliquidNetwork } from "@/lib/hyperliquid";
import { buildDailySetupCandidates } from "@/lib/dailySetup";
import { buildCrowdingDeskPayload } from "@/lib/crowdingDesk";
import { composeTradeIdeas, type TradeIdeasPayload } from "@/lib/tradeIdeas";
import { getTrackRecordCell } from "@/lib/crowdingTrackRecordData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_MS = 60_000;

const cachedPayloads = new Map<string, { expiresAt: number; payload: TradeIdeasPayload }>();
const inFlightByNetwork = new Map<string, Promise<TradeIdeasPayload>>();

async function buildIdeas(network: HyperliquidNetwork): Promise<TradeIdeasPayload> {
  const info = getInfoClient(network);
  const [setups, crowding] = await Promise.all([
    buildDailySetupCandidates(info),
    buildCrowdingDeskPayload(network),
  ]);
  return composeTradeIdeas({
    setups,
    crowdingAlerts: crowding.alerts,
    trackRecordCell: getTrackRecordCell("high_actionable", 24),
  });
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-ideas",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const network = resolveNetworkFromRequest(new URL(request.url));
  const now = Date.now();
  const cached = cachedPayloads.get(network);
  if (cached && cached.expiresAt > now) {
    return jsonSuccess(cached.payload, { cache: "public-market" });
  }

  try {
    let inFlight = inFlightByNetwork.get(network);
    if (!inFlight) {
      inFlight = buildIdeas(network).finally(() => {
        inFlightByNetwork.delete(network);
      });
      inFlightByNetwork.set(network, inFlight);
    }
    const payload = await inFlight;
    cachedPayloads.set(network, { payload, expiresAt: now + CACHE_MS });
    return jsonSuccess(payload, { cache: "public-market" });
  } catch (error) {
    logServerError("api/ideas", error);
    return jsonError("Unable to build trade ideas right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
