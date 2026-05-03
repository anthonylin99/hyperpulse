import { NextRequest } from "next/server";
import { MIN_OI_USD } from "@/lib/constants";
import { isWhalesEnabled } from "@/lib/appConfig";
import { getInfoClient, resolveNetworkFromRequest } from "@/lib/hyperliquid";
import { enforceRateLimit, jsonError, jsonSuccess, logServerError } from "@/lib/security";
import { listPositioningAlerts } from "@/lib/whaleStore";
import type { MarketRadarSignal, WhaleSeverity } from "@/types";

export const dynamic = "force-dynamic";

type ParsedAsset = {
  coin: string;
  markPx: number;
  priceChange24h: number;
  fundingAPR: number;
  openInterestUsd: number;
  dayVolumeUsd: number;
};

function parseAssetRows(data: unknown): ParsedAsset[] {
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

      return {
        coin: asset.name,
        markPx,
        priceChange24h: prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0,
        fundingAPR: Number.isFinite(fundingRate) ? fundingRate * 8760 * 100 : 0,
        openInterestUsd: Number.isFinite(openInterest) ? openInterest : 0,
        dayVolumeUsd: Number(ctx.dayNtlVlm) || 0,
      };
    })
    .filter((asset): asset is ParsedAsset => asset != null);
}

function severityFromAbsPct(value: number): WhaleSeverity {
  const abs = Math.abs(value);
  if (abs >= 8) return "high";
  if (abs >= 4) return "medium";
  return "low";
}

function formatPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatCompactUsd(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function buildAssetSignal(kind: MarketRadarSignal["kind"], asset: ParsedAsset, label: string, timestamp: number): MarketRadarSignal {
  const value = kind === "crowded_long" || kind === "crowded_short" ? `${asset.fundingAPR.toFixed(1)}% APR` : formatPct(asset.priceChange24h);
  return {
    id: `${kind}:${asset.coin}:${timestamp}`,
    kind,
    asset: asset.coin,
    label,
    value,
    severity: severityFromAbsPct(kind === "crowded_long" || kind === "crowded_short" ? asset.fundingAPR : asset.priceChange24h),
    timestamp,
    evidence: [
      `${formatCompactUsd(asset.openInterestUsd)} open interest`,
      `${formatCompactUsd(asset.dayVolumeUsd)} 24h volume`,
      `24h move ${formatPct(asset.priceChange24h)}`,
    ],
    routeHref: `/markets?asset=${encodeURIComponent(asset.coin)}`,
  };
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {
    key: "api-market-radar",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const info = getInfoClient(resolveNetworkFromRequest(req.nextUrl));
    const rows = parseAssetRows(await info.metaAndAssetCtxs()).filter((asset) => asset.openInterestUsd >= MIN_OI_USD);
    const timestamp = Date.now();
    const signals: MarketRadarSignal[] = [];

    const strongest = [...rows].sort((a, b) => b.priceChange24h - a.priceChange24h)[0];
    const weakest = [...rows].sort((a, b) => a.priceChange24h - b.priceChange24h)[0];
    const crowdedLong = [...rows].sort((a, b) => b.fundingAPR - a.fundingAPR)[0];
    const crowdedShort = [...rows].sort((a, b) => a.fundingAPR - b.fundingAPR)[0];

    if (strongest) signals.push(buildAssetSignal("strongest_asset", strongest, "Strongest liquid perp", timestamp));
    if (weakest) signals.push(buildAssetSignal("weakest_asset", weakest, "Weakest liquid perp", timestamp));
    if (crowdedLong) signals.push(buildAssetSignal("crowded_long", crowdedLong, "Most expensive long crowd", timestamp));
    if (crowdedShort) signals.push(buildAssetSignal("crowded_short", crowdedShort, "Most paid short crowd", timestamp));

    if (isWhalesEnabled()) {
      const alerts = await listPositioningAlerts({ timeframeMs: 24 * 60 * 60 * 1000, limit: 40 });
      const whale = alerts.find((alert) => alert.alertType === "high_conviction_whale");
      const liquidation = alerts.find((alert) => alert.alertType === "liquidation_pressure");
      if (whale) {
        signals.push({
          id: `whale_flow:${whale.id}`,
          kind: "whale_flow",
          asset: whale.asset,
          label: "Tracked whale flow",
          value: whale.severity.toUpperCase(),
          severity: whale.severity,
          timestamp: whale.timestamp,
          evidence: [whale.whyItMatters, whale.walletLabel ?? "tracked wallet"].filter(Boolean),
          routeHref: whale.walletAddress ? `/whales/${whale.walletAddress}?alert=${whale.id}` : `/markets?asset=${whale.asset}`,
        });
      }
      if (liquidation) {
        signals.push({
          id: `liquidation_pressure:${liquidation.id}`,
          kind: "liquidation_pressure",
          asset: liquidation.asset,
          label: "Nearby liquidation pressure",
          value: liquidation.severity.toUpperCase(),
          severity: liquidation.severity,
          timestamp: liquidation.timestamp,
          evidence: [liquidation.whyItMatters],
          routeHref: `/markets?asset=${liquidation.asset}`,
        });
      }
    }

    return jsonSuccess({
      signals,
      generatedAt: timestamp,
      source: isWhalesEnabled() ? "market-plus-tracked-flow" : "market-only",
      factorsIncluded: false,
    });
  } catch (error) {
    logServerError("api/market/radar", error);
    return jsonError("Unable to build market radar right now.", { status: 502 });
  }
}
