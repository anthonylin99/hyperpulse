import { groupFillsIntoTrades, mergeFundingIntoTrades } from "@/lib/analytics";
import {
  WHALE_DEPOSIT_ALERT_USD,
  WHALE_EPISODE_WINDOW_MS,
  WHALE_HIGH_LEVERAGE,
  WHALE_LIQUIDATION_DISTANCE_PCT,
  WHALE_PROFILE_LOOKBACK_24H_MS,
  WHALE_PROFILE_LOOKBACK_30D_MS,
  WHALE_PROFILE_LOOKBACK_7D_MS,
  WHALE_RISK_LOSS_USD,
} from "@/lib/constants";
import { buildSpotMarketMap, classifyWhaleAsset, type WhaleSpotMarketContext } from "@/lib/whaleTaxonomy";
import type {
  Fill,
  FundingEntry,
  WhaleAlert,
  WhaleAssetClass,
  WhaleBehaviorTag,
  WhaleBucketExposure,
  WhaleConviction,
  WhaleDirectionality,
  WhaleEventType,
  WhaleFocusTag,
  WhaleLedgerEvent,
  WhalePositionSnapshot,
  WhaleRiskBucket,
  WhaleSeverity,
  WhaleStyleTag,
  WhaleTradeSummary,
  WhaleWalletBaselineStats,
  WhaleWalletProfile,
} from "@/types";

function parseNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeLiquidationDistancePct(position: {
  szi: number;
  markPx: number;
  liquidationPx: number | null;
}): number | null {
  if (!position.liquidationPx || position.markPx <= 0) return null;
  if (position.szi > 0) {
    return ((position.markPx - position.liquidationPx) / position.markPx) * 100;
  }
  return ((position.liquidationPx - position.markPx) / position.markPx) * 100;
}

export function buildWhalePositions(
  assetPositions: Array<{
    position: {
      coin: string;
      szi: string;
      entryPx: string;
      positionValue?: string;
      unrealizedPnl: string;
      leverage: { value: number };
      liquidationPx: string | null;
      returnOnEquity: string;
    };
  }>,
): WhalePositionSnapshot[] {
  return assetPositions
    .map((item) => {
      const position = item.position;
      const szi = parseNumber(position.szi);
      if (Math.abs(szi) <= 1e-8) return null;
      const entryPx = parseNumber(position.entryPx);
      const unrealizedPnl = parseNumber(position.unrealizedPnl);
      const markPx = Math.abs(szi) > 0 ? entryPx + unrealizedPnl / szi : entryPx;
      const liquidationPx = position.liquidationPx ? parseNumber(position.liquidationPx) : null;
      const descriptor = classifyWhaleAsset(position.coin, "crypto_perp");
      const notionalUsd = parseNumber(position.positionValue) || Math.abs(szi) * Math.max(markPx, 0);
      return {
        coin: descriptor.symbol,
        side: szi > 0 ? "long" : "short",
        size: Math.abs(szi),
        entryPx,
        markPx,
        notionalUsd,
        leverage: position.leverage?.value ?? 0,
        liquidationPx,
        liquidationDistancePct: computeLiquidationDistancePct({ szi, markPx, liquidationPx }),
        unrealizedPnl,
        returnOnEquity: parseNumber(position.returnOnEquity),
        marketType: descriptor.marketType,
        assetClass: descriptor.assetClass,
        riskBucket: descriptor.riskBucket,
      } satisfies WhalePositionSnapshot;
    })
    .filter((value): value is WhalePositionSnapshot => value != null)
    .sort((a, b) => b.notionalUsd - a.notionalUsd);
}

function buildSpotPositions(
  balances: Array<Record<string, unknown>>,
  spotMarketMap: Record<string, WhaleSpotMarketContext>,
): WhalePositionSnapshot[] {
  return balances
    .map((balance): WhalePositionSnapshot | null => {
      const coin = String(balance.coin ?? "").toUpperCase();
      if (!coin || coin === "USDC") return null;
      const total = parseNumber(balance.total);
      if (!Number.isFinite(total) || total <= 0) return null;
      const market = spotMarketMap[coin];
      if (!market || market.markPx <= 0) return null;
      const entryNtl = parseNumber(balance.entryNtl);
      const entryPx = total > 0 && entryNtl > 0 ? entryNtl / total : market.markPx;
      const notionalUsd = total * market.markPx;
      const unrealizedPnl = entryNtl > 0 ? notionalUsd - entryNtl : 0;
      const returnOnEquity = entryNtl > 0 ? (unrealizedPnl / entryNtl) * 100 : 0;
      return {
        coin: market.symbol,
        side: "long",
        size: total,
        entryPx,
        markPx: market.markPx,
        notionalUsd,
        leverage: 1,
        liquidationPx: null,
        liquidationDistancePct: null,
        unrealizedPnl,
        returnOnEquity,
        marketType: "hip3_spot",
        assetClass: market.assetClass,
        riskBucket: market.riskBucket,
      } satisfies WhalePositionSnapshot;
    })
    .filter((value): value is WhalePositionSnapshot => value != null)
    .sort((a, b) => b.notionalUsd - a.notionalUsd);
}

export function normalizeFills(
  rawFills: Array<Record<string, unknown>>,
  coinAliasMap: Record<string, string> = {},
): Fill[] {
  return (Array.isArray(rawFills) ? rawFills : []).map((f) => ({
    coin: coinAliasMap[String(f.coin ?? "")] ?? String(f.coin ?? ""),
    side: String(f.side ?? "A") as "A" | "B",
    dir: String(f.dir ?? "") as Fill["dir"],
    px: parseNumber(f.px),
    sz: parseNumber(f.sz),
    time: Number(f.time ?? 0),
    fee: parseNumber(f.fee),
    feeToken: String(f.feeToken ?? "USDC"),
    closedPnl: parseNumber(f.closedPnl),
    crossed: Boolean(f.crossed),
    hash: String(f.hash ?? ""),
    liquidation: Boolean(f.liquidation),
    oid: Number(f.oid ?? 0),
    cloid: f.cloid ? String(f.cloid) : null,
  }));
}

export function normalizeFunding(rawFunding: Array<Record<string, unknown>>): FundingEntry[] {
  return (Array.isArray(rawFunding) ? rawFunding : []).map((f) => ({
    time: Number(f.time ?? 0),
    coin: String(f.coin ?? ""),
    usdc: parseNumber(f.usdc),
    positionSize: parseNumber(f.szi),
    fundingRate: parseNumber(f.fundingRate),
    nSamples: Number(f.nSamples ?? 0),
  }));
}

export function normalizeLedgerEvents(
  rawLedger: Array<Record<string, unknown>>,
  address: string,
): WhaleLedgerEvent[] {
  const lower = address.toLowerCase();
  const normalized: WhaleLedgerEvent[] = [];

  for (const [index, entry] of (Array.isArray(rawLedger) ? rawLedger : []).entries()) {
    const delta = entry.delta as Record<string, unknown> | undefined;
    if (!delta || typeof delta !== "object") continue;
    const type = String(delta.type ?? "");
    const time = Number(entry.time ?? 0);
    const hash = entry.hash ? String(entry.hash) : undefined;

    const signedFlow = (() => {
      if (type === "deposit") return parseNumber(delta.usdc);
      if (type === "withdraw") return -parseNumber(delta.usdc) - parseNumber(delta.fee);
      if (type === "accountClassTransfer") return (delta.toPerp ? 1 : -1) * parseNumber(delta.usdc);
      if (type === "internalTransfer") {
        const amt = parseNumber(delta.usdc);
        return String(delta.destination ?? "").toLowerCase() === lower ? amt : -amt;
      }
      if (type === "subAccountTransfer") {
        const amt = parseNumber(delta.usdc);
        return String(delta.destination ?? "").toLowerCase() === lower ? amt : -amt;
      }
      if (type === "spotTransfer" || type === "send") {
        const amt = parseNumber(delta.usdcValue ?? delta.amount);
        return String(delta.destination ?? "").toLowerCase() === lower ? amt : -amt;
      }
      if (type === "rewardsClaim") return parseNumber(delta.amount);
      if (type === "vaultDeposit") return -parseNumber(delta.usdc);
      if (type === "vaultDistribution") return parseNumber(delta.usdc);
      if (type === "vaultWithdraw") return parseNumber(delta.usdc);
      return 0;
    })();

    const normalizedType = (() => {
      switch (type) {
        case "deposit":
          return "deposit" as const;
        case "withdraw":
          return "withdraw" as const;
        case "internalTransfer":
          return "internal-transfer" as const;
        case "spotTransfer":
        case "send":
          return "spot-transfer" as const;
        case "subAccountTransfer":
          return "subaccount-transfer" as const;
        case "accountClassTransfer":
          return "account-class-transfer" as const;
        case "liquidation":
          return "liquidation" as const;
        case "rewardsClaim":
          return "reward" as const;
        default:
          return "vault" as const;
      }
    })();

    const asset = String(delta.token ?? "USDC");
    const label = (() => {
      if (type === "deposit") return `Deposit ${asset}`;
      if (type === "withdraw") return `Withdraw ${asset}`;
      if (type === "accountClassTransfer") return delta.toPerp ? "Transfer to perps" : "Transfer to spot";
      if (type === "internalTransfer") return "Internal transfer";
      if (type === "subAccountTransfer") return "Subaccount transfer";
      if (type === "spotTransfer" || type === "send") return `Spot transfer ${asset}`;
      if (type === "liquidation") return "Liquidation event";
      if (type === "rewardsClaim") return `Rewards claim ${asset}`;
      if (type.startsWith("vault")) return type;
      return type || "Ledger update";
    })();

    normalized.push({
      id: hash ?? `${time}-${type}-${index}`,
      time,
      type: normalizedType,
      direction: signedFlow > 0 ? "in" : signedFlow < 0 ? "out" : "neutral",
      amountUsd: Math.abs(signedFlow),
      asset,
      label,
      hash,
    });
  }

  return normalized.sort((a, b) => b.time - a.time);
}

export function sumLedgerFlowSince(
  ledger: WhaleLedgerEvent[],
  sinceMs: number,
  now = Date.now(),
): number {
  return ledger.reduce((sum, event) => {
    if (event.time < now - sinceMs) return sum;
    if (event.direction === "neutral") return sum;
    return sum + (event.direction === "in" ? event.amountUsd : -event.amountUsd);
  }, 0);
}

export function buildWhaleTrades(fills: Fill[], funding: FundingEntry[]): WhaleTradeSummary[] {
  const trades = mergeFundingIntoTrades(groupFillsIntoTrades(fills), funding);
  return trades
    .sort((a, b) => b.exitTime - a.exitTime)
    .map((trade) => ({
      id: trade.id,
      coin: trade.coin,
      direction: trade.direction,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      durationMs: trade.duration,
      entryPx: trade.entryPx,
      exitPx: trade.exitPx,
      size: trade.size,
      notionalUsd: trade.notional,
      realizedPnl: trade.pnl,
      pnlPct: trade.pnlPct,
      fees: trade.fees,
      funding: trade.fundingPaid,
    }));
}

function deriveBehaviorTags(args: {
  positions: WhalePositionSnapshot[];
  trades: WhaleTradeSummary[];
  netFlow24hUsd: number;
  funding30d: number;
  realizedPnl30d: number;
  unrealizedPnl: number;
}): WhaleBehaviorTag[] {
  const tags: WhaleBehaviorTag[] = [];
  const { positions, trades, netFlow24hUsd, funding30d, realizedPnl30d, unrealizedPnl } = args;
  const totalOpen = positions.reduce((sum, position) => sum + position.notionalUsd, 0);
  const topPosition = positions[0];
  const hasLong = positions.some((position) => position.side === "long");
  const hasShort = positions.some((position) => position.side === "short");
  const avgLeverage = totalOpen > 0 ? positions.reduce((sum, position) => sum + position.notionalUsd * position.leverage, 0) / totalOpen : 0;

  if (netFlow24hUsd >= WHALE_DEPOSIT_ALERT_USD && totalOpen >= 500_000) tags.push("Deposit-led");
  if (avgLeverage >= WHALE_HIGH_LEVERAGE || positions.some((position) => position.leverage >= WHALE_HIGH_LEVERAGE)) {
    tags.push("Aggressive leverage");
  }
  if (topPosition && totalOpen > 0 && topPosition.notionalUsd / totalOpen >= 0.7) {
    tags.push("Single-asset concentrated");
  }
  if (unrealizedPnl <= WHALE_RISK_LOSS_USD) tags.push("Underwater");
  if (hasLong && hasShort) tags.push("Two-sided book");

  const recentTrades = trades.slice(0, 8);
  if (recentTrades.length >= 2) {
    const firstCoin = recentTrades[0].coin;
    const coinTrades = recentTrades.filter((trade) => trade.coin === firstCoin);
    if (coinTrades.length >= 2) {
      const directions = new Set(coinTrades.map((trade) => trade.direction));
      if (directions.size > 1) tags.push("Recent flipper");
    }
  }

  if (recentTrades.length > 0) {
    const profitableLongBias = recentTrades.some((trade) => trade.direction === "long" && trade.realizedPnl > 0);
    const profitableShortBias = recentTrades.some((trade) => trade.direction === "short" && trade.realizedPnl > 0);
    if (profitableLongBias && !profitableShortBias) tags.push("Adds into strength");
    if (profitableShortBias && !profitableLongBias) tags.push("Adds into weakness");
  }

  if (Math.abs(funding30d) >= 50_000 || Math.abs(funding30d) >= Math.abs(realizedPnl30d) * 0.1) {
    tags.push("Funding-sensitive");
  }

  return Array.from(new Set(tags));
}

function buildBucketExposures(positions: WhalePositionSnapshot[]): WhaleBucketExposure[] {
  const map = new Map<WhaleRiskBucket, { long: number; short: number }>();
  for (const position of positions) {
    const current = map.get(position.riskBucket) ?? { long: 0, short: 0 };
    if (position.side === "long") current.long += position.notionalUsd;
    else current.short += position.notionalUsd;
    map.set(position.riskBucket, current);
  }
  return Array.from(map.entries())
    .map(([bucket, values]) => ({
      bucket,
      longNotionalUsd: values.long,
      shortNotionalUsd: values.short,
      netNotionalUsd: values.long - values.short,
    }))
    .sort((a, b) => Math.abs(b.netNotionalUsd) - Math.abs(a.netNotionalUsd));
}

function deriveFocusTags(
  positions: WhalePositionSnapshot[],
  bucketExposures: WhaleBucketExposure[],
): WhaleFocusTag[] {
  const tags: WhaleFocusTag[] = [];
  const bucketSet = new Set(bucketExposures.map((bucket) => bucket.bucket));
  if (bucketSet.has("crypto_beta")) tags.push("Crypto beta");
  if (bucketSet.has("crypto_ai")) tags.push("Crypto AI");
  if (bucketSet.has("crypto_defi")) tags.push("DeFi");
  if (bucketSet.has("crypto_meme")) tags.push("Meme");
  if (bucketSet.has("equities_growth") || bucketSet.has("equities_broad")) tags.push("Stocks");
  if (bucketSet.has("energy")) tags.push("Energy");
  if (bucketSet.has("metals")) tags.push("Metals");
  if (bucketSet.size >= 3 || new Set(positions.map((position) => position.marketType)).size > 1) tags.push("Multi-asset");
  return tags.length > 0 ? Array.from(new Set(tags)) : ["Crypto beta"];
}

function deriveStyleTags(args: {
  trades: WhaleTradeSummary[];
  positions: WhalePositionSnapshot[];
  avgHoldHours30d: number;
  longBiasPct30d: number;
}): WhaleStyleTag[] {
  const { trades, positions, avgHoldHours30d, longBiasPct30d } = args;
  const tags: WhaleStyleTag[] = [];
  const avgLeverageOpen = average(positions.map((position) => position.leverage));
  const pnlSorted = [...trades].sort((a, b) => b.realizedPnl - a.realizedPnl);
  const positiveRate = trades.length > 0 ? trades.filter((trade) => trade.realizedPnl > 0).length / trades.length : 0;

  if (avgLeverageOpen >= WHALE_HIGH_LEVERAGE) tags.push("High leverage");
  if (avgHoldHours30d > 0 && avgHoldHours30d <= 12) tags.push("Scalp trader");
  if (avgHoldHours30d > 12) tags.push("Swing trader");
  if (positiveRate >= 0.55 && pnlSorted.length >= 4) tags.push("Conviction trader");
  if (positions.some((position) => position.side === "long") && positions.some((position) => position.side === "short")) tags.push("Hedger");
  if (longBiasPct30d >= 65) tags.push("Momentum trader");
  if (longBiasPct30d <= 35) tags.push("Dip buyer");

  return tags.length > 0 ? Array.from(new Set(tags)).slice(0, 3) : ["Conviction trader"];
}

function buildBaselineStats(
  trades: WhaleTradeSummary[],
  positions: WhalePositionSnapshot[],
  realizedPnl30d: number,
  bucketExposures: WhaleBucketExposure[],
): WhaleWalletBaselineStats {
  const tradeSizes = trades.map((trade) => trade.notionalUsd).filter((value) => value > 0);
  const holdHours = trades.map((trade) => trade.durationMs / (1000 * 60 * 60)).filter((value) => value > 0);
  const longTrades = trades.filter((trade) => trade.direction === "long").length;
  const volume30d = trades.reduce((sum, trade) => sum + trade.notionalUsd, 0);
  const winningDirectional = trades.filter((trade) => trade.realizedPnl > 0).length;
  const dominantBuckets = bucketExposures.slice(0, 3).map((bucket) => bucket.bucket);
  const assetCounts = new Map<string, number>();
  for (const trade of trades) {
    assetCounts.set(trade.coin, (assetCounts.get(trade.coin) ?? 0) + 1);
  }
  const favoriteAssets = Array.from(assetCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([coin]) => coin);

  return {
    medianTradeSize30d: median(tradeSizes),
    medianLeverage30d: median(positions.map((position) => position.leverage).filter((value) => value > 0)),
    avgHoldHours30d: average(holdHours),
    longBiasPct30d: trades.length > 0 ? (longTrades / trades.length) * 100 : 50,
    realizedPnl30d,
    volume30d,
    favoriteAssets,
    dominantBuckets,
    directionalHitRate30d: trades.length > 0 ? (winningDirectional / trades.length) * 100 : 0,
  };
}

function buildNarrative(args: {
  styleTags: WhaleStyleTag[];
  focusTags: WhaleFocusTag[];
  baseline: WhaleWalletBaselineStats;
  bucketExposures: WhaleBucketExposure[];
}): string {
  const primaryStyle = args.styleTags[0] ?? "Conviction trader";
  const primaryFocus = args.focusTags.slice(0, 2).join(" and ").toLowerCase();
  const dominantBucket = args.bucketExposures[0];
  const avgTradeSize = args.baseline.medianTradeSize30d;
  const avgHold = args.baseline.avgHoldHours30d;

  const bucketText = dominantBucket
    ? `${dominantBucket.bucket.replace(/_/g, " ")} is the largest current bucket`
    : "book is currently flat";

  return `${primaryStyle} focused on ${primaryFocus}. Median trade size ${avgTradeSize > 0 ? `$${avgTradeSize.toLocaleString()}` : "n/a"}; median hold ${avgHold > 0 ? `${avgHold.toFixed(1)}h` : "n/a"}; ${bucketText}.`;
}

export function buildWhaleProfile(args: {
  address: string;
  perpState: Record<string, unknown>;
  spotState: Record<string, unknown>;
  fills: Fill[];
  funding: FundingEntry[];
  ledger: WhaleLedgerEvent[];
  activeAlerts?: WhaleAlert[];
  firstSeenAt?: number | null;
  lastSeenAt?: number | null;
  spotMarketMap?: Record<string, WhaleSpotMarketContext>;
}): WhaleWalletProfile {
  const { address, perpState, spotState, fills, funding, ledger, activeAlerts = [], firstSeenAt, lastSeenAt, spotMarketMap = {} } = args;
  const perpPositions = buildWhalePositions(
    (((perpState.assetPositions as Array<{ position: Record<string, unknown> }>) ?? []) as Array<{
      position: {
        coin: string;
        szi: string;
        entryPx: string;
        positionValue?: string;
        unrealizedPnl: string;
        leverage: { value: number };
        liquidationPx: string | null;
        returnOnEquity: string;
      };
    }>),
  );

  const balances = (spotState.balances as Array<Record<string, unknown>> | undefined) ?? [];
  const spotPositions = buildSpotPositions(balances, spotMarketMap);
  const positions = [...perpPositions, ...spotPositions].sort((a, b) => b.notionalUsd - a.notionalUsd);
  const trades = buildWhaleTrades(fills, funding);
  const usdcBalance = balances.find((balance) => String(balance.coin ?? "") === "USDC");
  const spotUsdc = usdcBalance ? parseNumber(usdcBalance.total) : 0;
  const totalOpenNotionalUsd = positions.reduce((sum, position) => sum + position.notionalUsd, 0);
  const unrealizedPnl = positions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
  const accountEquity = parseNumber((perpState.marginSummary as Record<string, unknown> | undefined)?.accountValue) + spotUsdc;
  const perpsEquity = parseNumber((perpState.marginSummary as Record<string, unknown> | undefined)?.accountValue);
  const realizedPnl30d = trades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const funding30d = funding.reduce((sum, item) => sum + item.usdc, 0);
  const averageLeverage = totalOpenNotionalUsd > 0 ? positions.reduce((sum, position) => sum + position.notionalUsd * position.leverage, 0) / totalOpenNotionalUsd : 0;
  const dominantAssets = positions.slice(0, 4).map((position) => position.coin);
  const netFlow24hUsd = sumLedgerFlowSince(ledger, WHALE_PROFILE_LOOKBACK_24H_MS);
  const netFlow7dUsd = sumLedgerFlowSince(ledger, WHALE_PROFILE_LOOKBACK_7D_MS);
  const netFlow30dUsd = sumLedgerFlowSince(ledger, WHALE_PROFILE_LOOKBACK_30D_MS);
  const behaviorTags = deriveBehaviorTags({ positions, trades, netFlow24hUsd, funding30d, realizedPnl30d, unrealizedPnl });
  const bucketExposures = buildBucketExposures(positions);
  const baseline = buildBaselineStats(trades, positions, realizedPnl30d, bucketExposures);
  const focusTags = deriveFocusTags(positions, bucketExposures);
  const styleTags = deriveStyleTags({
    trades,
    positions,
    avgHoldHours30d: baseline.avgHoldHours30d,
    longBiasPct30d: baseline.longBiasPct30d,
  });

  const discoveredTimes = [
    firstSeenAt,
    fills.length > 0 ? Math.min(...fills.map((fill) => fill.time)) : null,
    ledger.length > 0 ? Math.min(...ledger.map((event) => event.time)) : null,
  ].filter((value): value is number => value != null);

  const recentTimes = [
    lastSeenAt,
    fills.length > 0 ? Math.max(...fills.map((fill) => fill.time)) : null,
    ledger.length > 0 ? Math.max(...ledger.map((event) => event.time)) : null,
    (perpState.time as number | undefined) ?? null,
  ].filter((value): value is number => value != null);

  return {
    address,
    firstSeenAt: discoveredTimes.length > 0 ? Math.min(...discoveredTimes) : null,
    lastSeenAt: recentTimes.length > 0 ? Math.max(...recentTimes) : null,
    accountEquity,
    perpsEquity,
    spotUsdc,
    totalOpenNotionalUsd,
    unrealizedPnl,
    realizedPnl30d,
    funding30d,
    openPositionsCount: positions.length,
    averageLeverage,
    dominantAssets,
    netFlow24hUsd,
    netFlow7dUsd,
    netFlow30dUsd,
    behaviorTags,
    styleTags,
    focusTags,
    baseline,
    medianTradeSize30d: baseline.medianTradeSize30d,
    avgHoldHours30d: baseline.avgHoldHours30d,
    directionalHitRate30d: baseline.directionalHitRate30d,
    bucketExposures,
    narrative: buildNarrative({ styleTags, focusTags, baseline, bucketExposures }),
    positions,
    trades,
    ledger,
    activeAlerts,
  };
}

export function severityRank(severity: WhaleSeverity): number {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

export function buildAlertHeadline(args: {
  eventType: WhaleEventType;
  directionality: WhaleDirectionality;
  coin: string;
  side: "long" | "short";
  leverage: number | null;
  netFlow24hUsd: number;
  assetClass: WhaleAssetClass;
}): string {
  const lev = args.leverage ? `${args.leverage.toFixed(1)}x` : "spot";
  if (args.eventType === "deposit-led-long" || args.eventType === "deposit-led-short") {
    return `Deposit-led ${args.assetClass.toLowerCase()} ${args.side} in ${args.coin} at ${lev}`;
  }
  if (args.directionality === "stress" || args.eventType === "underwater-whale") {
    return `Underwater whale in ${args.coin} ${args.side}`;
  }
  if (args.directionality === "hedge") {
    return `Hedge overlay in ${args.coin}`;
  }
  if (args.directionality === "rotation") {
    return `Rotation into ${args.coin}`;
  }
  if (args.directionality === "reduce" || args.eventType === "reduce") {
    return `De-risking ${args.coin}`;
  }
  return args.directionality === "directional_add"
    ? `Directional add in ${args.coin} ${args.side}`
    : `Directional entry in ${args.coin} ${args.side}`;
}

export function coalesceEpisodeId(address: string, coin: string, timestamp: number): string {
  return `${address.toLowerCase()}:${coin}:${Math.floor(timestamp / WHALE_EPISODE_WINDOW_MS)}`;
}

export function inferSeverity(profile: WhaleWalletProfile, notionalUsd: number): WhaleSeverity {
  const nearestDistance = profile.positions.reduce<number | null>((nearest, position) => {
    if (position.liquidationDistancePct == null) return nearest;
    if (nearest == null) return position.liquidationDistancePct;
    return Math.min(nearest, position.liquidationDistancePct);
  }, null);

  if (
    notionalUsd >= 2_000_000 ||
    profile.unrealizedPnl <= WHALE_RISK_LOSS_USD ||
    (nearestDistance != null && nearestDistance < WHALE_LIQUIDATION_DISTANCE_PCT)
  ) {
    return "high";
  }
  if (notionalUsd >= 1_000_000 || profile.averageLeverage >= WHALE_HIGH_LEVERAGE) {
    return "medium";
  }
  return "low";
}

export function convictionFromSeverity(severity: WhaleSeverity, sizeVsWalletAverage: number): WhaleConviction {
  if (severity === "high" || sizeVsWalletAverage >= 2.5) return "high";
  if (severity === "medium" || sizeVsWalletAverage >= 1.4) return "medium";
  return "low";
}

export { buildSpotMarketMap };
