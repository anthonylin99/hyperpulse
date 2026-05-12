import { getInfoClient, type HyperliquidNetwork } from "@/lib/hyperliquid";
import { VAULT_SEED } from "@/lib/vaultSeed";
import type { Fill } from "@/types";
import type {
  StrategyAssetSlice,
  StrategyFingerprint,
  VaultDetails,
  VaultListItem,
  VaultMetrics,
  VaultPeriod,
  VaultPortfolioWindow,
} from "@/types/vaults";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAILY_RETURN_SAMPLES = 30;
const SAMPLE_WINDOW_DAYS = 30;

// ─── Normalization ─────────────────────────────────────────────

function parseFloatSafe(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizePortfolio(
  raw: ReadonlyArray<[string, { accountValueHistory: Array<[number, string]>; pnlHistory: Array<[number, string]>; vlm: string }]>,
): VaultPortfolioWindow[] {
  const wantedPeriods: VaultPeriod[] = ["day", "week", "month", "allTime"];
  return raw
    .filter(([period]) => wantedPeriods.includes(period as VaultPeriod))
    .map(([period, data]) => ({
      period: period as VaultPeriod,
      accountValueHistory: data.accountValueHistory.map(
        ([t, v]) => [t, parseFloatSafe(v)] as [number, number],
      ),
      pnlHistory: data.pnlHistory.map(([t, v]) => [t, parseFloatSafe(v)] as [number, number]),
      vlm: parseFloatSafe(data.vlm),
    }));
}

// ─── API fetcher ───────────────────────────────────────────────

export async function fetchVaultDetails(
  vaultAddress: string,
  network: HyperliquidNetwork = "mainnet",
): Promise<VaultDetails | null> {
  const info = getInfoClient(network);
  try {
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
      followers: raw.followers.map((f) => ({
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
  } catch {
    return null;
  }
}

// ─── Metric helpers ────────────────────────────────────────────

function getWindow(vault: VaultDetails, period: VaultPeriod): VaultPortfolioWindow | null {
  return vault.portfolio.find((p) => p.period === period) ?? null;
}

function dailyReturnsFromEquity(
  history: Array<[number, number]>,
): Array<{ time: number; ret: number }> {
  if (history.length < 2) return [];
  // Group account-value points into UTC day buckets and use the last point
  // per day as the day's closing equity. Skip zero-equity days to avoid
  // divide-by-zero (deposits/withdrawals can spike values; see /docs §5.1).
  const byDay = new Map<number, number>();
  for (const [t, v] of history) {
    const day = Math.floor(t / DAY_MS);
    byDay.set(day, v);
  }
  const sortedDays = Array.from(byDay.entries()).sort((a, b) => a[0] - b[0]);
  const out: Array<{ time: number; ret: number }> = [];
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = sortedDays[i - 1][1];
    const curr = sortedDays[i][1];
    if (prev === 0) continue;
    out.push({ time: sortedDays[i][0] * DAY_MS, ret: (curr - prev) / prev });
  }
  return out;
}

function maxDrawdown(history: Array<[number, number]>): {
  pct: number | null;
  at: number | null;
  fromEquity: number | null;
  toEquity: number | null;
} {
  if (history.length < 2) return { pct: null, at: null, fromEquity: null, toEquity: null };
  let peak = history[0][1];
  let maxDD = 0;
  let troughAt = history[0][0];
  let troughEquity = history[0][1];
  let peakEquity = history[0][1];
  let currentPeakEquity = history[0][1];
  for (const [t, v] of history) {
    if (v > peak) {
      peak = v;
      currentPeakEquity = v;
    }
    if (peak <= 0) continue;
    const dd = (v - peak) / peak; // negative
    if (dd < maxDD) {
      maxDD = dd;
      troughAt = t;
      troughEquity = v;
      peakEquity = currentPeakEquity;
    }
  }
  if (maxDD === 0) return { pct: 0, at: null, fromEquity: null, toEquity: null };
  return { pct: Math.abs(maxDD), at: troughAt, fromEquity: peakEquity, toEquity: troughEquity };
}

function sharpeAnnualized(returns: number[]): number | null {
  if (returns.length < MIN_DAILY_RETURN_SAMPLES) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return null;
  return (mean / std) * Math.sqrt(365);
}

function calmarAnnualized(
  history: Array<[number, number]>,
  maxDDPct: number | null,
): number | null {
  if (maxDDPct == null || maxDDPct === 0 || history.length < 2) return null;
  const startV = history[0][1];
  const endV = history[history.length - 1][1];
  if (startV <= 0) return null;
  const days = (history[history.length - 1][0] - history[0][0]) / DAY_MS;
  if (days <= 0) return null;
  const totalReturn = (endV - startV) / startV;
  const annualized = Math.pow(1 + totalReturn, 365 / days) - 1;
  return annualized / maxDDPct;
}

function trimWindow(
  history: Array<[number, number]>,
  cutoff: number,
): Array<[number, number]> {
  return history.filter(([t]) => t >= cutoff);
}

function totalReturnPct(history: Array<[number, number]>): number | null {
  if (history.length < 2) return null;
  const start = history[0][1];
  const end = history[history.length - 1][1];
  if (start <= 0) return null;
  return ((end - start) / start) * 100;
}

// ─── Public: compute metrics + TVL ─────────────────────────────

export function computeVaultMetrics(vault: VaultDetails): VaultMetrics {
  const tvl = vault.followers.reduce((s, f) => s + f.vaultEquity, 0);

  const allTime = getWindow(vault, "allTime");
  const month = getWindow(vault, "month");
  const week = getWindow(vault, "week");

  // 7d TVL change uses week-window account value (best proxy from API; mixes
  // flows + PnL — documented in /docs).
  const weekHistory = week?.accountValueHistory ?? [];
  let tvlChange7dPct: number | null = null;
  if (weekHistory.length >= 2 && weekHistory[0][1] > 0) {
    tvlChange7dPct = ((weekHistory[weekHistory.length - 1][1] - weekHistory[0][1]) / weekHistory[0][1]) * 100;
  }

  const monthHistory = month?.accountValueHistory ?? [];
  const return30dPct = totalReturnPct(monthHistory);
  const returnAllTimePct = totalReturnPct(allTime?.accountValueHistory ?? []);

  // 90d window — Hyperliquid exposes `month` (~30d) as the smallest medium-term
  // window. Use `allTime` trimmed to last 90d for risk-adjusted metrics.
  const now = Date.now();
  const ninetyDayCutoff = now - 90 * DAY_MS;
  const trimmed = trimWindow(allTime?.accountValueHistory ?? [], ninetyDayCutoff);
  const dailyReturns = dailyReturnsFromEquity(trimmed);
  const sharpe90d = sharpeAnnualized(dailyReturns.map((d) => d.ret));
  const dd = maxDrawdown(trimmed);
  const calmar90d = dd.pct != null ? calmarAnnualized(trimmed, dd.pct) : null;

  const allHistory = allTime?.accountValueHistory ?? [];
  const historyDays = allHistory.length >= 2
    ? Math.max(0, (allHistory[allHistory.length - 1][0] - allHistory[0][0]) / DAY_MS)
    : 0;

  return {
    tvl,
    tvlChange7dPct,
    return30dPct,
    returnAllTimePct,
    maxDrawdownPct: dd.pct,
    maxDrawdownAt: dd.at,
    maxDrawdownFromEquity: dd.fromEquity,
    maxDrawdownToEquity: dd.toEquity,
    sharpe90d,
    calmar90d,
    dailyReturnSamples: dailyReturns.length,
    followerCount: vault.followers.length,
    historyDays,
  };
}

// ─── Strategy fingerprint ──────────────────────────────────────

export function computeStrategyFingerprint(
  fills: Fill[],
  windowDays = SAMPLE_WINDOW_DAYS,
): StrategyFingerprint {
  const cutoff = Date.now() - windowDays * DAY_MS;
  const recent = fills.filter((f) => f.time >= cutoff);

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

  // Group notional by coin; classify long/short by HL `dir` field.
  const byCoin = new Map<string, { long: number; short: number }>();
  for (const f of recent) {
    const notional = f.px * f.sz;
    const entry = byCoin.get(f.coin) ?? { long: 0, short: 0 };
    if (f.dir === "Open Long" || f.dir === "Close Short") entry.long += notional;
    else if (f.dir === "Open Short" || f.dir === "Close Long") entry.short += notional;
    byCoin.set(f.coin, entry);
  }

  const slices: StrategyAssetSlice[] = Array.from(byCoin.entries())
    .map(([coin, v]) => ({
      coin,
      longNotional: v.long,
      shortNotional: v.short,
      totalNotional: v.long + v.short,
    }))
    .sort((a, b) => b.totalNotional - a.totalNotional);

  const topAssets = slices.slice(0, 5);
  const totalAll = slices.reduce((s, x) => s + x.totalNotional, 0);
  const longAll = slices.reduce((s, x) => s + x.longNotional, 0);
  const shortAll = slices.reduce((s, x) => s + x.shortNotional, 0);
  const longShortBias = totalAll > 0 ? (longAll - shortAll) / (longAll + shortAll) : null;
  const topAssetConcentrationPct = totalAll > 0 && slices.length > 0
    ? (slices[0].totalNotional / totalAll) * 100
    : null;

  const firstTime = recent[recent.length - 1]?.time ?? cutoff;
  const lastTime = recent[0]?.time ?? Date.now();
  const spanDays = Math.max(1, (lastTime - firstTime) / DAY_MS);
  const tradesPerDay = recent.length / spanDays;

  // Median hold time: FIFO-pair entry and exit fills per coin.
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
  // Sort ascending in time; pair open→close per coin via FIFO queue.
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

export async function listVaultSummaries(
  network: HyperliquidNetwork = "mainnet",
): Promise<VaultListItem[]> {
  if (VAULT_SEED.length === 0) return [];
  const results = await Promise.all(
    VAULT_SEED.map(async (address) => {
      const vault = await fetchVaultDetails(address, network);
      if (!vault) return null;
      const metrics = computeVaultMetrics(vault);
      const item: VaultListItem = {
        vaultAddress: vault.vaultAddress,
        name: vault.name,
        leader: vault.leader,
        metrics,
      };
      return item;
    }),
  );
  return results.filter((x): x is VaultListItem => x !== null);
}

export { MIN_DAILY_RETURN_SAMPLES, SAMPLE_WINDOW_DAYS };
