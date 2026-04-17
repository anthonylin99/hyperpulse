"use client";

import { useState, useMemo, useEffect } from "react";
import { X } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import { useWallet } from "@/context/WalletContext";
import { formatUSD } from "@/lib/format";
import { assertOrderSucceeded } from "@/lib/order";
import { formatOrderSize } from "@/lib/orderSizing";
import {
  getStoredNetwork,
  getSubscriptionClient,
  withNetworkParam,
} from "@/lib/hyperliquid";
import toast from "react-hot-toast";

interface TradeDrawerProps {
  coin: string;
  direction: "long" | "short";
  onClose: () => void;
}

const DEFAULT_LEVERAGE = 10;
const TP_SL_SUPPORTED = true;
const ORDERBOOK_STALE_MS = 6_000;

interface DepthLevel {
  px: number;
  sz: number;
  n: number;
}

interface DepthSnapshot {
  bestBid: number | null;
  bestAsk: number | null;
  spreadBps: number | null;
  bids: DepthLevel[];
  asks: DepthLevel[];
  source: "ws" | "http";
  updatedAt: number | null;
}

export default function TradeDrawer({
  coin,
  direction: initialDirection,
  onClose,
}: TradeDrawerProps) {
  const { assets } = useMarket();
  const { isConnected, exchangeClient, accountState, refreshPortfolio } =
    useWallet();

  const asset = assets.find((a) => a.coin === coin);
  const markPx = asset?.markPx ?? 0;
  const priceDecimals = markPx < 0.01 ? 6 : markPx < 1 ? 4 : 2;

  const [direction, setDirection] = useState<"long" | "short">(
    initialDirection
  );
  const [sizeUSD, setSizeUSD] = useState("");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [leverage, setLeverage] = useState(DEFAULT_LEVERAGE);
  const [submitting, setSubmitting] = useState(false);
  const [confirmValue, setConfirmValue] = useState(0);

  const [tpEnabled, setTpEnabled] = useState(false);
  const [tpType, setTpType] = useState<"market" | "limit">("market");
  const [tpTrigger, setTpTrigger] = useState("");
  const [tpLimit, setTpLimit] = useState("");

  const [slEnabled, setSlEnabled] = useState(false);
  const [slType, setSlType] = useState<"market" | "limit">("market");
  const [slTrigger, setSlTrigger] = useState("");
  const [slLimit, setSlLimit] = useState("");
  const [depth, setDepth] = useState<DepthSnapshot | null>(null);
  const [depthError, setDepthError] = useState<string | null>(null);
  const [depthNow, setDepthNow] = useState(Date.now());

  useEffect(() => {
    const maxLev = asset?.maxLeverage ?? DEFAULT_LEVERAGE;
    setLeverage(Math.min(DEFAULT_LEVERAGE, maxLev));
  }, [asset?.maxLeverage]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setDepthNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!asset) {
      setDepth(null);
      setDepthError(null);
      return;
    }

    let mounted = true;
    let depthSub: { unsubscribe: () => Promise<void> } | null = null;

    const applyDepth = (
      next: Omit<DepthSnapshot, "source" | "updatedAt">,
      source: DepthSnapshot["source"],
      updatedAt: number,
    ) => {
      if (!mounted) return;
      setDepth({
        ...next,
        source,
        updatedAt,
      });
      setDepthError(null);
    };

    const fetchSnapshot = async () => {
      try {
        const res = await fetch(withNetworkParam(`/api/market/orderbook?coin=${coin}`));
        if (!res.ok) throw new Error("Unable to fetch order book");
        const data = await res.json();
        applyDepth(
          {
            bestBid: data.bestBid ?? null,
            bestAsk: data.bestAsk ?? null,
            spreadBps: data.spreadBps ?? null,
            bids: Array.isArray(data.bids) ? data.bids : [],
            asks: Array.isArray(data.asks) ? data.asks : [],
          },
          "http",
          Number(data.time ?? Date.now()),
        );
      } catch (error) {
        if (!mounted) return;
        setDepthError(error instanceof Error ? error.message : "Unable to fetch order book");
      }
    };

    const initDepthStream = async () => {
      try {
        const sub = getSubscriptionClient(getStoredNetwork());
        depthSub = await sub.l2Book({ coin }, (event) => {
          const bids = event.levels[0].slice(0, 8).map((level) => ({
            px: Number(level.px),
            sz: Number(level.sz),
            n: level.n,
          }));
          const asks = event.levels[1].slice(0, 8).map((level) => ({
            px: Number(level.px),
            sz: Number(level.sz),
            n: level.n,
          }));
          const bestBid = bids[0]?.px ?? null;
          const bestAsk = asks[0]?.px ?? null;
          const spreadBps =
            bestBid != null && bestAsk != null
              ? ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 10_000
              : null;

          applyDepth(
            {
              bestBid,
              bestAsk,
              spreadBps,
              bids,
              asks,
            },
            "ws",
            Number(event.time ?? Date.now()),
          );
        });
      } catch {
        // Keep HTTP snapshot as fallback.
      }
    };

    void fetchSnapshot();
    void initDepthStream();

    return () => {
      mounted = false;
      if (depthSub) void depthSub.unsubscribe();
    };
  }, [asset, coin]);

  const computed = useMemo(() => {
    const usd = parseFloat(sizeUSD) || 0;
    const marginRequired = usd;
    const notional = usd * leverage;
    const positionSize = markPx > 0 ? notional / markPx : 0;

    const liqPrice =
      direction === "long"
        ? markPx * (1 - (1 / leverage) * 0.9)
        : markPx * (1 + (1 / leverage) * 0.9);

    return { marginRequired, notional, positionSize, liqPrice };
  }, [sizeUSD, leverage, markPx, direction]);

  const buyingPower = accountState?.withdrawable ?? 0;
  const insufficientBuyingPower = computed.marginRequired > buyingPower;

  const invalidTp =
    tpEnabled &&
    (!tpTrigger || (tpType === "limit" && !tpLimit));
  const invalidSl =
    slEnabled &&
    (!slTrigger || (slType === "limit" && !slLimit));

  const depthAgeMs = depth?.updatedAt ? Math.max(0, depthNow - depth.updatedAt) : null;
  const depthIsStale = depthAgeMs != null && depthAgeMs > ORDERBOOK_STALE_MS;
  const depthStatusLabel = !depth
    ? "Connecting..."
    : depthIsStale
      ? "Stale"
      : depth.source === "ws"
        ? "Live depth"
        : "Snapshot";

  const canSubmit =
    isConnected &&
    !submitting &&
    !!sizeUSD &&
    !insufficientBuyingPower &&
    !invalidTp &&
    !invalidSl;

  const handleSubmit = async () => {
    if (!exchangeClient || !asset) return;

    const usd = parseFloat(sizeUSD);
    if (!usd || usd < 10) {
      toast.error("Minimum size is $10");
      return;
    }
    if (usd > buyingPower) {
      toast.error("Insufficient buying power for this margin size");
      return;
    }

    setSubmitting(true);
    try {
      const isBuy = direction === "long";
      const slippage = isBuy ? 1.005 : 0.995;

      const price =
        orderType === "limit" && limitPrice
          ? limitPrice
          : (markPx * slippage).toFixed(priceDecimals);

      const sizeCoin = computed.positionSize;
      const sizeStr = formatOrderSize(sizeCoin, asset.szDecimals);
      if (Number(sizeStr) <= 0) {
        toast.error("Order rounds to zero at this asset's size precision");
        return;
      }

      const orderResp = await exchangeClient.order({
        orders: [
          {
            a: asset.assetIndex,
            b: isBuy,
            p: price,
            s: sizeStr,
            r: false,
            t: {
              limit: {
                tif: orderType === "market" ? "Ioc" : "Gtc",
              },
            },
          },
        ],
        grouping: "na",
      });

      const execution = assertOrderSucceeded(orderResp);

      if (execution === "filled" && TP_SL_SUPPORTED) {
        const childOrders = [] as Array<Record<string, unknown>>;

        if (tpEnabled && tpTrigger) {
          childOrders.push({
            a: asset.assetIndex,
            b: !isBuy,
            p: tpType === "limit" ? tpLimit : "0",
            s: sizeStr,
            r: true,
            t: {
              trigger: {
                isMarket: tpType === "market",
                triggerPx: tpTrigger,
                tpsl: "tp",
              },
            },
          });
        }

        if (slEnabled && slTrigger) {
          childOrders.push({
            a: asset.assetIndex,
            b: !isBuy,
            p: slType === "limit" ? slLimit : "0",
            s: sizeStr,
            r: true,
            t: {
              trigger: {
                isMarket: slType === "market",
                triggerPx: slTrigger,
                tpsl: "sl",
              },
            },
          });
        }

        if (childOrders.length > 0) {
          await exchangeClient.order({
            orders: childOrders as never,
            grouping: "na",
          });
        }
      }

      toast.success(
        `${direction === "long" ? "Buy" : "Sell"} ${coin} placed — ${sizeCoin.toFixed(4)} ${coin} @ ${orderType === "market" ? "market" : formatUSD(parseFloat(price), priceDecimals)}`
      );

      setTimeout(refreshPortfolio, 1500);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Order failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed top-0 right-0 h-full w-[340px] bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col animate-slide-in">
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 flex-shrink-0">
          <div>
            <span className="text-[13px] font-mono font-bold">{coin}</span>
            {asset && (
              <span className="ml-1.5 text-[13px] font-mono text-zinc-400">
                {formatUSD(markPx, priceDecimals)}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
          <div className="flex rounded-md overflow-hidden border border-zinc-700">
            <button
              onClick={() => setDirection("long")}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                direction === "long"
                  ? "bg-green-500/20 text-green-500"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Buy / Long
            </button>
            <button
              onClick={() => setDirection("short")}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                direction === "short"
                  ? "bg-red-500/20 text-red-500"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Sell / Short
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Leverage</span>
            <span className="font-mono text-zinc-300">{leverage}x</span>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">
              Size (USDC)
            </label>
            <input
              type="number"
              placeholder="0.00"
              min="10"
              value={sizeUSD}
              onChange={(e) => setSizeUSD(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[#7dd4c4] transition-colors"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">
              Order Type
            </label>
            <div className="flex gap-1">
              <button
                onClick={() => setOrderType("market")}
                className={`flex-1 py-1 text-[11px] font-mono rounded transition-colors ${
                  orderType === "market"
                    ? "bg-zinc-700 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-300"
                }`}
              >
                Market
              </button>
              <button
                onClick={() => {
                  setOrderType("limit");
                  if (!limitPrice) setLimitPrice(markPx.toFixed(priceDecimals));
                }}
                className={`flex-1 py-1 text-[11px] font-mono rounded transition-colors ${
                  orderType === "limit"
                    ? "bg-zinc-700 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-300"
                }`}
              >
                Limit
              </button>
            </div>
          </div>

          {orderType === "limit" && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">
                Limit Price
              </label>
              <input
                type="number"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-zinc-200 focus:outline-none focus:border-[#7dd4c4] transition-colors"
              />
            </div>
          )}

          {TP_SL_SUPPORTED && (
            <div className="space-y-2 border-t border-zinc-800 pt-2.5">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">TP / SL</div>
              <div className="rounded border border-zinc-800 p-2 space-y-2">
                <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={tpEnabled}
                    onChange={(e) => setTpEnabled(e.target.checked)}
                    className="accent-[#7dd4c4]"
                  />
                  Take Profit
                </label>
                {tpEnabled && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setTpType("market")}
                        className={`flex-1 py-1 text-[10px] font-mono rounded ${
                          tpType === "market"
                            ? "bg-zinc-700 text-white"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        Market
                      </button>
                      <button
                        onClick={() => setTpType("limit")}
                        className={`flex-1 py-1 text-[10px] font-mono rounded ${
                          tpType === "limit"
                            ? "bg-zinc-700 text-white"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        Limit
                      </button>
                    </div>
                    <input
                      type="number"
                      placeholder="Trigger price"
                      value={tpTrigger}
                      onChange={(e) => setTpTrigger(e.target.value)}
                      className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-[11px] font-mono text-zinc-200"
                    />
                    {tpType === "limit" && (
                      <input
                        type="number"
                        placeholder="Limit price"
                        value={tpLimit}
                        onChange={(e) => setTpLimit(e.target.value)}
                        className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-[11px] font-mono text-zinc-200"
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="rounded border border-zinc-800 p-2 space-y-2">
                <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={slEnabled}
                    onChange={(e) => setSlEnabled(e.target.checked)}
                    className="accent-[#7dd4c4]"
                  />
                  Stop Loss
                </label>
                {slEnabled && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setSlType("market")}
                        className={`flex-1 py-1 text-[10px] font-mono rounded ${
                          slType === "market"
                            ? "bg-zinc-700 text-white"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        Market
                      </button>
                      <button
                        onClick={() => setSlType("limit")}
                        className={`flex-1 py-1 text-[10px] font-mono rounded ${
                          slType === "limit"
                            ? "bg-zinc-700 text-white"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        Limit
                      </button>
                    </div>
                    <input
                      type="number"
                      placeholder="Trigger price"
                      value={slTrigger}
                      onChange={(e) => setSlTrigger(e.target.value)}
                      className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-[11px] font-mono text-zinc-200"
                    />
                    {slType === "limit" && (
                      <input
                        type="number"
                        placeholder="Limit price"
                        value={slLimit}
                        onChange={(e) => setSlLimit(e.target.value)}
                        className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-[11px] font-mono text-zinc-200"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {parseFloat(sizeUSD) > 0 && (
            <div className="space-y-1 text-[11px] font-mono border-t border-zinc-800 pt-2.5">
              <div className="flex justify-between text-zinc-300">
                <span>Buying Power</span>
                <span>{formatUSD(buyingPower)}</span>
              </div>
              <div className="flex justify-between text-zinc-300">
                <span>Margin Required</span>
                <span className={insufficientBuyingPower ? "text-red-400" : "text-zinc-300"}>
                  {formatUSD(computed.marginRequired)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Position Size</span>
                <span>
                  {computed.positionSize.toFixed(4)} {coin}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Order Value</span>
                <span>{formatUSD(computed.notional)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Est. Liquidation</span>
                <span>{formatUSD(computed.liqPrice, priceDecimals)}</span>
              </div>
              {insufficientBuyingPower && (
                <div className="text-red-400 text-[10px]">
                  Margin exceeds available buying power.
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 border-t border-zinc-800 pt-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Order Book
              </div>
              <div
                className={`text-[10px] font-mono ${
                  !depth
                    ? "text-zinc-500"
                    : depthIsStale
                      ? "text-amber-300"
                      : depth.source === "ws"
                        ? "text-emerald-300"
                        : "text-zinc-400"
                }`}
              >
                {depthStatusLabel}
                {depthAgeMs != null ? ` · ${Math.round(depthAgeMs / 1000)}s ago` : ""}
              </div>
            </div>

            {depthError ? (
              <div className="rounded border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-[10px] text-amber-200">
                {depthError}
              </div>
            ) : depth ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                  <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-2">
                    <div className="text-zinc-500">Best Bid</div>
                    <div className="mt-1 text-emerald-300">
                      {depth.bestBid == null ? "—" : formatUSD(depth.bestBid, priceDecimals)}
                    </div>
                  </div>
                  <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-2">
                    <div className="text-zinc-500">Best Ask</div>
                    <div className="mt-1 text-red-300">
                      {depth.bestAsk == null ? "—" : formatUSD(depth.bestAsk, priceDecimals)}
                    </div>
                  </div>
                  <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-2">
                    <div className="text-zinc-500">Spread</div>
                    <div className="mt-1 text-zinc-200">
                      {depth.spreadBps == null ? "—" : `${depth.spreadBps.toFixed(2)} bps`}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                  <div className="rounded border border-zinc-800 bg-zinc-950/70">
                    <div className="border-b border-zinc-800 px-2 py-1 text-emerald-300">Bids</div>
                    <div className="divide-y divide-zinc-800">
                      {depth.bids.slice(0, 4).map((level, index) => (
                        <div key={`bid-${index}`} className="flex items-center justify-between px-2 py-1.5">
                          <span className="text-zinc-300">{formatUSD(level.px, priceDecimals)}</span>
                          <span className="text-zinc-500">{level.sz}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded border border-zinc-800 bg-zinc-950/70">
                    <div className="border-b border-zinc-800 px-2 py-1 text-red-300">Asks</div>
                    <div className="divide-y divide-zinc-800">
                      {depth.asks.slice(0, 4).map((level, index) => (
                        <div key={`ask-${index}`} className="flex items-center justify-between px-2 py-1.5">
                          <span className="text-zinc-300">{formatUSD(level.px, priceDecimals)}</span>
                          <span className="text-zinc-500">{level.sz}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-[10px] text-zinc-500">
                Waiting for depth snapshot...
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 px-3 py-3 border-t border-zinc-800 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Slide to confirm
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={confirmValue}
            onChange={(e) => setConfirmValue(Number(e.target.value))}
            onMouseUp={() => {
              if (confirmValue >= 98 && canSubmit) {
                setConfirmValue(0);
                handleSubmit();
              } else {
                setConfirmValue(0);
              }
            }}
            onTouchEnd={() => {
              if (confirmValue >= 98 && canSubmit) {
                setConfirmValue(0);
                handleSubmit();
              } else {
                setConfirmValue(0);
              }
            }}
            disabled={!canSubmit}
            className="w-full"
          />
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`w-full py-2 text-xs font-medium rounded transition-colors ${
              direction === "long"
                ? "bg-green-600 hover:bg-green-500 disabled:bg-zinc-700"
                : "bg-red-600 hover:bg-red-500 disabled:bg-zinc-700"
            } text-white disabled:text-zinc-500`}
          >
            {submitting
              ? "Placing..."
              : !isConnected
                ? "Connect Wallet"
                : `Place ${direction === "long" ? "Buy" : "Sell"}`}
          </button>
          <p className="text-[9px] text-zinc-600 font-sans text-center">
            Not available to US persons. Use at your own risk.
          </p>
        </div>
      </div>
    </>
  );
}
