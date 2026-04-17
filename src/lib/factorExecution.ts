import type {
  EditableFactorLeg,
  FactorExecutionLeg,
  FactorExecutionPlan,
  FactorSnapshot,
  MarketAsset,
  Position,
} from "@/types";
import { formatOrderSize } from "@/lib/orderSizing";

export interface FactorExecutionOrderInstruction {
  symbol: string;
  assetIndex: number;
  side: "buy" | "sell";
  size: string;
  price: string;
  reduceOnly: boolean;
  phase: "rebalance-close" | "rebalance-open" | "delta";
}

const MIN_LEG_NOTIONAL_USD = 10;

function clampPositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function roundToDecimals(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** Math.max(0, decimals);
  return Math.round(value * factor) / factor;
}

function truncateToDecimals(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** Math.max(0, decimals);
  return Math.trunc(value * factor) / factor;
}

function inferPriceDecimals(markPx: number): number {
  if (markPx < 0.01) return 6;
  if (markPx < 1) return 4;
  return 2;
}

function formatOrderPrice(markPx: number, sizeDecimals: number, side: "buy" | "sell", slippageBps: number): string {
  const slipped = markPx * (side === "buy" ? 1 + slippageBps / 10_000 : 1 - slippageBps / 10_000);
  const maxDecimals = Math.max(0, 6 - sizeDecimals);
  const abs = Math.abs(slipped);
  if (!Number.isFinite(abs) || abs <= 0) return markPx.toFixed(inferPriceDecimals(markPx));
  const sigDecimals = Math.max(0, 5 - Math.floor(Math.log10(abs)) - 1);
  const decimals = Math.min(maxDecimals, sigDecimals);
  return slipped.toFixed(decimals);
}

function normalizeWeights(legs: EditableFactorLeg[]): Map<string, number> {
  const enabled = legs.filter((leg) => leg.enabled);
  const sum = enabled.reduce((total, leg) => total + clampPositive(leg.weight), 0);
  const equalWeight = enabled.length > 0 ? 1 / enabled.length : 0;
  return new Map(
    legs.map((leg) => {
      if (!leg.enabled) return [leg.symbol, 0];
      if (sum <= 0) return [leg.symbol, equalWeight];
      return [leg.symbol, clampPositive(leg.weight) / sum];
    }),
  );
}

export function buildDefaultFactorLegs(snapshot: FactorSnapshot): EditableFactorLeg[] {
  return [
    ...snapshot.longs.map((holding) => ({
      symbol: holding.symbol,
      enabled: true,
      side: "long" as const,
      weight: holding.weight ?? 1,
      sourceRole: "long" as const,
    })),
    ...snapshot.shorts.map((holding) => ({
      symbol: holding.symbol,
      enabled: true,
      side: "short" as const,
      weight: holding.weight ?? 1,
      sourceRole: "short" as const,
    })),
  ];
}

export function buildFactorExecutionPlan(args: {
  snapshot: FactorSnapshot;
  editableLegs: EditableFactorLeg[];
  assets: MarketAsset[];
  positions: Position[];
  longGrossUsd: number;
  shortGrossUsd: number;
  leverage: number;
  slippageBps: number;
}): FactorExecutionPlan {
  const {
    snapshot,
    editableLegs,
    assets,
    positions,
    longGrossUsd,
    shortGrossUsd,
    leverage,
    slippageBps,
  } = args;

  const longGross = clampPositive(longGrossUsd);
  const shortGross = clampPositive(shortGrossUsd);
  const safeLeverage = Math.max(1, Math.floor(leverage));
  const safeSlippageBps = Math.max(1, Math.floor(slippageBps));

  const assetMap = new Map(assets.map((asset) => [asset.coin.toUpperCase(), asset]));
  const positionMap = new Map(positions.map((position) => [position.coin.toUpperCase(), position]));

  const longWeights = normalizeWeights(editableLegs.filter((leg) => leg.side === "long"));
  const shortWeights = normalizeWeights(editableLegs.filter((leg) => leg.side === "short"));

  const legs: FactorExecutionLeg[] = editableLegs.map((leg) => {
    const symbol = leg.symbol.toUpperCase();
    const asset = assetMap.get(symbol) ?? null;
    const position = positionMap.get(symbol) ?? null;
    const normalizedWeight =
      leg.side === "long" ? longWeights.get(leg.symbol) ?? 0 : shortWeights.get(leg.symbol) ?? 0;
    const grossForSide = leg.side === "long" ? longGross : shortGross;
    const targetNotionalUsd = leg.enabled ? grossForSide * normalizedWeight : 0;
    const signedTargetNotional = leg.side === "long" ? targetNotionalUsd : -targetNotionalUsd;
    const currentQty = position?.szi ?? 0;

    if (!asset) {
      return {
        symbol,
        assetIndex: null,
        enabled: leg.enabled,
        side: leg.side,
        sourceRole: leg.sourceRole,
        weightInput: leg.weight,
        normalizedWeight,
        markPx: null,
        priceDecimals: 2,
        sizeDecimals: 0,
        currentQty,
        targetQty: 0,
        deltaQty: 0,
        targetNotionalUsd: signedTargetNotional,
        deltaNotionalUsd: 0,
        orderPrice: null,
        marginRequiredUsd: 0,
        liveChange24h: null,
        fundingAPR: null,
        signalLabel: null,
        status: "unmapped",
        statusReason: "Not currently tradable on Hyperliquid.",
      };
    }

    const markPx = asset.markPx;
    const rawTargetQty = markPx > 0 ? signedTargetNotional / markPx : 0;
    const targetQty = truncateToDecimals(rawTargetQty, asset.szDecimals);
    const deltaQty = truncateToDecimals(targetQty - currentQty, asset.szDecimals);
    const deltaNotionalUsd = deltaQty * markPx;
    const orderPrice =
      deltaQty === 0 ? null : formatOrderPrice(markPx, asset.szDecimals, deltaQty > 0 ? "buy" : "sell", safeSlippageBps);

    let status: FactorExecutionLeg["status"] = "ready";
    let statusReason: string | null = null;
    if (!leg.enabled && currentQty === 0) {
      status = "skipped";
      statusReason = "Disabled and no current position to rebalance.";
    } else if (deltaQty === 0) {
      status = "skipped";
      statusReason = leg.enabled
        ? "Rounded to zero delta at current sizing."
        : "Already flat for this disabled leg.";
    } else if (Math.abs(deltaNotionalUsd) < MIN_LEG_NOTIONAL_USD) {
      status = "skipped";
      statusReason = `Delta below $${MIN_LEG_NOTIONAL_USD} minimum order notional.`;
    }

    return {
      symbol,
      assetIndex: asset.assetIndex,
      enabled: leg.enabled,
      side: leg.side,
      sourceRole: leg.sourceRole,
      weightInput: roundToDecimals(leg.weight, 4),
      normalizedWeight,
      markPx,
      priceDecimals: inferPriceDecimals(markPx),
      sizeDecimals: asset.szDecimals,
      currentQty,
      targetQty,
      deltaQty,
      targetNotionalUsd: signedTargetNotional,
      deltaNotionalUsd,
      orderPrice,
      marginRequiredUsd: Math.abs(signedTargetNotional) / safeLeverage,
      liveChange24h: asset.priceChange24h,
      fundingAPR: asset.fundingAPR,
      signalLabel: asset.signal.label,
      status,
      statusReason,
    };
  });

  const executableLegs = legs.filter((leg) => leg.status === "ready" && Math.abs(leg.deltaQty) > 0);
  const skippedLegs = legs.filter((leg) => leg.status !== "ready");
  const activeLongLegs = editableLegs.filter((leg) => leg.enabled && leg.side === "long").length;
  const activeShortLegs = editableLegs.filter((leg) => leg.enabled && leg.side === "short").length;
  const mappedEnabledCount = editableLegs.filter(
    (leg) => leg.enabled && assetMap.has(leg.symbol.toUpperCase()),
  ).length;
  const enabledCount = editableLegs.filter((leg) => leg.enabled).length;

  return {
    factorId: snapshot.id,
    factorName: snapshot.name,
    leverage: safeLeverage,
    slippageBps: safeSlippageBps,
    summary: {
      longGrossUsd: longGross,
      shortGrossUsd: shortGross,
      grossUsd: longGross + shortGross,
      netUsd: longGross - shortGross,
      estimatedMarginUsd: legs.reduce((sum, leg) => sum + leg.marginRequiredUsd, 0),
      activeLongLegs,
      activeShortLegs,
      tradableCoverage: enabledCount > 0 ? mappedEnabledCount / enabledCount : 0,
    },
    legs,
    executableLegs,
    skippedLegs,
  };
}

export function buildFactorExecutionOrders(
  plan: FactorExecutionPlan,
): FactorExecutionOrderInstruction[] {
  const orders: FactorExecutionOrderInstruction[] = [];

  for (const leg of plan.executableLegs) {
    if (leg.assetIndex == null || !leg.orderPrice) continue;

    const currentSign = Math.sign(leg.currentQty);
    const targetSign = Math.sign(leg.targetQty);

    if (currentSign !== 0 && targetSign !== 0 && currentSign !== targetSign) {
      orders.push({
        symbol: leg.symbol,
        assetIndex: leg.assetIndex,
        side: leg.currentQty > 0 ? "sell" : "buy",
        size: formatOrderSize(leg.currentQty, leg.sizeDecimals),
        price: formatOrderPrice(
          leg.markPx ?? 0,
          leg.sizeDecimals,
          leg.currentQty > 0 ? "sell" : "buy",
          plan.slippageBps,
        ),
        reduceOnly: true,
        phase: "rebalance-close",
      });

      orders.push({
        symbol: leg.symbol,
        assetIndex: leg.assetIndex,
        side: leg.targetQty > 0 ? "buy" : "sell",
        size: formatOrderSize(leg.targetQty, leg.sizeDecimals),
        price: formatOrderPrice(
          leg.markPx ?? 0,
          leg.sizeDecimals,
          leg.targetQty > 0 ? "buy" : "sell",
          plan.slippageBps,
        ),
        reduceOnly: false,
        phase: "rebalance-open",
      });
      continue;
    }

    const isReduceOnly =
      currentSign !== 0 &&
      (targetSign === 0 ||
        (currentSign === targetSign && Math.abs(leg.targetQty) < Math.abs(leg.currentQty)));

    orders.push({
      symbol: leg.symbol,
      assetIndex: leg.assetIndex,
      side: leg.deltaQty > 0 ? "buy" : "sell",
      size: formatOrderSize(leg.deltaQty, leg.sizeDecimals),
      price: leg.orderPrice,
      reduceOnly: isReduceOnly,
      phase: "delta",
    });
  }

  return orders.filter((order) => Number(order.size) > 0);
}
