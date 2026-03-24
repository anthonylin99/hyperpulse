"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import { useWallet } from "@/context/WalletContext";
import AssetRow from "./AssetRow";
import AssetDetail from "./AssetDetail";
import WalletModal from "./WalletModal";
import type { MarketAsset, SpotAsset, SpotCategory } from "@/types";
import {
  ALL_CATEGORIES,
  getAssetCategory,
  MIN_OI_USD,
  POLL_INTERVAL_MARKET,
  type AssetCategory,
} from "@/lib/constants";
import { formatCompact, formatPct, formatUSD } from "@/lib/format";

type Mode = "perps" | "spot";

type PerpSortKey =
  | "coin"
  | "markPx"
  | "priceChange24h"
  | "openInterest"
  | "oiChangePct"
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
  { key: "oiChangePct", label: "OI Δ", align: "text-right" },
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

const SPOT_FILTERS: Array<SpotCategory | "All"> = [
  "All",
  "Stocks",
  "Commodities",
  "Crypto",
  "Other",
];

function getPerpSortValue(asset: MarketAsset, key: PerpSortKey): number | string {
  switch (key) {
    case "coin":
      return asset.coin;
    case "signal":
      return asset.signal.label;
    case "oiChangePct":
      return asset.oiChangePct ?? 0;
    default:
      return asset[key];
  }
}

function getSpotSortValue(asset: SpotAsset, key: SpotSortKey): number | string {
  return asset[key];
}

export default function MarketTable({
  selectedAsset,
  onSelectAsset,
  onTrade,
}: MarketTableProps) {
  const { assets, loading, fundingHistories } = useMarket();
  const { isConnected } = useWallet();

  const [mode, setMode] = useState<Mode>("perps");
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [search, setSearch] = useState("");

  const [perpSortKey, setPerpSortKey] = useState<PerpSortKey>("openInterest");
  const [perpSortAsc, setPerpSortAsc] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | "All">(
    "All"
  );
  const [hideSmallCaps, setHideSmallCaps] = useState(true);

  const [spotAssets, setSpotAssets] = useState<SpotAsset[]>([]);
  const [spotLoading, setSpotLoading] = useState(false);
  const [spotSortKey, setSpotSortKey] = useState<SpotSortKey>("dayVolume");
  const [spotSortAsc, setSpotSortAsc] = useState(false);
  const [spotFilter, setSpotFilter] = useState<SpotCategory | "All">("All");

  const fetchSpot = useCallback(async () => {
    try {
      setSpotLoading(true);
      const res = await fetch("/api/spot");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.assets)) {
        setSpotAssets(data.assets as SpotAsset[]);
      }
    } finally {
      setSpotLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== "spot") return;
    fetchSpot();
    const interval = setInterval(fetchSpot, POLL_INTERVAL_MARKET);
    return () => clearInterval(interval);
  }, [mode, fetchSpot]);

  const perpsFiltered = useMemo(() => {
    let arr = [...assets];

    if (search) {
      const q = search.toUpperCase();
      arr = arr.filter((a) => a.coin.includes(q));
    }

    if (categoryFilter !== "All") {
      arr = arr.filter((a) => getAssetCategory(a.coin) === categoryFilter);
    }

    if (hideSmallCaps) {
      arr = arr.filter((a) => a.openInterest >= MIN_OI_USD);
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

  const spotFiltered = useMemo(() => {
    let arr = [...spotAssets];

    if (search) {
      const q = search.toUpperCase();
      arr = arr.filter(
        (a) => a.symbol.toUpperCase().includes(q) || a.name.toUpperCase().includes(q)
      );
    }

    if (spotFilter !== "All") {
      arr = arr.filter((a) => a.category === spotFilter);
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

  if (activeLoading) {
    return (
      <div className="p-4 space-y-2 h-full overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="h-9 skeleton rounded" />
        ))}
      </div>
    );
  }

  const perpsTotalColumns = PERP_COLUMNS.length + 2;

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-950">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder={mode === "perps" ? "Search perps..." : "Search HIP-3 spot..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-2 py-1 w-[180px] text-xs font-mono bg-zinc-900 border border-zinc-800 rounded text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setMode("perps")}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                mode === "perps"
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
              }`}
            >
              Perps
            </button>
            <button
              onClick={() => setMode("spot")}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                mode === "spot"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
              }`}
            >
              Spot (HIP-3)
            </button>
          </div>

          {mode === "perps" ? (
            <>
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => setCategoryFilter("All")}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap transition-colors ${
                    categoryFilter === "All"
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
                  }`}
                >
                  All
                </button>
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap transition-colors ${
                      categoryFilter === cat
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideSmallCaps}
                    onChange={(e) => setHideSmallCaps(e.target.checked)}
                    className="w-3 h-3 rounded border-zinc-600 bg-zinc-800 accent-blue-500"
                  />
                  <span className="text-[11px] text-zinc-500 whitespace-nowrap">
                    &gt;$10M OI
                  </span>
                </label>
              </div>
            </>
          ) : (
            <div className="ml-auto flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {SPOT_FILTERS.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSpotFilter(cat)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap transition-colors ${
                    spotFilter === cat
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
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
                <tr className="text-[11px] uppercase tracking-wider text-zinc-500 font-sans">
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
                      className={`px-3 py-2 cursor-pointer hover:text-zinc-300 transition-colors select-none whitespace-nowrap ${col.align}`}
                    >
                      {col.label}
                      {perpSortKey === col.key && (
                        <span className="ml-1 text-blue-500">
                          {perpSortAsc ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left whitespace-nowrap">7d Chart</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Trade</th>
                </tr>
              </thead>
              <tbody>
                {perpsFiltered.map((asset, index) => (
                  <AssetRow
                    key={asset.coin}
                    asset={asset}
                    index={index}
                    isExpanded={selectedAsset === asset.coin}
                    onSelect={() => onSelectAsset(selectedAsset === asset.coin ? null : asset.coin)}
                    onTrade={(direction) => onTrade(asset.coin, direction)}
                    onConnectRequest={() => setShowWalletModal(true)}
                    walletConnected={isConnected}
                    fundingHistory={fundingHistories[asset.coin]}
                    detailNode={
                      selectedAsset === asset.coin ? (
                        <tr key={`${asset.coin}-detail`}>
                          <td colSpan={perpsTotalColumns} className="p-0">
                            <AssetDetail
                              asset={asset}
                              fundingHistory={fundingHistories[asset.coin]}
                              onClose={() => onSelectAsset(null)}
                            />
                          </td>
                        </tr>
                      ) : null
                    }
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-zinc-950 z-10">
                <tr className="text-[11px] uppercase tracking-wider text-zinc-500 font-sans">
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
                      className={`px-3 py-2 cursor-pointer hover:text-zinc-300 transition-colors select-none whitespace-nowrap ${col.align}`}
                    >
                      {col.label}
                      {spotSortKey === col.key && (
                        <span className="ml-1 text-emerald-500">
                          {spotSortAsc ? "↑" : "↓"}
                        </span>
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left whitespace-nowrap">Category</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Market</th>
                </tr>
              </thead>
              <tbody>
                {spotFiltered.map((asset, index) => {
                  const rowBg = index % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/50";
                  const priceColor =
                    asset.priceChange24h > 0
                      ? "text-green-500"
                      : asset.priceChange24h < 0
                        ? "text-red-500"
                        : "text-zinc-50";
                  const decimals = asset.markPx < 0.01 ? 6 : asset.markPx < 1 ? 4 : 2;

                  return (
                    <tr
                      key={asset.symbol}
                      className={`h-9 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors text-sm font-mono ${rowBg}`}
                    >
                      <td className="px-3 py-1 text-zinc-50 font-medium whitespace-nowrap">{asset.symbol}</td>
                      <td className="px-3 py-1 text-right text-zinc-50 whitespace-nowrap">
                        {formatUSD(asset.markPx, decimals)}
                      </td>
                      <td className={`px-3 py-1 text-right whitespace-nowrap ${priceColor}`}>
                        {formatPct(asset.priceChange24h)}
                      </td>
                      <td className="px-3 py-1 text-right text-zinc-300 whitespace-nowrap">
                        {formatCompact(asset.dayVolume)}
                      </td>
                      <td className="px-3 py-1 text-right text-zinc-300 whitespace-nowrap">
                        {formatCompact(asset.marketCap)}
                      </td>
                      <td className="px-3 py-1 text-zinc-400 whitespace-nowrap">{asset.category}</td>
                      <td className="px-3 py-1 text-zinc-500 whitespace-nowrap">{asset.market}</td>
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
            <div className="flex items-center justify-center h-32 text-sm text-zinc-600 font-mono">
              No HIP-3 spot assets match your filters
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 text-[11px] text-zinc-600 font-mono border-t border-zinc-800">
          {mode === "perps" ? (
            <>
              <span>{perpsFiltered.length} of {assets.length} perps</span>
              <span>Total OI: {formatCompact(perpsTotalOI)}</span>
            </>
          ) : (
            <>
              <span>{spotFiltered.length} of {spotAssets.length} HIP-3 spot assets</span>
              <span>Total Mkt Cap: {formatCompact(spotTotalMcap)}</span>
            </>
          )}
        </div>
      </div>

      {showWalletModal && <WalletModal onClose={() => setShowWalletModal(false)} />}
    </>
  );
}
