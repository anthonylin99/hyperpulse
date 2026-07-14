// Server-side builder for the positioning-stress (crowding) desk payload.
// Shared by /api/crowding/alerts and /api/ideas so both surfaces read the
// same per-network cached snapshot instead of double-fetching Hyperliquid.

import { getInfoClient, type HyperliquidNetwork } from "@/lib/hyperliquid";
import { HIP3_DEXS, MIN_OI_USD } from "@/lib/constants";
import { fundingToSignal } from "@/lib/signals";
import { logServerError } from "@/lib/security";
import {
  buildPositioningStressAlert,
  rankPositioningStressAlerts,
  type CrowdingDeskPayload,
  type FundingPoint,
} from "@/lib/crowding";
import type { MarketAsset } from "@/types";

const CACHE_MS = 60_000;
const FUNDING_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const FUNDING_CANDIDATE_LIMIT = 18;

type MetaAndAssetCtxs = Awaited<ReturnType<ReturnType<typeof getInfoClient>["metaAndAssetCtxs"]>>;
type Meta = MetaAndAssetCtxs[0];
type AssetCtxs = MetaAndAssetCtxs[1];

const cachedPayloads = new Map<string, { expiresAt: number; payload: CrowdingDeskPayload }>();
const inFlightByNetwork = new Map<string, Promise<CrowdingDeskPayload>>();

function parseNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMarketAssets(meta: Meta, assetCtxs: AssetCtxs): MarketAsset[] {
  const parsed: Array<MarketAsset | null> = meta.universe
    .map((u, i) => {
      if (u.isDelisted) return null;
      const ctx = assetCtxs[i];
      if (!ctx) return null;
      const markPx = parseNumber((ctx as Record<string, unknown>).markPx);
      const midPx = parseNumber((ctx as Record<string, unknown>).midPx) || markPx;
      const oraclePx = parseNumber((ctx as Record<string, unknown>).oraclePx);
      const prevDayPx = parseNumber((ctx as Record<string, unknown>).prevDayPx);
      const fundingRate = parseNumber((ctx as Record<string, unknown>).funding);
      const fundingAPR = fundingRate * 8760 * 100;
      const openInterest = parseNumber((ctx as Record<string, unknown>).openInterest) * markPx;
      const dayVolume = parseNumber((ctx as Record<string, unknown>).dayNtlVlm);
      const priceChange24h = prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0;
      const colon = u.name.indexOf(":");
      const isHip3 = colon !== -1;
      return {
        coin: u.name,
        displayName: isHip3 ? u.name.slice(colon + 1) : u.name,
        dex: isHip3 ? u.name.slice(0, colon) : undefined,
        marketType: isHip3 ? "hip3_perp" : "perp",
        assetIndex: i,
        szDecimals: u.szDecimals,
        markPx,
        midPx,
        oraclePx,
        fundingRate,
        fundingAPR,
        openInterest,
        prevOpenInterest: null,
        oiChangePct: null,
        dayVolume,
        prevDayPx,
        priceChange24h,
        signal: fundingToSignal(fundingAPR, u.name, openInterest, 0),
        maxLeverage: u.maxLeverage,
      } satisfies MarketAsset;
    });
  return parsed.filter((asset): asset is MarketAsset => asset != null && asset.markPx > 0 && asset.openInterest > 0);
}

async function fetchAssets(network: HyperliquidNetwork): Promise<MarketAsset[]> {
  const info = getInfoClient(network);
  const [main, ...hip3] = await Promise.all([
    info.metaAndAssetCtxs(),
    ...HIP3_DEXS.map((dex) =>
      info.metaAndAssetCtxs({ dex }).catch((error) => {
        logServerError(`lib/crowdingDesk:dex:${dex}`, error);
        return null;
      }),
    ),
  ]);
  const universe: Meta["universe"] = [...main[0].universe];
  const contexts: AssetCtxs = [...main[1]];
  for (const result of hip3) {
    if (!result) continue;
    const [meta, ctxs] = result;
    const count = Math.min(meta.universe.length, ctxs.length);
    for (let index = 0; index < count; index += 1) {
      universe.push(meta.universe[index]);
      contexts.push(ctxs[index]);
    }
  }
  return parseMarketAssets({ ...main[0], universe }, contexts);
}

async function fetchFundingHistory(asset: MarketAsset, network: HyperliquidNetwork): Promise<FundingPoint[]> {
  const info = getInfoClient(network);
  const endTime = Date.now();
  const startTime = endTime - FUNDING_LOOKBACK_MS;
  const rows = await info.fundingHistory({ coin: asset.coin, startTime, endTime });
  return (Array.isArray(rows) ? rows : [])
    .map((row: Record<string, unknown>) => ({
      time: parseNumber(row.time),
      rate: parseNumber(row.fundingRate),
    }))
    .filter((point) => point.time > 0 && Number.isFinite(point.rate));
}

async function buildPayloadUncached(network: HyperliquidNetwork): Promise<CrowdingDeskPayload> {
  const now = Date.now();
  const assets = (await fetchAssets(network))
    .filter((asset) => asset.openInterest >= MIN_OI_USD || asset.marketType === "hip3_perp")
    .filter((asset) => Math.abs(asset.fundingAPR) >= 8)
    .sort((a, b) => {
      const aStress = Math.abs(a.fundingAPR) * Math.log10(a.openInterest + 10);
      const bStress = Math.abs(b.fundingAPR) * Math.log10(b.openInterest + 10);
      return bStress - aStress;
    })
    .slice(0, FUNDING_CANDIDATE_LIMIT);

  const fundingEntries = await Promise.allSettled(
    assets.map(async (asset) => [asset.coin, await fetchFundingHistory(asset, network)] as const),
  );
  const fundingByAsset: Record<string, FundingPoint[]> = {};
  for (const result of fundingEntries) {
    if (result.status !== "fulfilled") continue;
    fundingByAsset[result.value[0]] = result.value[1];
  }

  const alerts = rankPositioningStressAlerts(
    assets.map((asset) =>
      buildPositioningStressAlert({
        asset,
        fundingHistory: fundingByAsset[asset.coin],
        now,
      }),
    ),
    5,
  );

  return {
    generatedAt: now,
    alerts,
    methodology:
      "Proxy-based positioning stress: funding cost, funding persistence, OI context, 24h price confirmation, HIP-3 category risk. Wallet cohort split is reserved for the future indexer.",
  };
}

export async function buildCrowdingDeskPayload(network: HyperliquidNetwork): Promise<CrowdingDeskPayload> {
  const now = Date.now();
  const cached = cachedPayloads.get(network);
  if (cached && cached.expiresAt > now) return cached.payload;

  let inFlight = inFlightByNetwork.get(network);
  if (!inFlight) {
    inFlight = buildPayloadUncached(network)
      .then((payload) => {
        cachedPayloads.set(network, { expiresAt: Date.now() + CACHE_MS, payload });
        return payload;
      })
      .finally(() => {
        inFlightByNetwork.delete(network);
      });
    inFlightByNetwork.set(network, inFlight);
  }
  return inFlight;
}
