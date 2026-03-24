"use client";

import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import { useWallet } from "@/context/WalletContext";
import { formatUSD, formatFundingRate } from "@/lib/format";
import toast from "react-hot-toast";

interface TradeDrawerProps {
  coin: string;
  direction: "long" | "short";
  onClose: () => void;
}

const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20] as const;

export default function TradeDrawer({
  coin,
  direction: initialDirection,
  onClose,
}: TradeDrawerProps) {
  const { assets } = useMarket();
  const { isConnected, exchangeClient, accountState, refreshPortfolio } =
    useWallet();

  const asset = assets.find((a) => a.coin === coin);

  const [direction, setDirection] = useState<"long" | "short">(
    initialDirection
  );
  const [sizeUSD, setSizeUSD] = useState("");
  const [leverage, setLeverage] = useState(5);
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Auto-fill limit price when switching to limit
  const markPx = asset?.markPx ?? 0;
  const priceDecimals = markPx < 0.01 ? 6 : markPx < 1 ? 4 : 2;

  const computed = useMemo(() => {
    const usd = parseFloat(sizeUSD) || 0;
    const notional = usd * leverage;
    const positionSize = markPx > 0 ? notional / markPx : 0;

    // Simplified liquidation estimate
    const liqPrice =
      direction === "long"
        ? markPx * (1 - (1 / leverage) * 0.9)
        : markPx * (1 + (1 / leverage) * 0.9);

    // Funding cost per day
    const fundingRate = asset?.fundingRate ?? 0;
    const fundingCostDay = Math.abs(notional * fundingRate * 24);
    const fundingEarns =
      (direction === "long" && fundingRate < 0) ||
      (direction === "short" && fundingRate > 0);

    return { notional, positionSize, liqPrice, fundingCostDay, fundingEarns };
  }, [sizeUSD, leverage, markPx, direction, asset]);

  // Check for existing position
  const existingPosition = accountState?.positions.find(
    (p) => p.coin === coin
  );

  const handleSubmit = async () => {
    if (!exchangeClient || !asset) return;

    const usd = parseFloat(sizeUSD);
    if (!usd || usd < 10) {
      toast.error("Minimum size is $10");
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

      // Size in base currency units (coins)
      const sizeCoin = computed.positionSize;
      // Round to reasonable precision
      const sizeStr = sizeCoin.toPrecision(6);

      await exchangeClient.order({
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

      toast.success(
        `${direction === "long" ? "Long" : "Short"} ${coin} placed — ${sizeCoin.toFixed(4)} ${coin} @ ${orderType === "market" ? "market" : formatUSD(parseFloat(price), priceDecimals)}`
      );

      setTimeout(refreshPortfolio, 2000);
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Order failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Drawer — no backdrop, does not block page interaction */}
      <div className="fixed top-0 right-0 h-full w-[380px] bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <div>
            <span className="text-sm font-mono font-bold">{coin}</span>
            {asset && (
              <span className="ml-2 text-sm font-mono text-zinc-400">
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

        {/* Body */}
        <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
          {/* Direction toggle */}
          <div className="flex rounded-lg overflow-hidden border border-zinc-700">
            <button
              onClick={() => setDirection("long")}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                direction === "long"
                  ? "bg-green-500/20 text-green-500"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Long
            </button>
            <button
              onClick={() => setDirection("short")}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                direction === "short"
                  ? "bg-red-500/20 text-red-500"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Short
            </button>
          </div>

          {/* Size input */}
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
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Leverage selector */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">
              Leverage
            </label>
            <div className="flex gap-1">
              {LEVERAGE_OPTIONS.map((lev) => (
                <button
                  key={lev}
                  onClick={() => setLeverage(lev)}
                  disabled={asset ? lev > asset.maxLeverage : false}
                  className={`flex-1 py-1.5 text-xs font-mono rounded transition-colors ${
                    leverage === lev
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  {lev}x
                </button>
              ))}
            </div>
          </div>

          {/* Order type */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">
              Order Type
            </label>
            <div className="flex gap-1">
              <button
                onClick={() => setOrderType("market")}
                className={`flex-1 py-1.5 text-xs font-mono rounded transition-colors ${
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
                  if (!limitPrice)
                    setLimitPrice(markPx.toFixed(priceDecimals));
                }}
                className={`flex-1 py-1.5 text-xs font-mono rounded transition-colors ${
                  orderType === "limit"
                    ? "bg-zinc-700 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-300"
                }`}
              >
                Limit
              </button>
            </div>
          </div>

          {/* Limit price input */}
          {orderType === "limit" && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">
                Limit Price
              </label>
              <input
                type="number"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm font-mono text-zinc-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          )}

          {/* Computed fields */}
          {parseFloat(sizeUSD) > 0 && (
            <div className="space-y-1.5 text-xs font-mono border-t border-zinc-800 pt-3">
              <div className="flex justify-between text-zinc-400">
                <span>Position Size</span>
                <span>
                  {computed.positionSize.toFixed(4)} {coin}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Notional Value</span>
                <span>{formatUSD(computed.notional)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Est. Liquidation</span>
                <span>
                  {formatUSD(computed.liqPrice, priceDecimals)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Funding/day</span>
                <span
                  className={
                    computed.fundingEarns ? "text-green-500" : "text-red-400"
                  }
                >
                  {computed.fundingEarns ? "earns " : "costs "}
                  {formatUSD(computed.fundingCostDay)}/day
                </span>
              </div>
              {asset && (
                <div className="flex justify-between text-zinc-500">
                  <span>Current Funding/hr</span>
                  <span>{formatFundingRate(asset.fundingRate)}</span>
                </div>
              )}
            </div>
          )}

          {/* Existing position warning */}
          {existingPosition && (
            <div className="px-3 py-2 bg-zinc-800/50 rounded border border-zinc-700 text-xs text-zinc-400 font-sans">
              You have an existing{" "}
              <span
                className={
                  existingPosition.szi > 0 ? "text-green-500" : "text-red-500"
                }
              >
                {existingPosition.szi > 0 ? "Long" : "Short"}
              </span>{" "}
              of {Math.abs(existingPosition.szi).toFixed(4)} {coin}. This will{" "}
              {(existingPosition.szi > 0 && direction === "long") ||
              (existingPosition.szi < 0 && direction === "short")
                ? "add to"
                : "flip"}{" "}
              your position.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-zinc-800 space-y-3">
          <button
            onClick={handleSubmit}
            disabled={!isConnected || submitting || !sizeUSD}
            className={`w-full py-3 text-sm font-medium rounded transition-colors ${
              direction === "long"
                ? "bg-green-600 hover:bg-green-500 disabled:bg-zinc-700"
                : "bg-red-600 hover:bg-red-500 disabled:bg-zinc-700"
            } text-white disabled:text-zinc-500`}
          >
            {submitting
              ? "Placing..."
              : !isConnected
                ? "Connect Wallet"
                : `Place ${direction === "long" ? "Long" : "Short"}`}
          </button>
          <p className="text-[10px] text-zinc-600 font-sans text-center">
            Not available to US persons. Use at your own risk.
          </p>
        </div>
      </div>
    </>
  );
}
