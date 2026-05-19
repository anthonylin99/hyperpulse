import { NextRequest } from "next/server";
import { MIN_OI_USD } from "@/lib/constants";
import { isVaultsEnabled } from "@/lib/appConfig";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import {
  computeMomentumEdges,
  selectHoldingUpEdges,
  selectMomentumEdges,
  type MomentumEdgeAsset,
} from "@/lib/marketRadarScoring";
import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";
import { listVaultSummaries } from "@/lib/vaults";
import type { VaultListItem } from "@/types/vaults";

export const dynamic = "force-dynamic";

const MIN_VOLUME_USD = 1_000_000;

type ParsedAsset = {
  coin: string;
  markPx: number;
  prevDayPx: number;
  priceChange24h: number;
  fundingAPR: number;
  openInterestUsd: number;
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
      const fundingRate = Number(ctx.funding);
      const openInterest = Number(ctx.openInterest) * markPx;

      if (!Number.isFinite(markPx) || markPx <= 0) return null;
      if (!Number.isFinite(prevDayPx) || prevDayPx <= 0) return null;

      return {
        coin: asset.name,
        markPx,
        prevDayPx,
        priceChange24h: ((markPx - prevDayPx) / prevDayPx) * 100,
        fundingAPR: Number.isFinite(fundingRate) ? fundingRate * 8760 * 100 : 0,
        openInterestUsd: Number.isFinite(openInterest) ? openInterest : 0,
        dayVolumeUsd: Number(ctx.dayNtlVlm) || 0,
      };
    })
    .filter((asset): asset is ParsedAsset => asset != null);
}

function asMomentumCard(asset: MomentumEdgeAsset, side: "long" | "short") {
  const details = side === "long" ? asset.strongDetails : asset.weakDetails;
  const score = side === "long" ? asset.strongScore : asset.weakScore;
  return {
    asset: asset.coin,
    side,
    score: Number(score.toFixed(2)),
    markPx: asset.markPx,
    return24hPct: Number(asset.rawReturn24hPct.toFixed(2)),
    vsBtcPct: Number(details.btcResidualPct.toFixed(2)),
    vsBasketPct: Number(details.basketResidualPct.toFixed(2)),
    routeHref: `/markets?asset=${encodeURIComponent(asset.coin)}`,
  };
}

function asMover(asset: ParsedAsset) {
  return {
    asset: asset.coin,
    markPx: asset.markPx,
    return24hPct: Number(asset.priceChange24h.toFixed(2)),
    openInterestUsd: Math.round(asset.openInterestUsd),
    routeHref: `/markets?asset=${encodeURIComponent(asset.coin)}`,
  };
}

function asVaultCandidate(vault: VaultListItem) {
  return {
    name: vault.name,
    address: vault.vaultAddress,
    score: vault.metrics.score.score,
    decision: vault.metrics.score.label,
    tvl: vault.metrics.tvl,
    return30dPct: vault.metrics.return30dPct,
    drawdownPct: vault.metrics.maxDrawdownPct,
    allowDeposits: vault.allowDeposits,
    routeHref: `/vaults/${vault.vaultAddress}`,
  };
}

async function buildMarketPulse(req: NextRequest) {
  const info = getInfoClient(resolveNetworkFromRequest(req.nextUrl));
  const assets = parseAssets(await info.metaAndAssetCtxs()).filter(
    (asset) => asset.openInterestUsd >= MIN_OI_USD && asset.dayVolumeUsd >= MIN_VOLUME_USD,
  );

  const scored = computeMomentumEdges(assets);
  const running = selectMomentumEdges({ assets: scored, direction: "strong", limit: 3, threshold: 0.75 }).map((asset) =>
    asMomentumCard(asset, "long"),
  );
  const holdingUp =
    running.length === 0
      ? selectHoldingUpEdges({ assets: scored, limit: 3, threshold: 0.25 }).map((asset) => asMomentumCard(asset, "long"))
      : [];
  const lagging = selectMomentumEdges({ assets: scored, direction: "weak", limit: 3, threshold: 0.45 }).map((asset) =>
    asMomentumCard(asset, "short"),
  );

  const byMove = [...assets].sort((a, b) => b.priceChange24h - a.priceChange24h);
  const gainers = byMove.slice(0, 5).map(asMover);
  const losers = byMove
    .filter((asset) => asset.priceChange24h < 0)
    .sort((a, b) => a.priceChange24h - b.priceChange24h)
    .slice(0, 5)
    .map(asMover);

  return {
    assetsTracked: assets.length,
    running,
    holdingUp,
    lagging,
    gainers,
    losers,
  };
}

async function buildVaultPulse(req: NextRequest) {
  if (!isVaultsEnabled()) {
    return { enabled: false, candidates: [], totalTvl: 0, partial: false };
  }

  const result = await listVaultSummaries(resolveNetworkFromRequest(req.nextUrl));
  const candidates = [...result.vaults]
    .filter((vault) => vault.allowDeposits && !vault.isClosed)
    .sort((a, b) => b.metrics.score.score - a.metrics.score.score || b.metrics.tvl - a.metrics.tvl)
    .slice(0, 3)
    .map(asVaultCandidate);

  return {
    enabled: true,
    candidates,
    totalTvl: Math.round(result.vaults.reduce((sum, vault) => sum + vault.metrics.tvl, 0)),
    partial: result.partial,
  };
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-world-pulse",
    limit: 90,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const generatedAt = Date.now();
  try {
    const [marketResult, vaultResult] = await Promise.allSettled([
      buildMarketPulse(req),
      buildVaultPulse(req),
    ]);

    const market =
      marketResult.status === "fulfilled"
        ? marketResult.value
        : { assetsTracked: 0, running: [], lagging: [], gainers: [], losers: [] };
    const vaults =
      vaultResult.status === "fulfilled"
        ? vaultResult.value
        : { enabled: isVaultsEnabled(), candidates: [], totalTvl: 0, partial: true };

    return jsonSuccess(
      {
        generatedAt,
        mode: "world-beta",
        market,
        vaults,
        trust: ["Read-only", "No trading", "No wallet secrets"],
      },
      { cache: "public-market" },
    );
  } catch (error) {
    logServerError("api/world/pulse", error);
    return jsonError("World pulse is unavailable right now.", { status: 502, cache: "public-market" });
  }
}
