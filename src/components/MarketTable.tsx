"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import { useWallet } from "@/context/WalletContext";
import AssetRow from "./AssetRow";
import AssetDetail from "./AssetDetail";
import WalletModal from "./WalletModal";
import type { MarketAsset } from "@/types";
import {
  ALL_CATEGORIES,
  getAssetCategory,
  MIN_OI_USD,
  type AssetCategory,
} from "@/lib/constants";
import { formatCompact } from "@/lib/format";

type SortKey =
  | "coin"
  | "markPx"
  | "priceChange24h"
  | "openInterest"
  | "oiChangePct"
  | "dayVolume"
  | "fundingRate"
  | "fundingAPR"
  | "signal";

interface MarketTableProps {
  selectedAsset: string | null;
  onSelectAsset: (coin: string | null) => void;
  onTrade: (coin: string, direction: "long" | "short") => void;
}

const COLUMNS: { key: SortKey; label: string; align: string }[] = [
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

function getSortValue(asset: MarketAsset, key: SortKey): number | string {
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

export default function MarketTable({
  selectedAsset,
  onSelectAsset,
  onTrade,
}: MarketTableProps) {
  const { assets, loading, fundingHistories } = useMarket();
  const { isConnected } = useWallet();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("openInterest");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | "All">(
    "All"
  );
  const [hideSmallCaps, setHideSmallCaps] = useState(true);

  const filtered = useMemo(() => {
    let arr = [...assets];

    if (search) {
      const q = search.toUpperCase();
      arr = arr.filter((a) => a.coin.includes(q));
    }

    if (categoryFilter != "All") {
      arr = arr.filter((a) => getAssetCategory(a.coin) === categoryFilter);
    }

    if (hideSmallCaps) {
      arr = arr.filter((a) => a.openInterest >= MIN_OI_USD);
    }

    arr.sort((a, b) => {
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return arr;
  }, [assets, sortKey, sortAsc, search, categoryFilter, hideSmallCaps]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const handleRowClick = (coin: string) => {
    onSelectAsset(selectedAsset === coin ? null : coin);
  };

  const totalOI = useMemo(
    () => filtered.reduce((sum, a) => sum + a.openInterest, 0),
    [filtered]
  );

  if (loading) {
    return (
      <div className="p-4 space-y-2 h-full overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="h-9 skeleton rounded" />
        ))}
      </div>
    );
  }

  const totalColumns = COLUMNS.length + 2;

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-950">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-2 py-1 w-[140px] text-xs font-mono bg-zinc-900 border border-zinc-800 rounded text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>

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
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-zinc-950 z-10">
              <tr className="text-[11px] uppercase tracking-wider text-zinc-500 font-sans">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-3 py-2 cursor-pointer hover:text-zinc-300 transition-colors select-none whitespace-nowrap ${col.align}`}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="ml-1 text-blue-500">
                        {sortAsc ? "↑" : "↓"}
                      </span>
                    )}
                  </th>
                ))}
                <th className="px-3 py-2 text-left whitespace-nowrap">7d Chart</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Trade</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset, index) => (
                <AssetRow
                  key={asset.coin}
                  asset={asset}
                  index={index}
                  isExpanded={selectedAsset === asset.coin}
                  onSelect={() => handleRowClick(asset.coin)}
                  onTrade={(direction) => onTrade(asset.coin, direction)}
                  onConnectRequest={() => setShowWalletModal(true)}
                  walletConnected={isConnected}
                  fundingHistory={fundingHistories[asset.coin]}
                  detailNode={
                    selectedAsset === asset.coin ? (
                      <tr key={`${asset.coin}-detail`}>
                        <td colSpan={totalColumns} className="p-0">
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
          {filtered.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-zinc-600 font-mono">
              No assets match your filters
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 text-[11px] text-zinc-600 font-mono border-t border-zinc-800">
          <span>
            {filtered.length} of {assets.length} assets
          </span>
          <span>Total OI: {formatCompact(totalOI)}</span>
        </div>
      </div>

      {showWalletModal && <WalletModal onClose={() => setShowWalletModal(false)} />}
    </>
  );
}
