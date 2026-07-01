"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useAppConfig } from "@/context/AppConfigContext";
import { useMarket } from "@/context/MarketContext";
import { useWallet } from "@/context/WalletContext";
import AssetRow from "./AssetRow";
import AssetDetail from "./AssetDetail";
import type { MarketAsset, MarketRadarSignal, MomentumAlert, SpotAsset } from "@/types";
import {
  ALL_CATEGORIES,
  getAssetCategory,
  MIN_OI_USD,
  POLL_INTERVAL_MARKET,
  type AssetCategory,
} from "@/lib/constants";
import { formatCompact, formatPct, formatUSD } from "@/lib/format";
import { withNetworkParam } from "@/lib/hyperliquid";
import { reportClientError } from "@/lib/clientErrorReporter";
import {
  buildReactionSetupSignal,
  isDefaultReactionAsset,
  type ReactionLevelsPayload,
} from "@/lib/reactionLevels";
import type { MarketSetupSignal } from "@/lib/tradePlan";

type Mode = "perps" | "spot";

type PerpSortKey =
  | "coin"
  | "markPx"
  | "priceChange24h"
  | "openInterest"
  | "dayVolume"
  | "fundingRate"
  | "fundingAPR"
  | "signal";

type SpotSortKey = "symbol" | "markPx" | "priceChange24h" | "dayVolume" | "marketCap";

interface MarketTableProps {
  selectedAsset: string | null;
  onSelectAsset: (coin: string | null) => void;
  onTrade: (coin: string, direction: "long" | "short") => void;
}

const PERP_COLUMNS: { key: PerpSortKey; label: string; align: string }[] = [
  { key: "coin", label: "Asset", align: "text-left" },
  { key: "markPx", label: "Mark Price", align: "text-right" },
  { key: "priceChange24h", label: "24h %", align: "text-right" },
  { key: "openInterest", label: "OI (USD)", align: "text-right" },
  { key: "dayVolume", label: "Vol 24h", align: "text-right" },
  { key: "fundingRate", label: "Fund/hr", align: "text-right" },
  { key: "fundingAPR", label: "Fund APR", align: "text-right" },
  { key: "signal", label: "Signal", align: "text-left" },
];

const SPOT_COLUMNS: { key: SpotSortKey; label: string; align: string }[] = [
  { key: "symbol", label: "Asset", align: "text-left" },
  { key: "markPx", label: "Mark Price", align: "text-right" },
  { key: "priceChange24h", label: "24h %", align: "text-right" },
  { key: "dayVolume", label: "Vol 24h", align: "text-right" },
  { key: "marketCap", label: "Mkt Cap", align: "text-right" },
];

const SPOT_FILTERS: Array<AssetCategory | "All"> = ["All", ...ALL_CATEGORIES];
const REACTION_SCAN_INTERVAL_MS = POLL_INTERVAL_MARKET;
const REACTION_DEFAULT_SIGNAL: MarketSetupSignal = {
  type: "none",
  label: "Reaction defaults",
  detail: "BTC ETH SOL HYPE",
  tone: "neutral",
  level: null,
  distancePct: null,
  isActive: false,
};
const MOMENTUM_FLAG_MIN_VISIBLE_MS = 6 * 60 * 60 * 1000;
const MOMENTUM_FLAG_HARD_EXPIRE_MS = 24 * 60 * 60 * 1000;

function alertDirection(alert: MomentumAlert): "long" | "short" {
  return alert.payload?.direction === "short" ? "short" : "long";
}

function isMomentumFlagActive(alert: MomentumAlert): boolean {
  const createdAt = Number(alert.createdAt);
  if (!Number.isFinite(createdAt)) return false;
  const ageMs = Date.now() - createdAt;
  if (ageMs < 0 || ageMs > MOMENTUM_FLAG_HARD_EXPIRE_MS) return false;

  const currentPrice = alert.currentPrice ?? alert.currentPriceAtEval;
  const invalidationPrice = alert.invalidationPrice;
  const direction = alertDirection(alert);
  if (
    currentPrice != null &&
    invalidationPrice != null &&
    Number.isFinite(currentPrice) &&
    Number.isFinite(invalidationPrice)
  ) {
    if (direction === "long" && currentPrice <= invalidationPrice) return false;
    if (direction === "short" && currentPrice >= invalidationPrice) return false;
  }

  if (ageMs <= MOMENTUM_FLAG_MIN_VISIBLE_MS) return true;
  if (alert.returnSinceAlertPct == null || !Number.isFinite(alert.returnSinceAlertPct)) return true;
  return direction === "long" ? alert.returnSinceAlertPct > -0.5 : alert.returnSinceAlertPct < 0.5;
}

function momentumAlertToSetupSignal(alert: MomentumAlert): MarketSetupSignal {
  const direction = alertDirection(alert);
  const currentPrice = alert.currentPrice ?? alert.currentPriceAtEval;
  const targetDistancePct =
    currentPrice != null && alert.targetPrice != null && currentPrice > 0
      ? ((alert.targetPrice - currentPrice) / currentPrice) * 100
      : null;
  const returnText =
    alert.returnSinceAlertPct == null
      ? "saved momentum alert"
      : `${alert.returnSinceAlertPct >= 0 ? "+" : ""}${alert.returnSinceAlertPct.toFixed(1)}% since alert`;

  return {
    type: direction === "short" ? "momentum-short" : "momentum-long",
    label: direction === "short" ? "Saved short momentum" : "Saved long momentum",
    detail: `${returnText}. Alert price ${formatUSD(alert.alertPrice)}. ${
      alert.invalidationPrice ? `Invalid ${direction === "short" ? "above" : "below"} ${formatUSD(alert.invalidationPrice)}.` : "Invalidation unavailable."
    }`,
    tone: direction === "short" ? "red" : "green",
    level: alert.targetPrice ?? alert.alertPrice,
    distancePct: targetDistancePct,
    isActive: true,
  };
}

function getPerpSortValue(asset: MarketAsset, key: PerpSortKey): number | string {
  switch (key) {
    case "coin":
      return asset.coin;
    case "signal":
      return asset.signal.label;
    default:
      return asset[key];
  }
}

function getSpotSortValue(asset: SpotAsset, key: SpotSortKey): number | string {
  return asset[key];
}

function getSpotAssetCategory(asset: SpotAsset): AssetCategory {
  if (asset.category === "Stocks" || asset.category === "Indices/ETFs") return "Equities";
  if (asset.category === "Metals" || asset.category === "Energy" || asset.category === "Commodities") return "Commodities";
  if (asset.category === "Crypto") return "Crypto";
  return getAssetCategory(asset.symbol);
}

export default function MarketTable({
  selectedAsset,
  onSelectAsset,
  onTrade,
}: MarketTableProps) {
  const router = useRouter();
  const { tradingEnabled } = useAppConfig();
  const { assets, loading, fundingHistories } = useMarket();
  const { isConnected } = useWallet();
  const tradingActive = tradingEnabled && isConnected;

  const [mode, setMode] = useState<Mode>("perps");
  const [search, setSearch] = useState("");

  const [perpSortKey, setPerpSortKey] = useState<PerpSortKey>("openInterest");
  const [perpSortAsc, setPerpSortAsc] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | "All">("Crypto");
  const [hideSmallCaps, setHideSmallCaps] = useState(true);

  const [spotAssets, setSpotAssets] = useState<SpotAsset[]>([]);
  const [spotLoading, setSpotLoading] = useState(false);
  const [spotSortKey, setSpotSortKey] = useState<SpotSortKey>("dayVolume");
  const [spotSortAsc, setSpotSortAsc] = useState(false);
  const [spotFilter, setSpotFilter] = useState<AssetCategory | "All">("All");
  const [setupSignals, setSetupSignals] = useState<Record<string, MarketSetupSignal>>({});
  const [momentumSignals, setMomentumSignals] = useState<Record<string, MarketSetupSignal>>({});
  const [radarVolumeByAsset, setRadarVolumeByAsset] = useState<Record<string, number>>({});
  const setupScanRef = useRef({ key: "", timestamp: 0 });

  const fetchSpot = useCallback(async () => {
    try {
      setSpotLoading(true);
      const res = await fetch(withNetworkParam("/api/spot"));
      if (!res.ok) throw new Error(`Spot HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.assets)) {
        setSpotAssets(data.assets as SpotAsset[]);
      }
    } catch (err) {
      reportClientError("spot.fetch", err);
    } finally {
      setSpotLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== "spot") return;
    fetchSpot();
    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      fetchSpot();
    }, POLL_INTERVAL_MARKET);
    return () => clearInterval(interval);
  }, [mode, fetchSpot]);

  useEffect(() => {
    if (mode !== "perps") return;
    let cancelled = false;

    async function fetchSavedMomentumFlags() {
      const response = await fetch("/api/alerts/momentum?limit=100");
      if (!response.ok) return;
      const payload = (await response.json()) as { alerts?: MomentumAlert[] };
      const nextSignals: Record<string, MarketSetupSignal> = {};
      for (const alert of payload.alerts ?? []) {
        const asset = alert.asset.toUpperCase();
        if (!isMomentumFlagActive(alert)) continue;
        if (nextSignals[asset] && nextSignals[asset].isActive) continue;
        nextSignals[asset] = momentumAlertToSetupSignal(alert);
      }
      if (!cancelled) setMomentumSignals(nextSignals);
    }

    fetchSavedMomentumFlags().catch((error) => reportClientError("market.momentum-flags", error));
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      fetchSavedMomentumFlags().catch((error) => reportClientError("market.momentum-flags", error));
    }, REACTION_SCAN_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "perps") return;
    let cancelled = false;

    async function fetchRadarVolumeProfiles() {
      const response = await fetch(withNetworkParam("/api/market/radar"));
      if (!response.ok) return;
      const payload = (await response.json()) as { signals?: MarketRadarSignal[] };
      const next: Record<string, number> = {};
      for (const signal of payload.signals ?? []) {
        const volumeVsAvg = signal.scoreDetails?.volumeVsAvg;
        if (volumeVsAvg == null || !Number.isFinite(volumeVsAvg)) continue;
        next[signal.asset.toUpperCase()] = volumeVsAvg;
      }
      if (!cancelled) setRadarVolumeByAsset(next);
    }

    fetchRadarVolumeProfiles().catch((error) => reportClientError("market.radar-volume", error));
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      fetchRadarVolumeProfiles().catch((error) => reportClientError("market.radar-volume", error));
    }, POLL_INTERVAL_MARKET);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [mode]);

  const availableSpotFilters = useMemo(() => {
    const categories = new Set(spotAssets.map((asset) => getSpotAssetCategory(asset)));
    return SPOT_FILTERS.filter((filter) => filter === "All" || categories.has(filter));
  }, [spotAssets]);

  useEffect(() => {
    if (mode === "spot" && !spotLoading && spotAssets.length === 0) {
      setMode("perps");
      setSpotFilter("All");
    }
  }, [mode, spotAssets.length, spotLoading]);

  const perpsFiltered = useMemo(() => {
    let arr = [...assets];

    if (search) {
      const q = search.toUpperCase();
      arr = arr.filter((a) => a.coin.includes(q));
    }

    if (categoryFilter !== "All") {
      arr = arr.filter((a) => getAssetCategory(a.coin) === categoryFilter);
    }

    if (hideSmallCaps && !search) {
      // HIP-3 builder markets are a deliberately curated set the user wants
      // visible; only apply the OI floor to the main crypto perps.
      arr = arr.filter(
        (a) => a.marketType === "hip3_perp" || a.openInterest >= MIN_OI_USD,
      );
    }

    arr.sort((a, b) => {
      const aVal = getPerpSortValue(a, perpSortKey);
      const bVal = getPerpSortValue(b, perpSortKey);
      if (typeof aVal === "string" && typeof bVal === "string") {
        return perpSortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return perpSortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return arr;
  }, [assets, search, categoryFilter, hideSmallCaps, perpSortKey, perpSortAsc]);

  const reactionAssetCoins = useMemo(
    () => perpsFiltered.filter((asset) => isDefaultReactionAsset(asset.coin)).map((asset) => asset.coin),
    [perpsFiltered],
  );
  const reactionAssetKey = reactionAssetCoins.join(",");

  useEffect(() => {
    if (mode !== "perps" || reactionAssetKey.length === 0) return;
    let cancelled = false;

    async function scanReactionLevels() {
      const bucket = Math.floor(Date.now() / REACTION_SCAN_INTERVAL_MS);
      const coins = reactionAssetKey.split(",").filter(Boolean);
      const nextSignals: Record<string, MarketSetupSignal> = {};
      const scanKey = `${reactionAssetKey}:${bucket}`;
      if (setupScanRef.current.key === scanKey) return;
      setupScanRef.current.key = scanKey;
      setupScanRef.current.timestamp = Date.now();

      const response = await fetch(
        withNetworkParam(
          `/api/market/reaction-levels?coins=${encodeURIComponent(coins.join(","))}&window=4h`,
        ),
      );
      if (!response.ok) return;
      const payload = (await response.json()) as { assets?: Record<string, ReactionLevelsPayload> };
      for (const [coin, reactionPayload] of Object.entries(payload.assets ?? {})) {
        nextSignals[coin.toUpperCase()] = buildReactionSetupSignal(reactionPayload);
      }

      if (!cancelled) {
        setSetupSignals((prev) => ({ ...prev, ...nextSignals }));
      }
    }

    scanReactionLevels().catch((error) => reportClientError("market.reaction-scan", error));
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      scanReactionLevels().catch((error) => reportClientError("market.reaction-scan", error));
    }, REACTION_SCAN_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [mode, reactionAssetKey]);

  const spotFiltered = useMemo(() => {
    let arr = [...spotAssets];

    if (search) {
      const q = search.toUpperCase();
      arr = arr.filter(
        (a) => a.symbol.toUpperCase().includes(q) || a.name.toUpperCase().includes(q)
      );
    }

    if (spotFilter !== "All") {
      arr = arr.filter((a) => getSpotAssetCategory(a) === spotFilter);
    }

    arr.sort((a, b) => {
      const aVal = getSpotSortValue(a, spotSortKey);
      const bVal = getSpotSortValue(b, spotSortKey);
      if (typeof aVal === "string" && typeof bVal === "string") {
        return spotSortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return spotSortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return arr;
  }, [spotAssets, search, spotFilter, spotSortKey, spotSortAsc]);

  const perpsTotalOI = useMemo(
    () => perpsFiltered.reduce((sum, a) => sum + a.openInterest, 0),
    [perpsFiltered]
  );
  const spotTotalMcap = useMemo(
    () => spotFiltered.reduce((sum, a) => sum + a.marketCap, 0),
    [spotFiltered]
  );

  const perpsLoading = loading;
  const activeLoading = mode === "perps" ? perpsLoading : spotLoading;
  const spotModeAvailable = true;

  if (activeLoading) {
    return (
      <div className="p-3 space-y-1.5 h-full overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="h-8 skeleton rounded" />
        ))}
      </div>
    );
  }

  const perpsTotalColumns = PERP_COLUMNS.length + 1 + (tradingEnabled ? 1 : 0);

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 border-b border-zinc-800 bg-zinc-950">
          <div className="relative shrink-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-2 py-1 w-40 sm:w-48 text-[11px] font-mono bg-zinc-900 border border-zinc-800 rounded text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent/70"
            />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setMode("perps")}
              className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                mode === "perps"
                  ? "bg-accent/15 text-accent ring-1 ring-inset ring-accent/35"
                  : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
              }`}
            >
              Perps
            </button>
            {spotModeAvailable && (
              <button
                onClick={() => setMode("spot")}
                className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                  mode === "spot"
                    ? "bg-accent/15 text-accent ring-1 ring-inset ring-accent/35"
                    : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
                }`}
              >
                Spot
              </button>
            )}
          </div>

          {mode === "perps" ? (
            <>
              <div className="min-w-0 flex-1 flex items-center gap-1 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => setCategoryFilter("All")}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap transition-colors ${
                    categoryFilter === "All"
                      ? "bg-accent/15 text-accent ring-1 ring-inset ring-accent/35"
                      : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
                  }`}
                >
                  All
                </button>
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap transition-colors ${
                      categoryFilter === cat
                        ? "bg-accent/15 text-accent ring-1 ring-inset ring-accent/35"
                        : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideSmallCaps}
                    onChange={(e) => setHideSmallCaps(e.target.checked)}
                    className="w-3 h-3 rounded border-zinc-600 bg-zinc-800 accent-[#7dd4c4]"
                  />
                  <span className="text-[11px] text-zinc-500 whitespace-nowrap">
                    $10M+ open interest
                  </span>
                </label>
              </div>
            </>
          ) : (
            <div className="min-w-0 flex-1 flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {availableSpotFilters.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSpotFilter(cat)}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap transition-colors ${
                    spotFilter === cat
                      ? "bg-accent/15 text-accent ring-1 ring-inset ring-accent/35"
                      : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>


        <div className="flex-1 overflow-auto">
          {mode === "perps" ? (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-zinc-950 z-10">
                <tr className="text-[10px] uppercase tracking-wider text-zinc-500 font-sans">
                  {PERP_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => {
                        if (perpSortKey === col.key) {
                          setPerpSortAsc(!perpSortAsc);
                        } else {
                          setPerpSortKey(col.key);
                          setPerpSortAsc(false);
                        }
                      }}
                      className={`px-2.5 py-1.5 cursor-pointer hover:text-zinc-300 transition-colors select-none whitespace-nowrap ${col.align}`}
                    >
                      {col.label}
                      {perpSortKey === col.key && (
                        <span className="ml-1 text-accent">
                          {perpSortAsc ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                  ))}
                  <th className="px-2.5 py-1.5 text-left whitespace-nowrap">Setup</th>
                  {tradingEnabled && (
                    <th className="px-2.5 py-1.5 text-left whitespace-nowrap">Trade</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {perpsFiltered.map((asset, index) => {
                  const setupSignal =
                    momentumSignals[asset.coin] ??
                    (isDefaultReactionAsset(asset.coin) ? setupSignals[asset.coin] ?? REACTION_DEFAULT_SIGNAL : null);

                  return (
                    <AssetRow
                      key={asset.coin}
                      asset={asset}
                      index={index}
                      isExpanded={selectedAsset === asset.coin}
                      onSelect={() => onSelectAsset(selectedAsset === asset.coin ? null : asset.coin)}
                      onOpenWorkspace={asset.coin === "HYPE" ? () => router.push("/hype") : undefined}
                      onTrade={(direction) => onTrade(asset.coin, direction)}
                      tradingEnabled={tradingActive && asset.marketType !== "hip3_perp"}
                      fundingHistory={fundingHistories[asset.coin]}
                      setupSignal={setupSignal}
                      volumeVsAvg={radarVolumeByAsset[asset.coin]}
                      detailNode={
                        selectedAsset === asset.coin ? (
                          <tr key={`${asset.coin}-detail`} id={`market-asset-${asset.coin.replace(/[^a-zA-Z0-9_-]/g, "-")}`}>
                            <td colSpan={perpsTotalColumns} className="p-0">
                              <div className="sticky left-0 w-[min(100%,calc(100vw-2rem))] min-w-0">
                                <AssetDetail
                                  asset={asset}
                                  fundingHistory={fundingHistories[asset.coin]}
                                  onClose={() => onSelectAsset(null)}
                                />
                              </div>
                            </td>
                          </tr>
                        ) : null
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-zinc-950 z-10">
                <tr className="text-[10px] uppercase tracking-wider text-zinc-500 font-sans">
                  {SPOT_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => {
                        if (spotSortKey === col.key) {
                          setSpotSortAsc(!spotSortAsc);
                        } else {
                          setSpotSortKey(col.key);
                          setSpotSortAsc(false);
                        }
                      }}
                      className={`px-2.5 py-1.5 cursor-pointer hover:text-zinc-300 transition-colors select-none whitespace-nowrap ${col.align}`}
                    >
                      {col.label}
                      {spotSortKey === col.key && (
                        <span className="ml-1 text-accent">
                          {spotSortAsc ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                  ))}
                  <th className="px-2.5 py-1.5 text-left whitespace-nowrap">Category</th>
                  <th className="px-2.5 py-1.5 text-left whitespace-nowrap">Market</th>
                </tr>
              </thead>
              <tbody>
                {spotFiltered.map((asset) => {
                  const priceColor =
                    asset.priceChange24h > 0
                      ? "text-green-500"
                      : asset.priceChange24h < 0
                        ? "text-red-500"
                        : "text-zinc-50";
                  const decimals = asset.markPx < 0.01 ? 6 : asset.markPx < 1 ? 4 : 2;

                  return (
                    <tr
                      key={asset.marketIndex}
                      className="h-9 border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors text-xs font-mono"
                    >
                      <td className="px-2.5 py-0.5 text-zinc-50 font-medium whitespace-nowrap">{asset.symbol}</td>
                      <td className="px-2.5 py-0.5 text-right text-zinc-50 whitespace-nowrap">
                        {formatUSD(asset.markPx, decimals)}
                      </td>
                      <td className={`px-2.5 py-0.5 text-right whitespace-nowrap ${priceColor}`}>
                        {formatPct(asset.priceChange24h)}
                      </td>
                      <td className="px-2.5 py-0.5 text-right text-zinc-300 whitespace-nowrap">
                        {formatCompact(asset.dayVolume)}
                      </td>
                      <td className="px-2.5 py-0.5 text-right text-zinc-300 whitespace-nowrap">
                        {formatCompact(asset.marketCap)}
                      </td>
                      <td className="px-2.5 py-0.5 text-zinc-400 whitespace-nowrap">{getSpotAssetCategory(asset)}</td>
                      <td className="px-2.5 py-0.5 text-zinc-500 whitespace-nowrap">{asset.market}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {mode === "perps" && perpsFiltered.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-zinc-600 font-mono">
              No perp assets match your filters
            </div>
          )}

          {mode === "spot" && spotFiltered.length === 0 && (
            <div className="flex h-32 flex-col items-center justify-center gap-1 px-4 text-center font-mono text-sm text-zinc-600">
              <div>No spot markets match your filters</div>
              <div className="max-w-xl text-[11px] font-sans text-zinc-500">
                HyperPulse lists crypto, equities, commodities, and FX/rates markets when Hyperliquid exposes them.
              </div>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-between px-2.5 py-1 text-[10px] text-zinc-600 font-mono border-t border-zinc-800">
          {mode === "perps" ? (
            <>
              <span>{perpsFiltered.length} of {assets.length} perps</span>
              <span>Open interest: {formatCompact(perpsTotalOI)}</span>
            </>
          ) : (
            <>
              <span>{spotFiltered.length} of {spotAssets.length} spot assets</span>
              <span>Market cap: {formatCompact(spotTotalMcap)}</span>
            </>
          )}
        </div>
      </div>
    </>
  );
}
