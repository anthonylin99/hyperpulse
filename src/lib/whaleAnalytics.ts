import type { HyperliquidNetwork } from "@/lib/hyperliquid";
import { getInfoClient } from "@/lib/hyperliquid";
import { isResearchStoreConfigured, listTrackedWallets } from "@/lib/researchStore";
import {
  buildWalletLeaderboardRow,
  normalizeWhaleAddress,
  parseWhaleAddressList,
  type RawClearinghouseState,
  type RawSpotState,
  type WalletSource,
} from "@/lib/whaleAnalyticsCore";
import type { WalletLeaderboardRow, WhaleLeaderboardResult } from "@/types/whales";

export { parseWhaleAddressList };

const MAX_WALLETS = 24;
const MAX_CONCURRENCY = 4;
const CACHE_TTL_MS = 45_000;

type WalletCandidate = {
  address: string;
  source: WalletSource;
  firstSeenAt?: number;
};

const leaderboardCache = new Map<string, { expiresAt: number; result: WhaleLeaderboardResult }>();

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function envWalletCandidates(): WalletCandidate[] {
  return parseWhaleAddressList(process.env.HYPERPULSE_TRACKED_WALLETS)
    .map((address) => ({ address, source: "env" }));
}

async function walletCandidates(queryAddresses: string[]): Promise<WalletCandidate[]> {
  const candidates = new Map<string, WalletCandidate>();
  for (const address of queryAddresses) {
    candidates.set(address, { address, source: "query" });
  }
  if (isResearchStoreConfigured()) {
    for (const wallet of await listTrackedWallets({ status: "active", limit: MAX_WALLETS })) {
      const address = normalizeWhaleAddress(wallet.walletAddress);
      if (!address || candidates.has(address)) continue;
      candidates.set(address, {
        address,
        source: "tracked",
        firstSeenAt: wallet.firstSeenAt,
      });
    }
  }
  for (const candidate of envWalletCandidates()) {
    if (!candidates.has(candidate.address)) candidates.set(candidate.address, candidate);
  }
  return [...candidates.values()].slice(0, MAX_WALLETS);
}

function cacheKey(network: HyperliquidNetwork, addresses: string[]) {
  return `${network}:${addresses.slice().sort().join(",")}`;
}

export async function buildWhaleLeaderboard(args: {
  network?: HyperliquidNetwork;
  queryAddresses?: string[];
} = {}): Promise<WhaleLeaderboardResult> {
  const network = args.network ?? "mainnet";
  const requestedAddresses = [...new Set((args.queryAddresses ?? []).map((address) => address.toLowerCase()))];
  const key = cacheKey(network, requestedAddresses);
  const cached = leaderboardCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const candidates = await walletCandidates(requestedAddresses);
  const info = getInfoClient(network);
  const warnings: string[] = [];
  let unavailableCount = 0;

  const rows = await mapLimit(candidates, MAX_CONCURRENCY, async (candidate) => {
    try {
      const [clearinghouseState, spotState, portfolio] = await Promise.all([
        info.clearinghouseState({ user: candidate.address as `0x${string}` }),
        info.spotClearinghouseState({ user: candidate.address as `0x${string}` }).catch(() => null),
        info.portfolio({ user: candidate.address as `0x${string}` }).catch(() => null),
      ]);
      return buildWalletLeaderboardRow({
        walletAddress: candidate.address,
        source: candidate.source,
        firstSeenAt: candidate.firstSeenAt,
        clearinghouseState: clearinghouseState as RawClearinghouseState,
        spotState: spotState as RawSpotState | null,
        portfolio,
      });
    } catch {
      unavailableCount += 1;
      warnings.push(`Unable to refresh ${candidate.address.slice(0, 6)}...${candidate.address.slice(-4)}.`);
      return null;
    }
  });

  const ranked = rows
    .filter((row): row is WalletLeaderboardRow => row != null)
    .sort((a, b) => {
      if (b.accountValueUsd !== a.accountValueUsd) return b.accountValueUsd - a.accountValueUsd;
      return b.notionalExposureUsd - a.notionalExposureUsd;
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const result: WhaleLeaderboardResult = {
    wallets: ranked,
    partial: unavailableCount > 0,
    warnings,
    unavailableCount,
    generatedAt: Date.now(),
    universe: {
      requested: candidates.length,
      ranked: ranked.length,
      source: "tracked_wallet_sample",
      caveats: [
        "Tracked wallet sample, not exhaustive exchange-wide leaderboard.",
        "PnL is sourced from public Hyperliquid portfolio/fill/funding data where available.",
        "Directional bias is current exposure, not a trade recommendation.",
      ],
    },
  };
  leaderboardCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
  return result;
}
