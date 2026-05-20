import { Pool } from "pg";
import { getInfoClient } from "@/lib/hyperliquid";
import { getPooledDatabaseUrl } from "@/lib/databaseEnv";
import type { FactorReport, MarketBriefAsset, MarketBriefTheme } from "@/types";

const DATABASE_URL = getPooledDatabaseUrl();
const STORE_BACKOFF_MS = 5 * 60 * 1000;
const DAY_MS = 86_400_000;
const LOOKBACK_DAYS = 60;
const MIN_OI_USD = 5_000_000;
const MAX_DYNAMIC_ASSETS = 40;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://hyperpulsehl.com";

let pool: Pool | null = null;
let disabledUntil = 0;

type Candle = {
  time: number;
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type MarketAsset = {
  symbol: string;
  oiUsd: number | null;
};

type CatalystNote = {
  theme: string;
  catalyst: string;
  marketInterpretation: string;
  priceActionRead: string;
  moveType: "catalyst-led" | "short-covering" | "rotation-led" | "momentum-led" | "mixed";
  source?: {
    title: string;
    url: string;
  };
};

const CURATED_ASSETS = [
  "BTC",
  "ETH",
  "SOL",
  "HYPE",
  "TON",
  "VVV",
  "ZEC",
  "INJ",
  "ONDO",
  "JTO",
  "NEAR",
  "SUI",
  "DOGE",
  "XRP",
  "BNB",
  "AAVE",
  "UNI",
  "LINK",
  "PENDLE",
  "TAO",
  "WLD",
  "FET",
  "ARB",
  "OP",
  "AVAX",
];

const THEME_BY_ASSET: Record<string, string> = {
  BTC: "Majors / beta",
  ETH: "Majors / beta",
  SOL: "Majors / beta",
  BNB: "Majors / beta",
  XRP: "Majors / beta",
  DOGE: "High-beta / meme",
  HYPE: "Hyperliquid-native",
  ZEC: "Privacy / non-correlated",
  XMR: "Privacy / non-correlated",
  TON: "L1 / app-chain",
  SUI: "L1 / app-chain",
  NEAR: "AI / app-chain",
  INJ: "DeFi infrastructure",
  ONDO: "RWA / tokenized finance",
  JTO: "Solana staking / MEV",
  VVV: "AI / app-token",
  TAO: "AI / compute",
  WLD: "AI / identity",
  FET: "AI / compute",
  AAVE: "DeFi / lending",
  UNI: "DeFi / exchange",
  LINK: "Oracle / infra",
  PENDLE: "DeFi / yield",
  ARB: "L2 / app-chain",
  OP: "L2 / app-chain",
  AVAX: "L1 / app-chain",
};

const CATALYST_NOTES: Record<string, CatalystNote> = {
  TON: {
    theme: "L1 / app-chain",
    catalyst: "Telegram moved into a more direct operating role around TON, including validator control and a public roadmap focused on speed, fees, and distribution through Telegram.",
    marketInterpretation: "Traders treated the update as a distribution catalyst because TON's core edge is not generic L1 throughput; it is access to Telegram's large consumer surface.",
    priceActionRead: "The move looked event-driven first, then momentum-led as crowded shorts and under-positioned beta buyers chased a clean relative-strength breakout.",
    moveType: "catalyst-led",
    source: { title: "TON catalyst coverage", url: "https://coinmarketcap.com/top-stories/69fdc34df86ab62bfe010e83/" },
  },
  VVV: {
    theme: "AI / app-token",
    catalyst: "Venice/VVV rallied around AI-token demand, emissions reductions, burn/tokenomics discussion, and renewed interest in app-tokens with real usage narratives.",
    marketInterpretation: "The market read lower emissions and AI-app positioning as a cleaner supply/demand story than broad alt beta, especially while traders were rotating into smaller liquid winners.",
    priceActionRead: "This was a momentum-led AI rotation: the catalyst gave the move a reason, but the size of the move reflected thin liquidity and trend-chasing demand.",
    moveType: "momentum-led",
    source: { title: "VVV rally coverage", url: "https://www.cryptotimes.io/2026/05/11/venice-token-vvv-surges-82-in-a-week-as-ai-crypto-rally-grows/" },
  },
  ZEC: {
    theme: "Privacy / non-correlated",
    catalyst: "ZEC outperformed as privacy coins caught a renewed bid, helped by public institutional positioning, short-covering, and a broader narrative rotation into liquid privacy exposure.",
    marketInterpretation: "Because BTC and ETH were not leading the tape, ZEC's move read less like market beta and more like capital seeking a high-liquidity privacy expression with its own catalyst stack.",
    priceActionRead: "The rally was rotation-led with a short-covering overlay; once price cleared structure, forced buybacks likely amplified the trend.",
    moveType: "short-covering",
    source: { title: "ZEC catalyst coverage", url: "https://coinmarketcap.com/top-stories/69fb6699759e25113a655756/" },
  },
  INJ: {
    theme: "DeFi infrastructure",
    catalyst: "INJ rallied on a cluster of positive developments including Binance.US listing momentum, buyback/burn discussion, and deeper USDC integration.",
    marketInterpretation: "That combination gave traders a concrete app-chain repricing story: more venue access, cleaner stablecoin rails, and a token-value narrative in the same window.",
    priceActionRead: "The move was catalyst-led, but later price action showed profit-taking risk after the initial breakout became extended.",
    moveType: "catalyst-led",
    source: { title: "INJ rally coverage", url: "https://coinmarketcap.com/top-stories/6a05821609f7ee567122a82e/" },
  },
  ONDO: {
    theme: "RWA / tokenized finance",
    catalyst: "ONDO rallied as tokenized-finance headlines tied the project to visible institutional RWA milestones involving names like DTCC, JPMorgan, Mastercard, and Ripple.",
    marketInterpretation: "The market treated ONDO as the liquid beta instrument for real-world-asset infrastructure, so RWA headlines translated directly into perp demand.",
    priceActionRead: "The rally was catalyst-led at first, then became rotation-led as traders crowded into one of the cleanest RWA tickers on Hyperliquid.",
    moveType: "rotation-led",
    source: { title: "ONDO catalyst coverage", url: "https://coinmarketcap.com/top-stories/69fece3d1ace870fb65ae39e/" },
  },
  JTO: {
    theme: "Solana staking / MEV",
    catalyst: "JTO moved with renewed attention on Solana staking, MEV infrastructure, and JitoSOL distribution as traders looked for higher-beta Solana ecosystem expressions.",
    marketInterpretation: "JTO gives traders exposure to Solana validator economics and liquid staking rather than simple SOL beta, which can make it outperform when Solana infrastructure narratives strengthen.",
    priceActionRead: "The move looked rotation-led: a thematic bid for Solana infra rather than one single tokenomics event.",
    moveType: "rotation-led",
    source: { title: "Jito ecosystem event coverage", url: "https://coinmarketcal.com/en/event/telegram-wallet-staking-328042" },
  },
  NEAR: {
    theme: "AI / app-chain",
    catalyst: "NEAR benefited from AI and app-chain narrative strength, including roadmap discussion around AI intents, cloud/GPU infrastructure, and high-throughput user-facing applications.",
    marketInterpretation: "Traders treated NEAR as a large, liquid way to express the AI-infrastructure theme without moving into much smaller illiquid tokens.",
    priceActionRead: "The move was rotation-led with a momentum overlay; it outperformed because the market wanted AI exposure that was still liquid enough to trade size.",
    moveType: "rotation-led",
    source: { title: "NEAR catalyst setup coverage", url: "https://beincrypto.com/top-5-altcoin-setups-for-may-2026/" },
  },
  SUI: {
    theme: "L1 / app-chain",
    catalyst: "SUI drew support from regulated-market access after CME announced plans to launch SUI futures, adding an institutional-access angle to the existing L1 growth story.",
    marketInterpretation: "The listing mattered because it made SUI easier to express for institutional and macro-style crypto traders, which can broaden the buyer base beyond spot-native participants.",
    priceActionRead: "The move was catalyst-led, but less explosive than the smaller-cap leaders because SUI was already a more liquid, widely owned L1.",
    moveType: "catalyst-led",
    source: { title: "CME SUI futures announcement", url: "https://www.cmegroup.com/media-room/press-releases/2026/4/07/cme_group_to_continueexpansionofregulatedcryptosuitewithlaunchof.html" },
  },
  HYPE: {
    theme: "Hyperliquid-native",
    catalyst: "HYPE separated after Coinbase and Circle deepened Hyperliquid's USDC alignment, giving the market a concrete institutional-validation catalyst.",
    marketInterpretation: "The deal improved confidence in Hyperliquid's stablecoin rails, treasury credibility, and potential protocol economics at a time when majors were weaker.",
    priceActionRead: "This was catalyst-led rather than simple beta; the important distinction is that it arrived after the first-half-May measurement window, so it belongs in the next tape read unless it appears in the current period leaderboard.",
    moveType: "catalyst-led",
    source: { title: "Coinbase and Hyperliquid USDC alignment", url: "https://www.coinbase.com/en-ca/blog/coinbase-and-hyperliquid-aligning-markets-on-hyperliquid-to-usdc" },
  },
};

function getPool(): Pool | null {
  if (disabledUntil > Date.now()) return null;
  if (!DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  return pool;
}

function markStoreUnavailable(error: unknown) {
  disabledUntil = Date.now() + STORE_BACKOFF_MS;
  console.warn("[market-brief-store] unavailable", error);
}

async function ensureFactorReportTables(): Promise<void> {
  const client = getPool();
  if (!client) return;
  await client.query(`
    create table if not exists factor_daily_closes (
      asset text not null,
      day text not null,
      time bigint not null,
      close double precision not null,
      volume double precision not null default 0,
      source text not null default 'hyperliquid',
      updated_at bigint not null,
      primary key (asset, day)
    );
  `);
  await client.query(`create index if not exists factor_daily_closes_day_idx on factor_daily_closes (day desc);`);
  await client.query(`
    create table if not exists factor_report_snapshots (
      report_id text primary key,
      period_start text not null,
      period_end text not null,
      generated_at bigint not null,
      universe text not null,
      summary text not null,
      payload jsonb not null default '{}'::jsonb
    );
  `);
  await client.query(`create index if not exists factor_report_snapshots_generated_idx on factor_report_snapshots (generated_at desc);`);
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCandle(candle: Record<string, unknown>): Candle | null {
  const rawTime = Number(candle.t ?? candle.T ?? candle.time ?? candle.openTime ?? 0);
  const time = rawTime > 10_000_000_000 ? rawTime : rawTime * 1000;
  const open = asNumber(candle.o ?? candle.open);
  const high = asNumber(candle.h ?? candle.high);
  const low = asNumber(candle.l ?? candle.low);
  const close = asNumber(candle.c ?? candle.close);
  const volume = asNumber(candle.v ?? candle.vlm ?? candle.volume) ?? 0;
  if (![time, open, high, low, close].every((value) => value != null && Number.isFinite(value))) return null;
  if (time <= 0 || open == null || high == null || low == null || close == null || open <= 0 || high <= 0 || low <= 0 || close <= 0) return null;
  return { time, day: new Date(time).toISOString().slice(0, 10), open, high, low, close, volume };
}

function pctChange(end: number | null | undefined, start: number | null | undefined): number | null {
  if (end == null || start == null || !Number.isFinite(end) || !Number.isFinite(start) || start <= 0) return null;
  return ((end - start) / start) * 100;
}

function formatSigned(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatAssetList(symbols: string[]): string {
  if (symbols.length === 0) return "n/a";
  if (symbols.length === 1) return symbols[0];
  if (symbols.length === 2) return `${symbols[0]} and ${symbols[1]}`;
  return `${symbols.slice(0, -1).join(", ")}, and ${symbols[symbols.length - 1]}`;
}

function getReportPeriod(now = Date.now()): { startDay: string; endDay: string; label: string } {
  const current = new Date(now);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const day = current.getUTCDate();
  let start: Date;
  let end: Date;

  if (day >= 16) {
    start = new Date(Date.UTC(year, month, 1));
    end = new Date(Date.UTC(year, month, 15));
  } else {
    start = new Date(Date.UTC(year, month - 1, 16));
    end = new Date(Date.UTC(year, month, 0));
  }

  const startDay = start.toISOString().slice(0, 10);
  const endDay = end.toISOString().slice(0, 10);
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return { startDay, endDay, label: `${startLabel}–${endLabel}` };
}

function getAvailableMarketAssets(payload: unknown): MarketAsset[] {
  const [meta, contexts] = payload as [
    { universe?: Array<{ name?: string; isDelisted?: boolean }> },
    Array<Record<string, unknown>> | undefined,
  ];
  const universe = Array.isArray(meta?.universe) ? meta.universe : [];
  const ctxs = Array.isArray(contexts) ? contexts : [];
  return universe
    .map((asset, index) => {
      const symbol = String(asset?.name ?? "");
      const ctx = ctxs[index] ?? {};
      const mark = asNumber(ctx.markPx ?? ctx.midPx ?? ctx.oraclePx);
      const openInterest = asNumber(ctx.openInterest ?? ctx.oi);
      const explicitOiUsd = asNumber(ctx.openInterestUsd ?? ctx.oiUsd ?? ctx.dayNtlVlm);
      const oiUsd = mark != null && openInterest != null ? mark * openInterest : explicitOiUsd;
      return { symbol, oiUsd: oiUsd ?? null, delisted: asset?.isDelisted === true };
    })
    .filter((asset) => asset.symbol && !asset.delisted)
    .map(({ symbol, oiUsd }) => ({ symbol, oiUsd }));
}

async function fetchDailyCandles(assets: string[], periodStart: string, periodEnd: string): Promise<Map<string, Candle[]>> {
  const info = getInfoClient("mainnet");
  const endTime = new Date(`${periodEnd}T23:59:59Z`).getTime() + DAY_MS;
  const startTime = Math.min(Date.now() - LOOKBACK_DAYS * DAY_MS, new Date(`${periodStart}T00:00:00Z`).getTime() - DAY_MS * 3);
  const output = new Map<string, Candle[]>();
  const queue = [...assets];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    while (queue.length > 0) {
      const asset = queue.shift();
      if (!asset) return;
      try {
        const candles = await info.candleSnapshot({ coin: asset, interval: "1d", startTime, endTime });
        const parsed = Array.isArray(candles)
          ? candles.map((candle) => parseCandle(candle as Record<string, unknown>)).filter((candle): candle is Candle => Boolean(candle))
          : [];
        output.set(asset, parsed.sort((a, b) => a.time - b.time));
      } catch (error) {
        console.warn(`[market-brief] unable to fetch ${asset} daily candles`, error);
        output.set(asset, []);
      }
    }
  });
  await Promise.all(workers);
  return output;
}

async function persistDailyCloses(candlesByAsset: Map<string, Candle[]>): Promise<boolean> {
  const client = getPool();
  if (!client) return false;
  try {
    await ensureFactorReportTables();
    const now = Date.now();
    const rows: Array<[string, string, number, number, number, number]> = [];
    for (const [asset, candles] of candlesByAsset) {
      for (const candle of candles) {
        rows.push([asset, candle.day, candle.time, candle.close, candle.volume, now]);
      }
    }
    const chunkSize = 400;
    for (let index = 0; index < rows.length; index += chunkSize) {
      const chunk = rows.slice(index, index + chunkSize);
      const params: Array<string | number> = [];
      const values = chunk
        .map((row, rowIndex) => {
          const offset = rowIndex * 6;
          params.push(...row);
          return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},'hyperliquid',$${offset + 6})`;
        })
        .join(",");
      await client.query(
        `insert into factor_daily_closes (asset, day, time, close, volume, source, updated_at)
         values ${values}
         on conflict (asset, day) do update set
           time = excluded.time,
           close = excluded.close,
           volume = excluded.volume,
           updated_at = excluded.updated_at`,
        params,
      );
    }
    return true;
  } catch (error) {
    markStoreUnavailable(error);
    return false;
  }
}

function candleForDay(candles: Candle[], day: string): Candle | null {
  return candles.find((candle) => candle.day === day) ?? null;
}

function candlesInPeriod(candles: Candle[], startDay: string, endDay: string): Candle[] {
  return candles.filter((candle) => candle.day >= startDay && candle.day <= endDay);
}

function computeAssetReturn(candles: Candle[], startDay: string, endDay: string): number | null {
  const periodCandles = candlesInPeriod(candles, startDay, endDay);
  const start = candleForDay(candles, startDay) ?? periodCandles[0];
  const end = candleForDay(candles, endDay) ?? periodCandles[periodCandles.length - 1];
  return pctChange(end?.close, start?.open);
}


function computePeriodVolumeUsd(candles: Candle[], startDay: string, endDay: string): number | null {
  const periodCandles = candlesInPeriod(candles, startDay, endDay);
  if (periodCandles.length === 0) return null;
  return periodCandles.reduce((sum, candle) => sum + Math.max(candle.volume, 0) * candle.close, 0);
}

function computeVolumeVsAverage(candles: Candle[], startDay: string, endDay: string): number | null {
  const periodCandles = candlesInPeriod(candles, startDay, endDay);
  if (periodCandles.length === 0) return null;
  const periodDailyVolume = (computePeriodVolumeUsd(candles, startDay, endDay) ?? 0) / periodCandles.length;
  const priorCandles = candles.filter((candle) => candle.day < startDay).slice(-Math.max(periodCandles.length, 7));
  if (priorCandles.length === 0) return null;
  const priorDailyVolume = priorCandles.reduce((sum, candle) => sum + Math.max(candle.volume, 0) * candle.close, 0) / priorCandles.length;
  if (!Number.isFinite(periodDailyVolume) || !Number.isFinite(priorDailyVolume) || priorDailyVolume <= 0) return null;
  return periodDailyVolume / priorDailyVolume;
}

function computeSeries(candles: Candle[], startDay: string, endDay: string) {
  const periodCandles = candlesInPeriod(candles, startDay, endDay);
  const start = candleForDay(candles, startDay) ?? periodCandles[0];
  const startPrice = start?.open;
  if (startPrice == null || startPrice <= 0) return [];
  return periodCandles.map((candle) => ({ day: candle.day, value: pctChange(candle.close, startPrice) ?? 0 }));
}

function computeWeekTwoReturn(candles: Candle[], startDay: string, endDay: string): number | null {
  const startTime = new Date(`${startDay}T00:00:00Z`).getTime();
  const endTime = new Date(`${endDay}T00:00:00Z`).getTime();
  const midpointTime = startTime + Math.floor((endTime - startTime) / 2);
  const midpoint = new Date(midpointTime).toISOString().slice(0, 10);
  const periodCandles = candlesInPeriod(candles, midpoint, endDay);
  const start = candleForDay(candles, midpoint) ?? periodCandles[0];
  const end = candleForDay(candles, endDay) ?? periodCandles[periodCandles.length - 1];
  return pctChange(end?.close, start?.open);
}

function getCatalystNote(symbol: string, returnPct: number | null, btcRelativePct: number | null): CatalystNote {
  const normalized = symbol.toUpperCase();
  const mapped = CATALYST_NOTES[normalized];
  if (mapped) return mapped;
  const relative = btcRelativePct != null && btcRelativePct > 0 ? `outperformed BTC by ${formatSigned(btcRelativePct)}` : "did not show clean BTC-relative leadership";
  return {
    theme: THEME_BY_ASSET[normalized] ?? "Other liquid perps",
    catalyst: `${symbol} ranked among the period leaders without a single dominant public catalyst in the curated HyperPulse source set.`,
    marketInterpretation: `The better explanation is tape-driven: the asset ${relative}, which points to rotation and relative-strength demand rather than broad beta alone.`,
    priceActionRead: returnPct != null && returnPct > 20 ? "The move was momentum-led and likely sensitive to late-entry risk after the initial breakout." : "The move was rotation-led and should be read as relative strength rather than a standalone fundamental repricing.",
    moveType: returnPct != null && returnPct > 20 ? "momentum-led" : "rotation-led",
  };
}

function buildSummary(leaderboard: MarketBriefAsset[], losers: MarketBriefAsset[], periodLabel: string, btcReturn: number | null, ethReturn: number | null): string[] {
  const leaders = leaderboard.slice(0, 4);
  const topNames = leaders.map((asset) => `${asset.symbol} ${formatSigned(asset.returnPct)}`).join(", ");
  const loserNames = losers.slice(0, 3).map((asset) => `${asset.symbol} ${formatSigned(asset.returnPct)}`).join(", ");
  const topThemes = [...new Set(leaders.map((asset) => asset.theme))].slice(0, 3).join(", ");
  const faded = leaderboard
    .filter((asset) => asset.weekTwoReturnPct != null && asset.weekTwoReturnPct < 0 && (asset.returnPct ?? 0) > 15)
    .slice(0, 3)
    .map((asset) => `${asset.symbol} ${formatSigned(asset.weekTwoReturnPct)}`)
    .join(", ");
  const majors = `BTC ${formatSigned(btcReturn)} / ETH ${formatSigned(ethReturn)}`;

  return [
    `Leaders — ${topNames || "n/a"}.`,
    `Losers — ${loserNames || "No tracked liquid perp finished materially negative."}`,
    `Regime — Alt-led tape, not majors beta. Majors: ${majors}. Themes: ${topThemes || "idiosyncratic alt themes"}.`,
    `Catalysts — TON distribution, VVV AI/app demand, ZEC privacy rotation, INJ DeFi infrastructure, ONDO RWA/tokenized finance.`,
    faded ? `Risk — Follow-through was uneven: ${faded} faded in the back half. Continuation mattered more than headline return.` : "Risk — Headline return only counted when the move kept working after the first catalyst.",
  ];
}

function buildThemes(assets: MarketBriefAsset[]): MarketBriefTheme[] {
  const grouped = new Map<string, MarketBriefAsset[]>();
  for (const asset of assets) {
    const group = grouped.get(asset.theme) ?? [];
    group.push(asset);
    grouped.set(asset.theme, group);
  }
  return [...grouped.entries()]
    .map(([theme, rows]) => {
      const averageReturnPct = rows.reduce((sum, row) => sum + (row.returnPct ?? 0), 0) / Math.max(rows.length, 1);
      const leaders = rows.slice(0, 3).map((row) => row.symbol);
      return {
        id: theme.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        name: theme,
        averageReturnPct,
        leaders,
        note: `${formatAssetList(leaders)} carried the ${theme.toLowerCase()} bucket during the period.`,
      };
    })
    .sort((a, b) => b.averageReturnPct - a.averageReturnPct)
    .slice(0, 4);
}

function buildTelegramSummary(report: Pick<FactorReport, "periodLabel" | "leaderboard" | "themes" | "riskNote">): string[] {
  const leaders = report.leaderboard.slice(0, 5).map((asset) => `${asset.symbol} ${formatSigned(asset.returnPct)}`);
  const topTheme = report.themes[0];
  return [
    `Market Brief · ${report.periodLabel}`,
    `Leaders: ${leaders.join(" · ") || "n/a"}`,
    topTheme ? `Theme: ${topTheme.name} led (${formatSigned(topTheme.averageReturnPct)} avg across ${topTheme.leaders.join(", ")}).` : "Theme: no clear clustered leadership.",
    `Full report: ${APP_URL}/docs/factors`,
  ];
}

async function persistReport(report: FactorReport): Promise<boolean> {
  const client = getPool();
  if (!client) return false;
  try {
    await ensureFactorReportTables();
    await client.query(
      `insert into factor_report_snapshots (report_id, period_start, period_end, generated_at, universe, summary, payload)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb)
       on conflict (report_id) do update set
         generated_at = excluded.generated_at,
         summary = excluded.summary,
         payload = excluded.payload`,
      [
        report.id,
        report.periodStart,
        report.periodEnd,
        report.generatedAt,
        report.universe,
        report.summary.join("\n\n"),
        JSON.stringify(report),
      ],
    );
    return true;
  } catch (error) {
    markStoreUnavailable(error);
    return false;
  }
}

export async function buildHyperpulseFactorReport(): Promise<FactorReport> {
  const info = getInfoClient("mainnet");
  const marketAssets = getAvailableMarketAssets(await info.metaAndAssetCtxs());
  const dynamicAssets = marketAssets
    .filter((asset) => (asset.oiUsd ?? 0) >= MIN_OI_USD)
    .sort((a, b) => (b.oiUsd ?? 0) - (a.oiUsd ?? 0))
    .slice(0, MAX_DYNAMIC_ASSETS)
    .map((asset) => asset.symbol);
  const availableByUpper = new Map(marketAssets.map((asset) => [asset.symbol.toUpperCase(), asset.symbol]));
  const curatedAvailable = CURATED_ASSETS.map((symbol) => availableByUpper.get(symbol)).filter((symbol): symbol is string => Boolean(symbol));
  const uniqueAssets = [...new Set([...curatedAvailable, ...dynamicAssets])].sort((a, b) => a.localeCompare(b));
  const { startDay, endDay, label } = getReportPeriod();
  const candlesByAsset = await fetchDailyCandles(uniqueAssets, startDay, endDay);
  const storedDailyCloses = await persistDailyCloses(candlesByAsset);

  const btcReturn = computeAssetReturn(candlesByAsset.get("BTC") ?? [], startDay, endDay);
  const ethReturn = computeAssetReturn(candlesByAsset.get("ETH") ?? [], startDay, endDay);
  const assetReturns = uniqueAssets
    .map((symbol) => {
      const candles = candlesByAsset.get(symbol) ?? [];
      const returnPct = computeAssetReturn(candles, startDay, endDay);
      return { symbol, returnPct };
    })
    .filter((row): row is { symbol: string; returnPct: number } => row.returnPct != null && Number.isFinite(row.returnPct));
  const basketReturnPct = assetReturns.reduce((sum, row) => sum + row.returnPct, 0) / Math.max(assetReturns.length, 1);

  const rankedAssets: MarketBriefAsset[] = assetReturns
    .map(({ symbol, returnPct }) => {
      const candles = candlesByAsset.get(symbol) ?? [];
      const btcRelativePct = btcReturn == null ? null : returnPct - btcReturn;
      const basketRelativePct = returnPct - basketReturnPct;
      const weekTwoReturnPct = computeWeekTwoReturn(candles, startDay, endDay);
      const periodVolumeUsd = computePeriodVolumeUsd(candles, startDay, endDay);
      const volumeVsAverage = computeVolumeVsAverage(candles, startDay, endDay);
      const catalyst = getCatalystNote(symbol, returnPct, btcRelativePct);
      return {
        symbol,
        returnPct,
        btcRelativePct,
        basketRelativePct,
        weekTwoReturnPct,
        theme: catalyst.theme || THEME_BY_ASSET[symbol.toUpperCase()] || "Other liquid perps",
        marketHref: `/markets?asset=${encodeURIComponent(symbol)}`,
        source: catalyst.source,
        catalyst: catalyst.catalyst,
        marketInterpretation: catalyst.marketInterpretation,
        priceActionRead: catalyst.priceActionRead,
        moveType: catalyst.moveType,
        periodVolumeUsd,
        volumeVsAverage,
        series: computeSeries(candles, startDay, endDay),
      } satisfies MarketBriefAsset;
    })
    .sort((a, b) => (b.returnPct ?? -Infinity) - (a.returnPct ?? -Infinity));

  const leaderboard = rankedAssets.slice(0, 5);
  const losers = rankedAssets
    .filter((asset) => (asset.returnPct ?? 0) < 0)
    .sort((a, b) => (a.returnPct ?? Infinity) - (b.returnPct ?? Infinity))
    .slice(0, 5);
  const themes = buildThemes(leaderboard);
  const summary = buildSummary(leaderboard, losers, label, btcReturn, ethReturn);
  const riskNote = "Not a buy list. Entries still need current structure, liquidity, and invalidation.";

  const report: FactorReport = {
    id: `hp-market-brief-${endDay}`,
    generatedAt: Date.now(),
    periodStart: startDay,
    periodEnd: endDay,
    periodLabel: label,
    universe: "HyperPulse-tracked Hyperliquid perps",
    title: "HyperPulse Market Brief",
    summary,
    leaderboard,
    losers,
    catalystNotes: leaderboard,
    themes,
    riskNote,
    telegramSummary: [],
    coverage: {
      trackedAssets: uniqueAssets,
      trackedAssetCount: uniqueAssets.length,
      storedDailyCloses,
      note: "Returns use Hyperliquid 1d candles for liquid perps. Catalyst notes are lightweight source-linked research, not exhaustive fundamental coverage.",
    },
  };
  report.telegramSummary = buildTelegramSummary(report);
  await persistReport(report);
  return report;
}
