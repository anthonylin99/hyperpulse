"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { X } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { MarketAsset } from "@/types";
import { cn, formatCompactUsd, formatUSD, formatPct, formatFundingRate, formatFundingAPR } from "@/lib/format";
import { getFundingRegime } from "@/lib/fundingRegime";
import { withNetworkParam } from "@/lib/hyperliquid";
import {
  computePositioningContext,
  formatPositioningDepth,
  type OrderbookSnapshot,
} from "@/lib/positioningContext";
import PriceChart from "./PriceChart";
import { CompactStat, FilterChip, SectionEyebrow } from "@/components/trading-ui";

interface AssetDetailProps {
  asset: MarketAsset;
  fundingHistory?: { time: number; rate: number }[];
  onClose: () => void;
}

type PricePoint = {
  time: number;
  price: number;
};

const FUNDING_RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
] as const;

export default function AssetDetail({
  asset,
  fundingHistory,
  onClose,
}: AssetDetailProps) {
  const [fundingRange, setFundingRange] = useState<7 | 30 | 60>(7);
  const [extendedFunding, setExtendedFunding] = useState<{ time: number; rate: number }[] | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [loadingFunding, setLoadingFunding] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [loadingOrderbook, setLoadingOrderbook] = useState(false);
  const [orderbook, setOrderbook] = useState<OrderbookSnapshot | null>(null);
  const [orderbookError, setOrderbookError] = useState<string | null>(null);
  const [tab, setTab] = useState<"price" | "funding" | "leverage">("price");
  const [fundingView, setFundingView] = useState<"apr" | "hourly">("apr");

  const priceDecimals = asset.markPx < 0.01 ? 6 : asset.markPx < 1 ? 4 : 2;
  const priceColor =
    asset.priceChange24h > 0
      ? "text-green-500"
      : asset.priceChange24h < 0
        ? "text-red-500"
        : "text-zinc-50";

  const fetchExtendedFunding = useCallback(async (days: number) => {
    if (days === 7) {
      setExtendedFunding(null);
      return;
    }
    setLoadingFunding(true);
    try {
      const now = Date.now();
      const startTime = now - days * 24 * 60 * 60 * 1000;
      const res = await fetch(
        withNetworkParam(
          `/api/market/funding?coin=${asset.coin}&startTime=${startTime}&endTime=${now}`,
        )
      );
      if (!res.ok) return;
      const data = await res.json();
      setExtendedFunding(
        data.map((f: { time: number; fundingRate: string }) => ({
          time: f.time,
          rate: parseFloat(f.fundingRate),
        }))
      );
    } catch {
      // silently fail
    } finally {
      setLoadingFunding(false);
    }
  }, [asset.coin]);

  const fetchPriceHistory = useCallback(async (days: number) => {
    setLoadingPrice(true);
    try {
      const now = Date.now();
      const startTime = now - days * 24 * 60 * 60 * 1000;
      const interval = days <= 7 ? "1h" : "4h";
      const res = await fetch(
        withNetworkParam(
          `/api/market/candles?coin=${asset.coin}&marketType=perp&interval=${interval}&startTime=${startTime}&endTime=${now}`,
        )
      );
      if (!res.ok) return;
      const data = (await res.json()) as Array<Record<string, string | number>>;
      setPriceHistory(
        data
          .map((candle) => ({
            time: Number(candle.t ?? candle.T ?? candle.time),
            price: Number(candle.c ?? candle.close),
          }))
          .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0)
      );
    } catch {
      setPriceHistory([]);
    } finally {
      setLoadingPrice(false);
    }
  }, [asset.coin]);

  const fetchOrderbook = useCallback(async () => {
    setLoadingOrderbook(true);
    setOrderbookError(null);
    try {
      const res = await fetch(withNetworkParam(`/api/market/orderbook?coin=${asset.coin}`));
      if (!res.ok) throw new Error("Order book unavailable");
      const data = await res.json();
      setOrderbook({
        bestBid: data.bestBid ?? null,
        bestAsk: data.bestAsk ?? null,
        spreadBps: data.spreadBps ?? null,
        bids: Array.isArray(data.bids) ? data.bids : [],
        asks: Array.isArray(data.asks) ? data.asks : [],
      });
    } catch (error) {
      setOrderbook(null);
      setOrderbookError(error instanceof Error ? error.message : "Order book unavailable");
    } finally {
      setLoadingOrderbook(false);
    }
  }, [asset.coin]);

  useEffect(() => {
    if (tab !== "funding") return;
    fetchExtendedFunding(fundingRange);
    fetchPriceHistory(fundingRange);
  }, [fetchExtendedFunding, fetchPriceHistory, fundingRange, tab]);

  useEffect(() => {
    if (tab !== "leverage") return;
    fetchOrderbook();
  }, [fetchOrderbook, tab]);

  const activeFunding = fundingRange === 7 ? fundingHistory : extendedFunding;
  const chartData = useMemo(() => {
    const raw = activeFunding?.map((f) => {
      const nearestPrice = nearestPriceForTime(priceHistory, f.time);
      return {
        time: f.time,
        apr: f.rate * 8760 * 100,
        hourlyPct: f.rate * 100,
        price: nearestPrice?.price ?? null,
      };
    });
    const firstPrice = raw?.find((point) => point.price != null)?.price ?? null;
    return raw?.map((point) => ({
      ...point,
      priceChangePct: point.price != null && firstPrice != null && firstPrice > 0
        ? ((point.price - firstPrice) / firstPrice) * 100
        : null,
    }));
  }, [activeFunding, priceHistory]);
  const fundingRegime = getFundingRegime(
    asset.fundingRate,
    activeFunding ?? undefined
  );
  const positioningContext = computePositioningContext({
    asset,
    fundingRegime,
    orderbook,
  });
  const regimeColor =
    fundingRegime.tone === "red"
      ? "text-red-400"
      : fundingRegime.tone === "green"
        ? "text-green-400"
        : "text-zinc-400";

  return (
    <div className="bg-zinc-900/80 border-t border-b border-zinc-700 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-2.5 pb-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono">
          <span className="text-zinc-50 font-bold text-sm">{asset.coin}</span>
          <span className="text-zinc-400">
            {formatUSD(asset.markPx, priceDecimals)}
          </span>
          <span className={priceColor}>
            {formatPct(asset.priceChange24h)}
          </span>
          <span className="text-zinc-400">
            Funding: {formatFundingRate(asset.fundingRate)} ({formatFundingAPR(asset.fundingAPR)} APR)
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 rounded hover:bg-zinc-800 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>

      {/* Tab selector */}
      <div className="flex items-center gap-1 px-4 pb-2">
        <FilterChip label="Price chart" active={tab === "price"} onClick={() => setTab("price")} className="py-1.5 text-xs" />
        <FilterChip label="Funding history" active={tab === "funding"} onClick={() => setTab("funding")} className="py-1.5 text-xs" />
        <FilterChip label="Leverage / Crowd" active={tab === "leverage"} onClick={() => setTab("leverage")} className="py-1.5 text-xs" />
      </div>

      {/* Chart area */}
      <div className="px-4 pb-3">
        {tab === "price" ? (
          <div className="h-[520px] max-h-[72vh] min-h-[420px]">
            <PriceChart coin={asset.coin} compact />
          </div>
        ) : tab === "funding" ? (
          <div>
            {/* Funding range selector */}
            <div className="flex items-center gap-1 mb-2">
              {FUNDING_RANGES.map((r) => (
                <FilterChip key={r.days} label={r.label} active={fundingRange === r.days} onClick={() => setFundingRange(r.days as 7 | 30 | 60)} className="py-1 text-[11px]" />
              ))}
              {loadingFunding && (
                <span className="text-[10px] text-zinc-600 ml-2">Loading...</span>
              )}
            </div>

            {chartData && chartData.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
                  <span className={regimeColor}>{fundingRegime.label}</span>
                  {fundingRegime.percentile != null && (
                    <span className="text-zinc-500">
                      {fundingRegime.percentile.toFixed(0)}th percentile
                    </span>
                  )}
                  {fundingRegime.meanAPR != null && (
                    <span className="text-zinc-500">
                      Mean: {formatFundingAPR(fundingRegime.meanAPR)}
                    </span>
                  )}
                  <span className="text-zinc-500">
                    Price overlay {loadingPrice ? "loading" : priceHistory.length > 0 ? "on" : "unavailable"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <FilterChip label="APR" active={fundingView === "apr"} onClick={() => setFundingView("apr")} className="py-1 text-[11px]" />
                  <FilterChip label="Hourly %" active={fundingView === "hourly"} onClick={() => setFundingView("hourly")} className="py-1 text-[11px]" />
                </div>
                <div className="text-[10px] text-zinc-600">
                  {fundingView === "apr"
                    ? "Funding APR is overlaid with price change % so movement is visually comparable."
                    : "Hourly % is overlaid with price change % for the same window."}
                </div>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 4, right: 10, left: 10, bottom: 0 }}
                  >
                    <Line
                      yAxisId="funding"
                      type="monotone"
                      dataKey={fundingView === "apr" ? "apr" : "hourlyPct"}
                      stroke="#7dd4c4"
                      strokeWidth={1.5}
                      dot={false}
                      name="Funding"
                    />
                    <Line
                      yAxisId="price"
                      type="monotone"
                      dataKey="priceChangePct"
                      stroke="#f4f4f5"
                      strokeWidth={1.25}
                      dot={false}
                      connectNulls
                      name="Price Δ"
                    />
                    <ReferenceLine yAxisId="funding" y={0} stroke="#3f3f46" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      hide
                      tickFormatter={(t) =>
                        new Date(t).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      }
                      tick={{ fontSize: 10, fill: "#71717a" }}
                      axisLine={{ stroke: "#27272a" }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="funding"
                      tickFormatter={(v) => `${v.toFixed(0)}%`}
                      tick={{ fontSize: 10, fill: "#71717a" }}
                      axisLine={false}
                      tickLine={false}
                      width={45}
                    />
                    <YAxis
                      yAxisId="price"
                      orientation="right"
                      tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
                      tick={{ fontSize: 10, fill: "#a1a1aa" }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#18181b",
                        border: "1px solid #27272a",
                        borderRadius: "6px",
                        fontSize: "10px",
                        fontFamily: "monospace",
                      }}
                      labelFormatter={(t) =>
                        new Date(t).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                        })
                      }
                      formatter={(value, name) => {
                        if (name === "Price Δ") return [`${Number(value).toFixed(2)}%`, "Price Δ"];
                        return [
                          fundingView === "apr"
                            ? `${Number(value).toFixed(1)}% APR`
                            : `${Number(value).toFixed(4)}% hourly`,
                          "Funding",
                        ];
                      }}
                    />
                  </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-xs text-zinc-600 font-mono">
                {loadingFunding ? "Loading funding data..." : "No funding history available"}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
              <div
                className={cn(
                  "rounded-2xl border px-4 py-4",
                  positioningContext.label === "Crowded long risk"
                    ? "border-red-500/25 bg-red-500/10"
                    : positioningContext.label === "Crowded short risk"
                      ? "border-amber-500/25 bg-amber-500/10"
                      : "border-zinc-800 bg-zinc-950/55",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <SectionEyebrow className="text-teal-300/80">Positioning read</SectionEyebrow>
                    <div className="mt-2 text-xl font-semibold text-zinc-100">
                      {positioningContext.label}
                    </div>
                    <div className="mt-2 max-w-2xl text-sm leading-5 text-zinc-400">
                      {positioningContext.riskNote}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className="rounded-full border border-teal-500/25 bg-teal-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-teal-200">
                      Inferred
                    </span>
                    <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                      {positioningContext.confidence} confidence
                    </span>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <CompactStat
                    label="Crowding score"
                    value={`${positioningContext.crowdingScore}/100`}
                    helper="Funding, OI tick, leverage, turnover"
                    tone={positioningContext.crowdingScore >= 55 ? "amber" : "neutral"}
                  />
                  <CompactStat
                    label="Squeeze side"
                    value={positioningContext.squeezeSide}
                    helper="Risk framing, not a trade call"
                    tone={positioningContext.squeezeSide === "None" ? "neutral" : "amber"}
                  />
                  <CompactStat
                    label="Top book"
                    value={
                      positioningContext.topBookImbalancePct == null
                        ? "n/a"
                        : `${positioningContext.topBookImbalancePct >= 0 ? "+" : ""}${positioningContext.topBookImbalancePct.toFixed(0)}%`
                    }
                    helper={loadingOrderbook ? "Loading visible depth" : orderbookError ?? "Visible bid/ask depth"}
                    tone={positioningContext.topBookImbalancePct == null ? "neutral" : "green"}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <SectionEyebrow>Actual tape</SectionEyebrow>
                  <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                    Hyperliquid data
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <TapeMetric label="Funding APR" value={formatFundingAPR(asset.fundingAPR)} />
                  <TapeMetric label="Open Interest" value={formatCompactUsd(asset.openInterest)} />
                  <TapeMetric
                    label="Latest OI tick"
                    value={asset.oiChangePct == null ? "n/a" : formatPct(asset.oiChangePct)}
                    helper="Not a 1h/4h trend"
                  />
                  <TapeMetric label="24h Volume" value={formatCompactUsd(asset.dayVolume)} />
                  <TapeMetric label="Max leverage" value={`${asset.maxLeverage}x`} />
                  <TapeMetric
                    label="Spread"
                    value={orderbook?.spreadBps == null ? "n/a" : `${orderbook.spreadBps.toFixed(2)} bps`}
                    helper={loadingOrderbook ? "Loading" : undefined}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2">
                    Bid depth: <span className="font-mono text-zinc-300">{formatPositioningDepth(positioningContext.bidDepthUsd)}</span>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2">
                    Ask depth: <span className="font-mono text-zinc-300">{formatPositioningDepth(positioningContext.askDepthUsd)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionEyebrow>Why this matters</SectionEyebrow>
                <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Crowding first · no liquidation-map claim
                </span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {positioningContext.bullets.map((bullet) => (
                  <div key={bullet} className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2 text-sm text-zinc-400">
                    {bullet}
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs leading-5 text-zinc-500">
                HyperPulse does not show exchange-wide liquidation zones here. This tab reads crowding from
                available Hyperliquid funding, OI, volume, leverage, and visible order book data.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TapeMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className="mt-1 font-mono text-sm text-zinc-100">{value}</div>
      {helper ? <div className="mt-0.5 text-[10px] text-zinc-600">{helper}</div> : null}
    </div>
  );
}

function nearestPriceForTime(priceHistory: PricePoint[], time: number): PricePoint | null {
  if (priceHistory.length === 0) return null;

  const target = normalizeTime(time);
  let nearest: PricePoint | null = null;
  let nearestDistance = Infinity;

  for (const point of priceHistory) {
    const distance = Math.abs(normalizeTime(point.time) - target);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }

  return nearestDistance <= 4 * 60 * 60 * 1000 ? nearest : null;
}

function normalizeTime(time: number): number {
  return time > 10_000_000_000 ? time : time * 1000;
}
