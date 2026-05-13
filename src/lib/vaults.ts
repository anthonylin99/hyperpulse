import { getInfoClient, type HyperliquidNetwork } from "@/lib/hyperliquid";
import { VAULT_SEED } from "@/lib/vaultSeed";
import type { Fill } from "@/types";
import type {
  StrategyAssetSlice,
  StrategyFingerprint,
  VaultDetails,
  VaultListItem,
  VaultListResult,
  VaultMetrics,
  VaultPeriod,
  VaultPortfolioWindow,
} from "@/types/vaults";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAILY_RETURN_SAMPLES = 30;
const SAMPLE_WINDOW_DAYS = 30;
const MAX_VAULT_LIST_CONCURRENCY = 3;

// ─── Normalization ─────────────────────────────────────────────

type RawPortfolioWindow = {
  accountValueHistory?: Array<[number, string | number]>;
  pnlHistory?: Array<[number, string | number]>;
  vlm?: string | number;
};

type RawVaultSummary = {
  vaultAddress?: string;
  address?: string;
  tvl?: string | number;
};

function parseFloatSafe(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function parseNullableFloat(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeHistory(history: Array<[number, string | number]> | undefined): Array<[number, number]> {
  return (history ?? [])
    .map(([t, v]) => [Number(t), parseFloatSafe(v)] as [number, number])
    .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v))
    .sort((a, b) => a[0] - b[0]);
}

function normalizePortfolio(
  raw: ReadonlyArray<[string, RawPortfolioWindow]>,
): VaultPortfolioWindow[] {
  const wantedPeriods: VaultPeriod[] = ["day", "week", "month", "allTime"];
  return raw
    .filter(([period]) => wantedPeriods.includes(period as VaultPeriod))
    .map(([period, data]) => ({
      period: period as VaultPeriod,
      accountValueHistory: normalizeHistory(data.accountValueHistory),
      pnlHistory: normalizeHistory(data.pnlHistory),
      vlm: parseFloatSafe(data.vlm),
    }));
}

export function normalizeVaultFill(raw: unknown): Fill | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const dir = String(value.dir ?? "");
  if (!["Open Long", "Close Long", "Open Short", "Close Short", "Buy", "Sell"].includes(dir)) {
    return null;
  }
  const coin = String(value.coin ?? "").trim();
  const side = value.side === "A" || value.side === "B" ? value.side : "A";
  const time = Number(value.time);
  const px = parseFloatSafe(value.px as string | number | null | undefined);
  const sz = parseFloatSafe(value.sz as string | number | null | undefined);
  if (!coin || !Number.isFinite(time) || px <= 0 || sz <= 0) return null;
  return {
    coin,
    side,
    dir: dir as Fill["dir"],
    px,
    sz,
    time,
    fee: parseFloatSafe(value.fee as string | number | null | undefined),
    feeToken: String(value.feeToken ?? "USDC"),
    closedPnl: parseFloatSafe(value.closedPnl as string | number | null | undefined),
    crossed: Boolean(value.crossed),
    hash: String(value.hash ?? `${coin}-${time}-${px}-${sz}`),
    liquidation: Boolean(value.liquidation),
    oid: Number.isFinite(Number(value.oid)) ? Number(value.oid) : 0,
    cloid: typeof value.cloid === "string" ? value.cloid : null,
  };
}

// ─── API fetchers ──────────────────────────────────────────────

async function fetchRecentVaultSummaries(
  network: HyperliquidNetwork,
): Promise<Map<string, number>> {
  const info = getInfoClient(network);
  try {
    const summaries = (await info.vaultSummaries()) as RawVaultSummary[];
    const out = new Map<string, number>();
    for (const summary of summaries ?? []) {
      const address = String(summary.vaultAddress ?? summary.address ?? "").toLowerCase();
      const tvl = parseNullableFloat(summary.tvl);
      if (address.startsWith("0x") && tvl != null) out.set(address, tvl);
    }
    return out;
  } catch {
    return new Map();
  }
}

export async function fetchVaultDetails(
  vaultAddress: string,
  network: HyperliquidNetwork = "mainnet",
  summaryTvl: number | null = null,
): Promise<VaultDetails | null> {
  const info = getInfoClient(network);
  const raw = await info.vaultDetails({ vaultAddress: vaultAddress as `0x${string}` });
  if (!raw) return null;
  return {
    vaultAddress: raw.vaultAddress,
    name: raw.name,
    leader: raw.leader,
    description: raw.description,
    apr: raw.apr,
    leaderFraction: raw.leaderFraction,
    leaderCommission: raw.leaderCommission,
    isClosed: raw.isClosed,
    allowDeposits: raw.allowDeposits,
    summaryTvl,
    followers: (raw.followers ?? []).map((f) => ({
      user: f.user,
      vaultEquity: parseFloatSafe(f.vaultEquity),
      pnl: parseFloatSafe(f.pnl),
      allTimePnl: parseFloatSafe(f.allTimePnl),
      daysFollowing: f.daysFollowing,
      vaultEntryTime: f.vaultEntryTime,
      lockupUntil: f.lockupUntil,
    })),
    portfolio: normalizePortfolio(raw.portfolio as never),
  };
}

// ─── Metric helpers ────────────────────────────────────────────

function getWindow(vault: VaultDetails, period: VaultPeriod): VaultPortfolioWindow | null {
  return vault.portfolio.find((p) => p.period === period) ?? null;
}

function latestPoint(history: Array<[number, number]>): [number, number] | null {
  return history.length > 0 ? history[history.length - 1] : null;
}

function latestAccountValue(vault: VaultDetails): number | null {
  const windows: VaultPeriod[] = ["allTime", "month", "week", "day"];
  for (const period of windows) {
    const point = latestPoint(getWindow(vault, period)?.accountValueHistory ?? []);
    if (point && point[1] > 0) return point[1];
  }
  return null;
}

function equityAtOrBefore(history: Array<[number, number]>, time: number): number | null {
  if (history.length === 0) return null;
  let candidate: number | null = null;
  for (const [t, v] of history) {
    if (t <= time && v > 0) candidate = v;
    if (t > time) break;
  }
  return candidate ?? history.find(([, v]) => v > 0)?.[1] ?? null;
}

function pnlReturnPct(window: VaultPortfolioWindow | null): number | null {
  if (!window || window.pnlHistory.length < 2) return null;
  const start = window.pnlHistory[0];
  const end = window.pnlHistory[window.pnlHistory.length - 1];
  const startingEquity = equityAtOrBefore(window.accountValueHistory, start[0]);
  if (!startingEquity || startingEquity <= 0) return null;
  return ((end[1] - start[1]) / startingEquity) * 100;
}

function dailyReturnsFromPnl(
  equityHistory: Array<[number, number]>,
  pnlHistory: Array<[number, number]>,
): Array<{ time: number; ret: number }> {
  if (pnlHistory.length < 2) return [];
  const byDay = new Map<number, { time: number; pnl: number; equity: number | null }>();
  for (const [time, pnl] of pnlHistory) {
    const day = Math.floor(time / DAY_MS);
    byDay.set(day, { time, pnl, equity: equityAtOrBefore(equityHistory, time) });
  }
  const sortedDays = Array.from(byDay.values()).sort((a, b) => a.time - b.time);
  const out: Array<{ time: number; ret: number }> = [];
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = sortedDays[i - 1];
    const curr = sortedDays[i];
    const baseEquity = prev.equity;
    if (!baseEquity || baseEquity <= 0) continue;
    out.push({ time: curr.time, ret: (curr.pnl - prev.pnl) / baseEquity });
  }
  return out;
}

function maxDrawdownFromReturns(returns: Array<{ time: number; ret: number }>): {
  pct: number | null;
  at: number | null;
} {
  if (returns.length === 0) return { pct: null, at: null };
  let index = 1;
  let peak = 1;
  let maxDD = 0;
  let at: number | null = null;
  for (const point of returns) {
    index *= 1 + point.ret;
    if (index > peak) peak = index;
    if (peak <= 0) continue;
    const dd = (index - peak) / peak;
    if (dd < maxDD) {
      maxDD = dd;
      at = point.time;
    }
  }
  return { pct: Math.abs(maxDD), at };
}

function sharpeAnnualized(returns: number[]): number | null {
  if (returns.length < MIN_DAILY_RETURN_SAMPLES) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return null;
  return (mean / std) * Math.sqrt(365);
}

function calmarAnnualized(
  returns: Array<{ time: number; ret: number }>,
  maxDDPct: number | null,
): number | null {
  if (maxDDPct == null || maxDDPct === 0 || returns.length < 2) return null;
  const totalReturn = returns.reduce((index, point) => index * (1 + point.ret), 1) - 1;
  const days = (returns[returns.length - 1].time - returns[0].time) / DAY_MS;
  if (days <= 0 || 1 + totalReturn <= 0) return null;
  const annualized = Math.pow(1 + totalReturn, 365 / days) - 1;
  return annualized / maxDDPct;
}

function trimWindow<T extends [number, number]>(history: T[], cutoff: number): T[] {
  return history.filter(([t]) => t >= cutoff);
}

function followerEquitySum(vault: VaultDetails): number {
  return vault.followers.reduce((s, f) => s + f.vaultEquity, 0);
}

function vaultSparkline(vault: VaultDetails, maxPoints = 28): number[] {
  const preferred: VaultPeriod[] = ["month", "week", "allTime", "day"];
  let history: Array<[number, number]> = [];
  for (const period of preferred) {
    history = getWindow(vault, period)?.accountValueHistory ?? [];
    if (history.length >= 2) break;
  }
  const values = history.map(([, value]) => value).filter((value) => Number.isFinite(value) && value > 0);
  if (values.length <= maxPoints) return values;
  const step = (values.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => values[Math.round(index * step)]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreVaultRisk(metrics: Omit<VaultMetrics, "score">): VaultMetrics["score"] {
  const flags: string[] = [];
  let score = 50;

  const return30 = metrics.return30dPct;
  if (return30 == null) {
    flags.push("No 30d P&L sample");
    score -= 10;
  } else if (return30 > 5) {
    flags.push("Strong 30d return");
    score += 22;
  } else if (return30 > 1) {
    flags.push("Positive 30d return");
    score += 12;
  } else if (return30 < -5) {
    flags.push("Weak 30d return");
    score -= 24;
  } else if (return30 < 0) {
    flags.push("Slightly negative 30d");
    score -= 10;
  }

  const drawdownPct = metrics.maxDrawdownPct == null ? null : metrics.maxDrawdownPct * 100;
  if (drawdownPct == null) {
    flags.push("Drawdown not established");
    score -= 6;
  } else if (drawdownPct <= 3) {
    flags.push("Controlled drawdown");
    score += 14;
  } else if (drawdownPct <= 10) {
    flags.push("Moderate drawdown");
    score += 4;
  } else if (drawdownPct > 25) {
    flags.push("Large drawdown");
    score -= 24;
  } else {
    flags.push("Elevated drawdown");
    score -= 10;
  }

  if (metrics.sharpe90d != null) {
    if (metrics.sharpe90d >= 2) {
      flags.push("High Sharpe");
      score += 16;
    } else if (metrics.sharpe90d >= 1) {
      flags.push("Positive Sharpe");
      score += 8;
    } else if (metrics.sharpe90d < 0) {
      flags.push("Negative Sharpe");
      score -= 16;
    }
  } else {
    flags.push("Sharpe sample too thin");
    score -= 8;
  }

  if (metrics.tvl >= 10_000_000) {
    flags.push("Deep capital base");
    score += 8;
  } else if (metrics.tvl >= 1_000_000) {
    flags.push("Meaningful TVL");
    score += 4;
  } else if (metrics.tvl < 250_000) {
    flags.push("Small vault");
    score -= 10;
  }

  if (metrics.followerCount >= 50) {
    flags.push("Broad depositor base");
    score += 6;
  } else if (metrics.followerCount < 5) {
    flags.push("Few followers");
    score -= 8;
  }

  if (metrics.historyDays >= 180) {
    flags.push("Long history");
    score += 8;
  } else if (metrics.historyDays >= 30) {
    flags.push("Enough history for review");
    score += 2;
  } else {
    flags.push("Short history");
    score -= 14;
  }

  if (metrics.tvlChange7dPct != null) {
    if (metrics.tvlChange7dPct > 10) {
      flags.push("7d equity increased");
      score += 4;
    } else if (metrics.tvlChange7dPct < -15) {
      flags.push("7d equity declined");
      score -= 8;
    }
  }

  const caps: Array<{ cap: number; flag: string }> = [];
  if (metrics.historyDays < 30) {
    caps.push({ cap: 55, flag: "Screen capped: short history" });
  } else if (metrics.historyDays < 90) {
    caps.push({ cap: 72, flag: "Screen capped: limited history" });
  }
  if (metrics.dailyReturnSamples < MIN_DAILY_RETURN_SAMPLES) {
    caps.push({ cap: 82, flag: "Thin risk sample" });
  }
  if (metrics.maxDrawdownPct == null) {
    caps.push({ cap: 68, flag: "No drawdown sample" });
  }
  if (metrics.tvlSource !== "account_value") {
    caps.push({ cap: 75, flag: "TVL source less reliable" });
  }

  const rawNormalized = Math.round(clamp(score, 0, 100));
  const normalized = caps.reduce((value, entry) => Math.min(value, entry.cap), rawNormalized);
  for (const cap of caps) {
    if (!flags.includes(cap.flag)) flags.unshift(cap.flag);
  }

  let decision: VaultMetrics["score"]["decision"] = "review";
  let label = "Review carefully";
  let reason = "Mixed profile: inspect drawdown, operator behavior, deposits status, and recent P&L before depositing.";
  if (
    normalized >= 72 &&
    metrics.historyDays >= 30 &&
    metrics.dailyReturnSamples >= 7 &&
    (metrics.return30dPct ?? 0) >= 0
  ) {
    decision = "watch";
    label = "Candidate";
    reason = "Best candidate for deeper review: positive recent P&L, acceptable sampled drawdown, and enough history to inspect.";
  } else if (normalized <= 40 || (metrics.return30dPct ?? 0) < -8) {
    decision = "avoid";
    label = "High risk";
    reason = "Risk/reward is weak right now: negative returns, thin history, or drawdown concerns dominate.";
  }

  const confidence = metrics.dailyReturnSamples >= MIN_DAILY_RETURN_SAMPLES && metrics.historyDays >= 90 && metrics.maxDrawdownPct != null
    ? "high"
    : metrics.historyDays >= 30 && metrics.maxDrawdownPct != null
      ? "medium"
      : "low";

  return {
    score: normalized,
    decision,
    label,
    reason,
    confidence,
    flags: flags.slice(0, 4),
  };
}

// ─── Public: compute metrics + TVL ─────────────────────────────

export function computeVaultMetrics(vault: VaultDetails): VaultMetrics {
  const accountValue = latestAccountValue(vault);
  const followersSum = followerEquitySum(vault);
  const tvl = accountValue ?? vault.summaryTvl ?? followersSum;
  const tvlSource = accountValue != null
    ? "account_value"
    : vault.summaryTvl != null
      ? "summary_tvl"
      : followersSum > 0
        ? "followers_sum"
        : "unavailable";

  const allTime = getWindow(vault, "allTime");
  const month = getWindow(vault, "month");
  const week = getWindow(vault, "week");

  const weekHistory = week?.accountValueHistory ?? [];
  let tvlChange7dPct: number | null = null;
  if (weekHistory.length >= 2 && weekHistory[0][1] > 0) {
    tvlChange7dPct = ((weekHistory[weekHistory.length - 1][1] - weekHistory[0][1]) / weekHistory[0][1]) * 100;
  }

  const return30dPct = pnlReturnPct(month);
  const returnAllTimePct = pnlReturnPct(allTime);

  const now = Date.now();
  const ninetyDayCutoff = now - 90 * DAY_MS;
  const allEquity = allTime?.accountValueHistory ?? [];
  const allPnl = allTime?.pnlHistory ?? [];
  const trimmedEquity = trimWindow(allEquity, ninetyDayCutoff);
  const trimmedPnl = trimWindow(allPnl, ninetyDayCutoff);
  const dailyReturns = dailyReturnsFromPnl(trimmedEquity, trimmedPnl);
  const sharpe90d = sharpeAnnualized(dailyReturns.map((d) => d.ret));
  const dd = maxDrawdownFromReturns(dailyReturns);
  const calmar90d = calmarAnnualized(dailyReturns, dd.pct);

  const allHistory = allTime?.accountValueHistory ?? [];
  const historyDays = allHistory.length >= 2
    ? Math.max(0, (allHistory[allHistory.length - 1][0] - allHistory[0][0]) / DAY_MS)
    : 0;

  const baseMetrics = {
    tvl,
    tvlSource,
    tvlChange7dPct,
    return30dPct,
    returnAllTimePct,
    maxDrawdownPct: dd.pct,
    maxDrawdownAt: dd.at,
    maxDrawdownFromEquity: null,
    maxDrawdownToEquity: null,
    sharpe90d,
    calmar90d,
    dailyReturnSamples: dailyReturns.length,
    followerCount: vault.followers.length,
    historyDays,
  } satisfies Omit<VaultMetrics, "score">;

  return {
    ...baseMetrics,
    score: scoreVaultRisk(baseMetrics),
  };
}

// ─── Strategy fingerprint ──────────────────────────────────────

export function computeStrategyFingerprint(
  fills: Fill[],
  windowDays = SAMPLE_WINDOW_DAYS,
): StrategyFingerprint {
  const cutoff = Date.now() - windowDays * DAY_MS;
  const recent = fills
    .filter((f) => f.time >= cutoff)
    .sort((a, b) => a.time - b.time);

  if (recent.length === 0) {
    return {
      fillCount: 0,
      topAssets: [],
      longShortBias: null,
      tradesPerDay: null,
      medianHoldTimeMs: null,
      topAssetConcentrationPct: null,
      sampleWindowDays: windowDays,
    };
  }

  const byCoin = new Map<string, { buy: number; sell: number }>();
  for (const f of recent) {
    const notional = f.px * f.sz;
    const entry = byCoin.get(f.coin) ?? { buy: 0, sell: 0 };
    if (f.side === "A") entry.buy += notional;
    else if (f.side === "B") entry.sell += notional;
    byCoin.set(f.coin, entry);
  }

  const slices: StrategyAssetSlice[] = Array.from(byCoin.entries())
    .map(([coin, v]) => ({
      coin,
      longNotional: v.buy,
      shortNotional: v.sell,
      totalNotional: v.buy + v.sell,
    }))
    .sort((a, b) => b.totalNotional - a.totalNotional);

  const topAssets = slices.slice(0, 5);
  const totalAll = slices.reduce((s, x) => s + x.totalNotional, 0);
  const buyAll = slices.reduce((s, x) => s + x.longNotional, 0);
  const sellAll = slices.reduce((s, x) => s + x.shortNotional, 0);
  const longShortBias = totalAll > 0 ? (buyAll - sellAll) / totalAll : null;
  const topAssetConcentrationPct = totalAll > 0 && slices.length > 0
    ? (slices[0].totalNotional / totalAll) * 100
    : null;

  const firstTime = recent[0]?.time ?? cutoff;
  const lastTime = recent[recent.length - 1]?.time ?? Date.now();
  const spanDays = Math.max(1, (lastTime - firstTime) / DAY_MS);
  const tradesPerDay = recent.length / spanDays;
  const medianHoldTimeMs = computeMedianHoldTime(recent);

  return {
    fillCount: recent.length,
    topAssets,
    longShortBias,
    tradesPerDay,
    medianHoldTimeMs,
    topAssetConcentrationPct,
    sampleWindowDays: windowDays,
  };
}

function computeMedianHoldTime(fills: Fill[]): number | null {
  const sorted = [...fills].sort((a, b) => a.time - b.time);
  const queues = new Map<string, Array<{ time: number; size: number; dir: "long" | "short" }>>();
  const holds: number[] = [];

  for (const f of sorted) {
    let direction: "long" | "short" | null = null;
    let isOpen = false;
    if (f.dir === "Open Long") { direction = "long"; isOpen = true; }
    else if (f.dir === "Open Short") { direction = "short"; isOpen = true; }
    else if (f.dir === "Close Long") { direction = "long"; isOpen = false; }
    else if (f.dir === "Close Short") { direction = "short"; isOpen = false; }
    if (!direction) continue;

    const key = `${f.coin}:${direction}`;
    const q = queues.get(key) ?? [];
    if (isOpen) {
      q.push({ time: f.time, size: f.sz, dir: direction });
      queues.set(key, q);
      continue;
    }
    let remaining = f.sz;
    while (remaining > 1e-9 && q.length > 0) {
      const head = q[0];
      const take = Math.min(head.size, remaining);
      holds.push(f.time - head.time);
      head.size -= take;
      remaining -= take;
      if (head.size <= 1e-9) q.shift();
    }
    queues.set(key, q);
  }

  if (holds.length === 0) return null;
  holds.sort((a, b) => a - b);
  const mid = Math.floor(holds.length / 2);
  return holds.length % 2 === 0 ? (holds[mid - 1] + holds[mid]) / 2 : holds[mid];
}

// ─── List aggregator ───────────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function listVaultSummaries(
  network: HyperliquidNetwork = "mainnet",
): Promise<VaultListResult> {
  const summaryTvls = await fetchRecentVaultSummaries(network);
  const summaryAddresses = Array.from(summaryTvls.keys());
  const addresses = Array.from(new Set([...VAULT_SEED.map((a) => a.toLowerCase()), ...summaryAddresses]));

  if (addresses.length === 0) {
    return { vaults: [], partial: false, warnings: [], unavailableCount: 0 };
  }

  let unavailableCount = 0;
  const warnings: string[] = [];
  const results = await mapWithConcurrency(addresses, MAX_VAULT_LIST_CONCURRENCY, async (address) => {
    try {
      const vault = await fetchVaultDetails(address, network, summaryTvls.get(address) ?? null);
      if (!vault) return null;
      const metrics = computeVaultMetrics(vault);
      const item: VaultListItem = {
        vaultAddress: vault.vaultAddress,
        name: vault.name,
        leader: vault.leader,
        apr: parseNullableFloat(vault.apr),
        leaderCommission: parseNullableFloat(vault.leaderCommission),
        isClosed: vault.isClosed,
        allowDeposits: vault.allowDeposits,
        sparkline: vaultSparkline(vault),
        metrics,
      };
      return item;
    } catch {
      unavailableCount += 1;
      warnings.push(`Vault ${address.slice(0, 10)} could not be fetched.`);
      return null;
    }
  });

  const vaults = results.filter((x): x is VaultListItem => x !== null);
  return {
    vaults,
    partial: unavailableCount > 0,
    warnings,
    unavailableCount,
  };
}

export { MIN_DAILY_RETURN_SAMPLES, SAMPLE_WINDOW_DAYS };
