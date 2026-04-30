import { getInfoClient } from "@/lib/hyperliquid";
import { validateAddress } from "@/lib/security";
import {
  getStoredWhaleProfile,
  getWalletTimingScores,
  getWhaleAlertsForAddress,
  upsertWhaleProfile,
} from "@/lib/whaleStore";
import {
  buildSpotMarketMap,
  buildWhaleProfile,
  normalizeFills,
  normalizeFunding,
  normalizeLedgerEvents,
} from "@/lib/whales";
import { WHALE_PROFILE_LOOKBACK_30D_MS } from "@/lib/constants";
import type { WhaleWalletProfile } from "@/types";

async function safeStoreRead<T>(read: Promise<T>, fallback: T): Promise<T> {
  try {
    return await read;
  } catch (error) {
    console.warn("[whale-service] store read unavailable; continuing with live profile only", error);
    return fallback;
  }
}

export async function fetchLiveWhaleProfile(address: string): Promise<WhaleWalletProfile> {
  const normalized = validateAddress(address);
  if (!normalized) {
    throw new Error("A valid wallet address is required.");
  }

  const info = getInfoClient("mainnet");
  const now = Date.now();
  const startTime = now - WHALE_PROFILE_LOOKBACK_30D_MS;

  const [perpState, spotState, rawFills, rawFunding, rawLedger, activeAlerts, stored, spotMeta, timingScores] =
    await Promise.all([
      info.clearinghouseState({ user: normalized as `0x${string}` }),
      info.spotClearinghouseState({ user: normalized as `0x${string}` }),
      info.userFillsByTime({
        user: normalized as `0x${string}`,
        startTime,
        aggregateByTime: true,
      }),
      info.userFunding({
        user: normalized as `0x${string}`,
        startTime,
        endTime: now,
      }),
      info.userNonFundingLedgerUpdates({
        user: normalized as `0x${string}`,
        startTime,
        endTime: now,
      }),
      safeStoreRead(getWhaleAlertsForAddress(normalized, 12), []),
      safeStoreRead(getStoredWhaleProfile(normalized), null),
      info.spotMetaAndAssetCtxs(),
      safeStoreRead(getWalletTimingScores(normalized), []),
    ]);

  const [spotMetaData, spotAssetCtxs] = spotMeta as unknown as [
    { universe: Array<{ index: number; tokens: number[] }>; tokens: Array<{ index: number; name: string; fullName?: string }> },
    Array<{ markPx: string; midPx: string | null; prevDayPx: string }>,
  ];
  const spotMarketMap = buildSpotMarketMap(spotMetaData, spotAssetCtxs);
  const coinAliasMap = Object.fromEntries(
    Object.values(spotMarketMap).map((market) => [market.marketKey, market.symbol]),
  );

  const profile = buildWhaleProfile({
    address: normalized,
    perpState: perpState as unknown as Record<string, unknown>,
    spotState: spotState as unknown as Record<string, unknown>,
    fills: normalizeFills(rawFills as unknown as Array<Record<string, unknown>>, coinAliasMap),
    funding: normalizeFunding(rawFunding as unknown as Array<Record<string, unknown>>),
    ledger: normalizeLedgerEvents(rawLedger as unknown as Array<Record<string, unknown>>, normalized),
    activeAlerts,
    firstSeenAt: stored?.firstSeenAt ?? null,
    lastSeenAt: stored?.lastSeenAt ?? null,
    spotMarketMap,
  });

  const score1h = timingScores.find((score) => score.lookaheadHours === 1) ?? null;
  const score4h = timingScores.find((score) => score.lookaheadHours === 4) ?? null;
  profile.preMoveHitRate1h = score1h?.hitRate ?? null;
  profile.preMoveHitRate4h = score4h?.hitRate ?? null;
  profile.preMoveSampleSize = Math.max(score1h?.sampleSize ?? 0, score4h?.sampleSize ?? 0) || null;

  await upsertWhaleProfile(profile).catch((error) => {
    console.warn("[whale-service] unable to persist live whale profile; returning volatile profile", error);
  });
  return profile;
}
