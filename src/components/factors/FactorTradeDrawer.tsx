"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { useMarket } from "@/context/MarketContext";
import { useWallet } from "@/context/WalletContext";
import { cn, formatPct, formatUSD } from "@/lib/format";
import {
  buildDefaultFactorLegs,
  buildFactorExecutionOrders,
  buildFactorExecutionPlan,
  type FactorExecutionOrderInstruction,
} from "@/lib/factorExecution";
import {
  deleteFactorTradePreset,
  listFactorTradePresets,
  saveFactorTradePreset,
} from "@/lib/factorTradePresets";
import { executeOrdersSequentially, type SequentialLegResult } from "@/lib/order";
import { saveDeployment } from "@/lib/factorDeployments";
import { isNetworkTestnet } from "@/lib/hyperliquid";
import type {
  EditableFactorLeg,
  FactorDeploymentRecord,
  FactorDeploymentRecordLeg,
  FactorTradePreset,
  LiveFactorState,
} from "@/types";

interface FactorTradeDrawerProps {
  factor: LiveFactorState;
  onClose: () => void;
  onDeploymentRecorded?: () => void;
}

const DEFAULT_LONG_GROSS = 1000;
const DEFAULT_SHORT_GROSS = 1000;
const DEFAULT_SLIPPAGE_BPS = 50;
const DEFAULT_LEVERAGE = 3;
const SOFT_MARGIN_USAGE_PCT = 0.2;
const HIGH_MARGIN_USAGE_PCT = 0.35;
const MAX_MARGIN_USAGE_PCT = 0.5;
const SAFE_DEFAULT_MARGIN_USAGE_PCT = 0.1;

export default function FactorTradeDrawer({
  factor,
  onClose,
  onDeploymentRecorded,
}: FactorTradeDrawerProps) {
  const { assets } = useMarket();
  const { exchangeClient, accountState, address, isReadOnly, refreshPortfolio } = useWallet();

  const [legs, setLegs] = useState<EditableFactorLeg[]>(() => buildDefaultFactorLegs(factor.snapshot));
  const [longGrossUsd, setLongGrossUsd] = useState(DEFAULT_LONG_GROSS);
  const [shortGrossUsd, setShortGrossUsd] = useState(DEFAULT_SHORT_GROSS);
  const [leverage, setLeverage] = useState(DEFAULT_LEVERAGE);
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [presetId, setPresetId] = useState<string>("");
  const [presets, setPresets] = useState<FactorTradePreset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [executionNotes, setExecutionNotes] = useState<string[]>([]);
  const [lastReceipt, setLastReceipt] = useState<FactorDeploymentRecord | null>(null);
  const [failedOrders, setFailedOrders] = useState<FactorExecutionOrderInstruction[]>([]);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const defaultsInitializedRef = useRef(false);
  const reviewDirtyRef = useRef(false);

  useEffect(() => {
    setPresets(listFactorTradePresets(factor.snapshot.id));
  }, [factor.snapshot.id]);

  const maxAllowedLeverage = useMemo(() => {
    const enabledAssets = legs
      .filter((leg) => leg.enabled)
      .map((leg) => assets.find((asset) => asset.coin === leg.symbol))
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
    if (enabledAssets.length === 0) return DEFAULT_LEVERAGE;
    return Math.max(1, Math.min(...enabledAssets.map((asset) => asset.maxLeverage)));
  }, [assets, legs]);

  useEffect(() => {
    if (leverage > maxAllowedLeverage) {
      setLeverage(maxAllowedLeverage);
    }
  }, [leverage, maxAllowedLeverage]);

  const plan = useMemo(
    () =>
      buildFactorExecutionPlan({
        snapshot: factor.snapshot,
        editableLegs: legs,
        assets,
        positions: accountState?.positions ?? [],
        longGrossUsd,
        shortGrossUsd,
        leverage,
        slippageBps,
      }),
    [factor.snapshot, legs, assets, accountState?.positions, longGrossUsd, shortGrossUsd, leverage, slippageBps],
  );

  const buyingPower = accountState?.withdrawable ?? 0;
  const marginUsagePct =
    buyingPower > 0 ? plan.summary.estimatedMarginUsd / buyingPower : 0;
  const requiresTypedConfirm = marginUsagePct >= HIGH_MARGIN_USAGE_PCT;
  const hardBlockedByUsage = marginUsagePct > MAX_MARGIN_USAGE_PCT;
  const orderInstructions = useMemo(
    () => buildFactorExecutionOrders(plan),
    [plan],
  );
  const canExecute =
    Boolean(exchangeClient) &&
    !isReadOnly &&
    orderInstructions.length > 0 &&
    plan.summary.estimatedMarginUsd <= buyingPower &&
    !hardBlockedByUsage &&
    reviewAcknowledged &&
    (!requiresTypedConfirm || confirmText.trim().toUpperCase() === "DEPLOY");

  useEffect(() => {
    if (defaultsInitializedRef.current) return;
    if (!accountState?.withdrawable || presetId) return;

    const safeMargin = Math.max(
      15,
      Math.min(accountState.withdrawable * SAFE_DEFAULT_MARGIN_USAGE_PCT, 100),
    );
    const grossTotal = safeMargin * leverage;
    const perSide =
      factor.snapshot.constructionType === "long-only"
        ? grossTotal
        : grossTotal / 2;

    setLongGrossUsd(Number(perSide.toFixed(2)));
    setShortGrossUsd(
      Number(
        (factor.snapshot.constructionType === "long-only" ? 0 : perSide).toFixed(2),
      ),
    );
    defaultsInitializedRef.current = true;
  }, [accountState?.withdrawable, factor.snapshot.constructionType, leverage, presetId]);

  useEffect(() => {
    if (!reviewDirtyRef.current) {
      reviewDirtyRef.current = true;
      return;
    }
    setReviewAcknowledged(false);
    setConfirmText("");
  }, [legs, longGrossUsd, shortGrossUsd, leverage, slippageBps]);

  const updateLeg = (symbol: string, patch: Partial<EditableFactorLeg>) => {
    setLegs((current) =>
      current.map((leg) => (leg.symbol === symbol ? { ...leg, ...patch } : leg)),
    );
  };

  const handleApplyPreset = (id: string) => {
    setPresetId(id);
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setLegs(preset.legs);
    setLongGrossUsd(preset.longGrossUsd);
    setShortGrossUsd(preset.shortGrossUsd);
    setLeverage(preset.leverage);
    setSlippageBps(preset.slippageBps);
    setExecutionNotes([]);
    setReviewAcknowledged(false);
    setConfirmText("");
  };

  const handleSavePreset = () => {
    const name = window.prompt("Preset name");
    if (!name) return;
    const next = saveFactorTradePreset({
      id: presetId || undefined,
      factorId: factor.snapshot.id,
      name,
      longGrossUsd,
      shortGrossUsd,
      leverage,
      slippageBps,
      legs,
    });
    setPresetId(next.id);
    setPresets(listFactorTradePresets(factor.snapshot.id));
    toast.success(`Saved preset: ${name}`);
  };

  const handleDeletePreset = () => {
    if (!presetId) return;
    deleteFactorTradePreset(presetId);
    setPresetId("");
    setPresets(listFactorTradePresets(factor.snapshot.id));
    toast.success("Preset deleted");
  };

  const runOrders = async (orders: FactorExecutionOrderInstruction[]) => {
    if (!exchangeClient || orders.length === 0) return;
    setSubmitting(true);
    setExecutionNotes([]);

    const toastId = toast.loading(`Deploying factor — leg 1/${orders.length}`);
    const resultsByIndex: Record<number, SequentialLegResult<FactorExecutionOrderInstruction>> = {};

    try {
      const uniqueAssets = new Map<number, true>();
      for (const leg of plan.executableLegs) {
        if (leg.assetIndex == null) continue;
        uniqueAssets.set(leg.assetIndex, true);
      }
      for (const assetIndex of uniqueAssets.keys()) {
        await exchangeClient.updateLeverage({
          asset: assetIndex,
          isCross: true,
          leverage: plan.leverage,
        });
      }

      const { executed, failed, stoppedAt } = await executeOrdersSequentially(
        exchangeClient,
        orders,
        (index, result) => {
          resultsByIndex[index] = result;
          const current = index + 1;
          toast.loading(
            `Leg ${current}/${orders.length}: ${result.order.symbol} ${result.status}`,
            { id: toastId },
          );
        },
        { stopOnFailure: true },
      );

      const notes: string[] = [];
      const receiptLegs: FactorDeploymentRecordLeg[] = [];
      orders.forEach((order, index) => {
        const res = resultsByIndex[index];
        const prefix = `${order.symbol} (${order.phase}${order.reduceOnly ? ", reduce-only" : ""})`;
        if (!res) {
          notes.push(`${prefix}: skipped (stopped at earlier failure)`);
          receiptLegs.push({
            symbol: order.symbol,
            side: order.side,
            phase: order.phase,
            targetSize: order.size,
            executedQty: null,
            avgPx: null,
            status: "skipped",
            error: null,
          });
          return;
        }
        notes.push(
          res.status === "error"
            ? `${prefix}: error — ${res.message ?? "unknown"}`
            : res.status === "filled"
              ? `${prefix}: filled @ ${res.avgPx?.toFixed(4) ?? "?"} × ${res.filledSz ?? "?"}`
              : `${prefix}: ${res.status}`,
        );
        receiptLegs.push({
          symbol: order.symbol,
          side: order.side,
          phase: order.phase,
          targetSize: order.size,
          executedQty: res.filledSz ?? null,
          avgPx: res.avgPx ?? null,
          status: res.status,
          error: res.status === "error" ? res.message ?? "unknown" : null,
        });
      });

      setExecutionNotes(notes);

      if (address) {
        const record: FactorDeploymentRecord = {
          id: `${factor.snapshot.id}-${Date.now()}`,
          factorId: factor.snapshot.id,
          factorName: factor.snapshot.name,
          timestamp: Date.now(),
          mainnet: !isNetworkTestnet(),
          address,
          legs: receiptLegs,
        };
        saveDeployment(address, record);
        setLastReceipt(record);
        onDeploymentRecorded?.();
      }

      if (failed.length > 0) {
        const failedOrdersList = failed.map((f) => f.order);
        setFailedOrders(failedOrdersList);
        toast.error(
          `Stopped at leg ${(stoppedAt ?? 0) + 1}: ${failed[0]?.message ?? "order failed"}`,
          { id: toastId },
        );
      } else {
        setFailedOrders([]);
        toast.success(`Deployed ${executed.length} legs`, { id: toastId });
      }

      await refreshPortfolio();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Factor deployment failed";
      toast.error(message, { id: toastId });
      setExecutionNotes([message]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecute = () => runOrders(orderInstructions);
  const handleRetryFailed = () => runOrders(failedOrders);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-[760px] overflow-y-auto border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-teal-400/80">Factor Deployment</div>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-100">{factor.snapshot.name}</h2>
              <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                Edit the basket, choose long and short gross independently, then deploy the resulting delta into your current Hyperliquid account.
              </p>
            </div>
            <button onClick={onClose} className="rounded-lg border border-zinc-800 p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-200">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          <section className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Long Gross</div>
              <input
                type="number"
                min="0"
                value={longGrossUsd}
                onChange={(e) => setLongGrossUsd(Number(e.target.value) || 0)}
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Short Gross</div>
              <input
                type="number"
                min="0"
                value={shortGrossUsd}
                onChange={(e) => setShortGrossUsd(Number(e.target.value) || 0)}
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Leverage</div>
              <input
                type="number"
                min="1"
                max={maxAllowedLeverage}
                value={leverage}
                onChange={(e) => setLeverage(Math.max(1, Number(e.target.value) || 1))}
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-teal-400 focus:outline-none"
              />
              <div className="mt-1 text-[11px] text-zinc-500">Max available across active legs: {maxAllowedLeverage}x</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Slippage</div>
              <input
                type="number"
                min="1"
                max="300"
                value={slippageBps}
                onChange={(e) => setSlippageBps(Math.max(1, Number(e.target.value) || 1))}
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-teal-400 focus:outline-none"
              />
              <div className="mt-1 text-[11px] text-zinc-500">Entered in bps for IOC price guardrails.</div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Presets</div>
                <div className="mt-1 text-sm text-zinc-400">Save custom portfolio shapes for this factor and redeploy them later.</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={presetId}
                  onChange={(e) => handleApplyPreset(e.target.value)}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                >
                  <option value="">Factor defaults</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                  ))}
                </select>
                <button onClick={handleSavePreset} className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-200 transition-colors hover:bg-teal-500/15">
                  Save Preset
                </button>
                <button
                  onClick={handleDeletePreset}
                  disabled={!presetId}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Summary</div>
                <div className="mt-1 text-sm text-zinc-400">Target final portfolio exposure after netting against current positions.</div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Gross" value={formatUSD(plan.summary.grossUsd)} />
              <Metric label="Net" value={formatUSD(plan.summary.netUsd)} />
              <Metric label="Est. Margin" value={formatUSD(plan.summary.estimatedMarginUsd)} />
              <Metric
                label="Margin Usage"
                value={`${(marginUsagePct * 100).toFixed(0)}%`}
                tone={hardBlockedByUsage ? "bad" : marginUsagePct >= SOFT_MARGIN_USAGE_PCT ? "bad" : "good"}
              />
              <Metric label="Tradable" value={`${(plan.summary.tradableCoverage * 100).toFixed(0)}%`} />
              <Metric label="Buying Power" value={formatUSD(buyingPower)} tone={plan.summary.estimatedMarginUsd > buyingPower ? "bad" : "good"} />
            </div>
            {plan.summary.estimatedMarginUsd > buyingPower && (
              <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Estimated margin exceeds current available balance. Reduce gross or leverage-adjust the plan.
              </div>
            )}
            {marginUsagePct >= SOFT_MARGIN_USAGE_PCT && plan.summary.estimatedMarginUsd <= buyingPower && (
              <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                This basket would use {(marginUsagePct * 100).toFixed(0)}% of available buying power. That is okay if intentional, but it is no longer a “small test” size.
              </div>
            )}
            {hardBlockedByUsage && (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                Basket blocked: v1 hard-caps estimated margin usage at 50% of available buying power to prevent accidental oversizing.
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Basket Editor</div>
              <div className="mt-1 text-sm text-zinc-400">Flip sides, disable names, and change weights per leg. Weights renormalize separately within longs and shorts.</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-950/80 text-zinc-500">
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                    <th>On</th>
                    <th>Asset</th>
                    <th>Side</th>
                    <th>Weight</th>
                    <th>Norm</th>
                    <th>24h</th>
                    <th>Funding</th>
                    <th>Target</th>
                    <th>Current</th>
                    <th>Delta</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.legs.map((leg) => (
                    <tr key={leg.symbol} className="border-t border-zinc-800 bg-zinc-950/40 [&>td]:px-3 [&>td]:py-2">
                      <td>
                        <input type="checkbox" checked={legs.find((item) => item.symbol === leg.symbol)?.enabled ?? false} onChange={(e) => updateLeg(leg.symbol, { enabled: e.target.checked })} className="accent-teal-400" />
                      </td>
                      <td>
                        <div className="font-medium text-zinc-100">{leg.symbol}</div>
                        <div className="text-[11px] text-zinc-500">src {leg.sourceRole}</div>
                      </td>
                      <td>
                        <select
                          value={legs.find((item) => item.symbol === leg.symbol)?.side ?? leg.side}
                          onChange={(e) => updateLeg(leg.symbol, { side: e.target.value as "long" | "short" })}
                          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                        >
                          <option value="long">Long</option>
                          <option value="short">Short</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={legs.find((item) => item.symbol === leg.symbol)?.weight ?? leg.weightInput}
                          onChange={(e) => updateLeg(leg.symbol, { weight: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                        />
                      </td>
                      <td className="text-zinc-300">{(leg.normalizedWeight * 100).toFixed(1)}%</td>
                      <td className={cn(leg.liveChange24h == null ? "text-zinc-500" : leg.liveChange24h >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {leg.liveChange24h == null ? "n/a" : formatPct(leg.liveChange24h)}
                      </td>
                      <td className={cn(leg.fundingAPR == null ? "text-zinc-500" : leg.fundingAPR >= 0 ? "text-amber-300" : "text-sky-300")}>
                        {leg.fundingAPR == null ? "n/a" : formatPct(leg.fundingAPR)}
                      </td>
                      <td className="text-zinc-300">{formatUSD(leg.targetNotionalUsd)}</td>
                      <td className="font-mono text-zinc-400">{leg.currentQty.toFixed(leg.sizeDecimals)}</td>
                      <td className={cn(Math.abs(leg.deltaQty) > 0 ? "text-zinc-100" : "text-zinc-500", leg.deltaQty > 0 ? "text-emerald-300" : leg.deltaQty < 0 ? "text-red-300" : "")}>
                        {leg.deltaQty > 0 ? "+" : ""}{leg.deltaQty.toFixed(leg.sizeDecimals)}
                      </td>
                      <td>
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-[10px]",
                          leg.status === "ready" ? "bg-emerald-500/10 text-emerald-300" : leg.status === "unmapped" ? "bg-zinc-800 text-zinc-400" : "bg-amber-500/10 text-amber-300",
                        )}>
                          {leg.status === "ready" ? "ready" : leg.status === "unmapped" ? "no HL" : "skipped"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {(plan.skippedLegs.length > 0 || executionNotes.length > 0 || lastReceipt) && (
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Notes</div>
                {failedOrders.length > 0 && (
                  <button
                    onClick={handleRetryFailed}
                    disabled={submitting}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Retry failed legs ({failedOrders.length})
                  </button>
                )}
              </div>
              <div className="mt-3 space-y-2 text-sm text-zinc-400">
                {plan.skippedLegs.slice(0, 8).map((leg) => (
                  <div key={`skip-${leg.symbol}`}>{leg.symbol}: {leg.statusReason}</div>
                ))}
                {executionNotes.map((note, index) => (
                  <div key={`exec-${index}`}>{note}</div>
                ))}
              </div>
              {lastReceipt && (
                <details className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
                  <summary className="cursor-pointer text-zinc-400">
                    Deployment receipt · {new Date(lastReceipt.timestamp).toLocaleString()} · {lastReceipt.mainnet ? "mainnet" : "testnet"}
                  </summary>
                  <div className="mt-2 space-y-1">
                    {lastReceipt.legs.map((leg, index) => (
                      <div key={`receipt-${index}`} className="font-mono text-[11px] text-zinc-400">
                        {leg.status === "filled" ? "✓" : leg.status === "error" ? "✗" : "·"}{" "}
                        {leg.symbol} {leg.side} {leg.targetSize}
                        {leg.executedQty != null && ` → ${leg.executedQty}`}
                        {leg.avgPx != null && ` @ ${leg.avgPx.toFixed(4)}`}
                        {leg.error && <span className="text-red-400"> — {leg.error}</span>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Execution Guardrails</div>
            <div className="mt-3 space-y-3 text-sm text-zinc-400">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={reviewAcknowledged}
                  onChange={(e) => setReviewAcknowledged(e.target.checked)}
                  className="mt-1 accent-teal-400"
                />
                <span>I reviewed the long/short gross, estimated margin, and each leg’s delta order.</span>
              </label>
              {requiresTypedConfirm && (
                <div>
                  <div className="text-xs text-zinc-500">
                    This basket uses {(marginUsagePct * 100).toFixed(0)}% of buying power. Type <span className="font-mono text-zinc-200">DEPLOY</span> to confirm.
                  </div>
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-teal-400 focus:outline-none"
                    placeholder="DEPLOY"
                  />
                </div>
              )}
              <div className="text-xs text-zinc-500">
                Session guardrails: disabled legs stay out, sub-$10 deltas are skipped, and flips are split into reduce-only close then open orders.
              </div>
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 border-t border-zinc-800 bg-zinc-950/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-zinc-400">
              {orderInstructions.length} factor orders · {formatUSD(plan.summary.estimatedMarginUsd)} estimated margin
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800">
                Close
              </button>
              <button
                onClick={handleExecute}
                disabled={!canExecute || submitting}
                className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-sm font-medium text-teal-200 transition-colors hover:bg-teal-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Deploying..." : "Deploy Factor"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className={cn("mt-2 text-sm font-medium", tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-amber-300" : "text-zinc-100")}>
        {value}
      </div>
    </div>
  );
}
