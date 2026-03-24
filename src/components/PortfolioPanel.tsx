"use client";

import { Wallet } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useMarket } from "@/context/MarketContext";
import { formatUSD, formatPct, formatCompact } from "@/lib/format";
import { assertOrderSucceeded } from "@/lib/order";
import toast from "react-hot-toast";

export default function PortfolioPanel() {
  const { isConnected, accountState, exchangeClient, refreshPortfolio } =
    useWallet();
  const { assets } = useMarket();

  if (!isConnected || !accountState) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center">
        <Wallet className="w-8 h-8 text-zinc-700 mb-3" />
        <p className="text-sm text-zinc-500 font-sans">
          Connect wallet to view portfolio
        </p>
        <p className="text-xs text-zinc-600 mt-1 font-sans">
          Paste your Hyperliquid API wallet key
        </p>
      </div>
    );
  }

  const {
    accountValue,
    totalMarginUsed,
    withdrawable,
    unrealizedPnl,
    positions,
  } = accountState;
  const marginPct =
    accountValue > 0 ? (totalMarginUsed / accountValue) * 100 : 0;
  const pnlColor = unrealizedPnl >= 0 ? "text-green-500" : "text-red-500";

  const handleClose = async (coin: string, szi: number) => {
    if (!exchangeClient) {
      toast.error("Wallet not connected");
      return;
    }

    try {
      const asset = assets.find((a) => a.coin === coin);
      if (!asset) throw new Error("Asset not found");

      const isBuy = szi < 0; // close short = buy, close long = sell
      const slippage = isBuy ? 1.005 : 0.995;
      const price = (asset.markPx * slippage).toFixed(
        asset.markPx < 1 ? 6 : 2
      );

      const orderResp = await exchangeClient.order({
        orders: [
          {
            a: asset.assetIndex,
            b: isBuy,
            p: price,
            s: Math.abs(szi).toString(),
            r: true,
            t: { limit: { tif: "Ioc" } },
          },
        ],
        grouping: "na",
      });
      const execution = assertOrderSucceeded(orderResp);
      toast.success(`Closed ${coin} position (${execution})`);
      setTimeout(refreshPortfolio, 2000);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to close position"
      );
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Account summary */}
      <div className="px-4 py-3 border-b border-zinc-800 space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            Account Value
          </span>
          <span className="text-lg font-mono font-bold">
            {formatUSD(accountValue)}
          </span>
        </div>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-zinc-500">Buying Power</span>
          <span className="text-zinc-300">{formatUSD(withdrawable)}</span>
        </div>
        <p className="text-[10px] text-zinc-600 font-sans">
          Buying power is your currently available USDC margin (`withdrawable`)
          that can be committed to new positions.
        </p>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-zinc-500">Unrealized PnL</span>
          <span className={pnlColor}>{formatUSD(unrealizedPnl)}</span>
        </div>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-zinc-500">Margin Used</span>
          <span className="text-zinc-300">{formatPct(marginPct)}</span>
        </div>
        {/* Margin bar */}
        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${Math.min(marginPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Positions */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
          Open Positions ({positions.length})
        </div>
        {positions.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-zinc-600">
            No open positions
          </div>
        ) : (
          <div className="space-y-0">
            {positions.map((pos) => {
              const isLong = pos.szi > 0;
              const sideColor = isLong ? "text-green-500" : "text-red-500";
              const positionPnlColor =
                pos.unrealizedPnl >= 0 ? "text-green-500" : "text-red-500";
              const marketAsset = assets.find((a) => a.coin === pos.coin);
              const markPx = marketAsset?.markPx ?? pos.entryPx;

              return (
                <div
                  key={pos.coin}
                  className="px-4 py-2 border-b border-zinc-800/50 hover:bg-zinc-800/30"
                >
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium">
                        {pos.coin}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-medium ${sideColor}`}
                      >
                        {isLong ? "LONG" : "SHORT"} {pos.leverage}x
                      </span>
                    </div>
                    <button
                      onClick={() => handleClose(pos.coin, pos.szi)}
                      className="px-2 py-0.5 text-[10px] text-red-400 border border-red-500/20 rounded hover:bg-red-500/10 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 text-[11px] font-mono text-zinc-400">
                    <div>
                      Size: {Math.abs(pos.szi).toFixed(4)}{" "}
                      <span className="text-zinc-600">
                        ({formatCompact(Math.abs(pos.szi) * markPx)})
                      </span>
                    </div>
                    <div className="text-right">
                      Entry: {formatUSD(pos.entryPx, pos.entryPx < 1 ? 4 : 2)}
                    </div>
                    <div>
                      Mark: {formatUSD(markPx, markPx < 1 ? 4 : 2)}
                    </div>
                    <div className={`text-right ${positionPnlColor}`}>
                      PnL: {formatUSD(pos.unrealizedPnl)}
                    </div>
                  </div>
                  {pos.liquidationPx && (
                    <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
                      Liq:{" "}
                      {formatUSD(
                        pos.liquidationPx,
                        pos.liquidationPx < 1 ? 4 : 2
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
