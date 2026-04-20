import { getInfoClient } from "@/lib/hyperliquid";
import { validateAddress } from "@/lib/security";
import { getWhaleAlertsForAddress, getStoredWhaleProfile, upsertWhaleProfile } from "@/lib/whaleStore";
import {
  buildWhaleProfile,
  normalizeFills,
  normalizeFunding,
  normalizeLedgerEvents,
} from "@/lib/whales";
import { WHALE_PROFILE_LOOKBACK_30D_MS } from "@/lib/constants";
import type { WhaleWalletProfile } from "@/types";

export async function fetchLiveWhaleProfile(address: string): Promise<WhaleWalletProfile> {
  const normalized = validateAddress(address);
  if (!normalized) {
    throw new Error("A valid wallet address is required.");
  }

  const info = getInfoClient("mainnet");
  const now = Date.now();
  const startTime = now - WHALE_PROFILE_LOOKBACK_30D_MS;

  const [perpState, spotState, rawFills, rawFunding, rawLedger, activeAlerts, stored] =
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
      getWhaleAlertsForAddress(normalized, 12),
      getStoredWhaleProfile(normalized),
    ]);

  const profile = buildWhaleProfile({
    address: normalized,
    perpState: perpState as unknown as Record<string, unknown>,
    spotState: spotState as unknown as Record<string, unknown>,
    fills: normalizeFills(rawFills as unknown as Array<Record<string, unknown>>),
    funding: normalizeFunding(rawFunding as unknown as Array<Record<string, unknown>>),
    ledger: normalizeLedgerEvents(rawLedger as unknown as Array<Record<string, unknown>>, normalized),
    activeAlerts,
    firstSeenAt: stored?.firstSeenAt ?? null,
    lastSeenAt: stored?.lastSeenAt ?? null,
  });

  await upsertWhaleProfile(profile);
  return profile;
}
