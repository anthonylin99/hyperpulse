import { createHash } from 'node:crypto';
import { setMaxListeners } from 'node:events';
import { Pool } from 'pg';
import { google } from 'googleapis';
import {
  HttpTransport,
  InfoClient,
  SubscriptionClient,
  WebSocketTransport,
} from '@nktkas/hyperliquid';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required for the whale indexer');
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const MAJOR_THRESHOLD = envNumber('WHALE_MAJOR_THRESHOLD_USD', 250_000);
const ALT_THRESHOLD = envNumber('WHALE_ALT_THRESHOLD_USD', 100_000);
const DEPOSIT_THRESHOLD = envNumber('WHALE_DEPOSIT_THRESHOLD_USD', 100_000);
const EPISODE_WINDOW_MS = 15 * 60 * 1000;
const ROTATION_WINDOW_MS = 60 * 60 * 1000;
const HEDGE_WINDOW_MS = 30 * 60 * 1000;
const RISK_LOSS_USD = -envNumber('WHALE_RISK_LOSS_USD', 500_000);
const HIGH_LEVERAGE = envNumber('WHALE_HIGH_LEVERAGE', 10);
const LIQ_DISTANCE_PCT = envNumber('WHALE_LIQ_DISTANCE_PCT', 10);
const DEFAULT_WHALE_MIN_REALIZED_PNL_30D = envNumber('WHALE_MIN_REALIZED_PNL_30D', 200_000);
const TELEGRAM_ALERT_COOLDOWN_MS = envNumber('WHALE_TELEGRAM_ALERT_COOLDOWN_MS', 45 * 60 * 1000);
const POSITIONING_DIGEST_INTERVAL_MS = envNumber('POSITIONING_DIGEST_INTERVAL_MS', 4 * 60 * 60 * 1000);
const POSITIONING_SNAPSHOT_INTERVAL_MS = envNumber('POSITIONING_SNAPSHOT_INTERVAL_MS', 5 * 60 * 1000);
const CROWDING_ALERT_COOLDOWN_MS = envNumber('POSITIONING_CROWDING_ALERT_COOLDOWN_MS', 6 * 60 * 60 * 1000);
const LIQUIDATION_ALERT_COOLDOWN_MS = envNumber('POSITIONING_LIQUIDATION_ALERT_COOLDOWN_MS', 3 * 60 * 60 * 1000);
const HIGH_CONVICTION_ALERT_COOLDOWN_MS = envNumber('POSITIONING_HIGH_CONVICTION_ALERT_COOLDOWN_MS', 12 * 60 * 60 * 1000);
const TRACKED_CLUSTER_MIN_USD = envNumber('POSITIONING_TRACKED_CLUSTER_MIN_USD', 5_000_000);
const HIGH_CONVICTION_PNL_FLOOR = envNumber('POSITIONING_HIGH_CONVICTION_PNL_FLOOR', 1_000_000);
const TRACKED_BOOK_PNL_FLOOR = envNumber('POSITIONING_TRACKED_BOOK_PNL_FLOOR', 200_000);
const CROWDING_POS_FUNDING_APR = envNumber('POSITIONING_CROWDING_POS_FUNDING_APR', 25);
const CROWDING_NEG_FUNDING_APR_ABS = envNumber('POSITIONING_CROWDING_NEG_FUNDING_APR_ABS', 10);
const CROWDING_OI_CHANGE_1H_PCT = envNumber('POSITIONING_CROWDING_OI_CHANGE_1H_PCT', 3);
const CROWDING_OI_CHANGE_4H_PCT = envNumber('POSITIONING_CROWDING_OI_CHANGE_4H_PCT', 8);
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED === 'true';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const SHEETS_ENABLED = process.env.GOOGLE_SHEETS_ENABLED === 'true';
const SHEETS_CREDS_B64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 || '';
const SHEETS_SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '';
const SHEETS_TAB = process.env.GOOGLE_SHEET_TAB || 'RAW DATA';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hyperpulse-gold.vercel.app';

setMaxListeners(0);

const STOCK_SYMBOLS = new Set(['AAPL', 'AMZN', 'GOOGL', 'META', 'MSFT', 'NFLX', 'NVDA', 'QQQ', 'SPY', 'TSLA', 'USPYX']);
const OIL_SYMBOLS = new Set(['BRENT', 'BRENTOIL', 'WTI', 'USO', 'XBR', 'XTI']);
const METAL_SYMBOLS = new Set(['PAXG', 'XAU', 'XAUT0', 'GLD', 'SLV', 'XAG']);
const AI_SYMBOLS = new Set(['TAO', 'NEAR', 'RENDER', 'FET', 'AIXBT', 'WLD', 'IO']);
const DEFI_SYMBOLS = new Set(['AAVE', 'CRV', 'GMX', 'JUP', 'MORPHO', 'ONDO', 'PENDLE', 'UNI', 'CAKE']);
const MEME_SYMBOLS = new Set(['DOGE', 'WIF', 'POPCAT', 'FARTCOIN', 'TRUMP', 'BRETT', 'MEW', 'kPEPE', 'PENGU']);
const CRYPTO_BETA_SYMBOLS = new Set(['BTC', 'ETH', 'SOL', 'HYPE', 'BNB', 'XRP', 'ADA', 'SUI', 'AVAX', 'LINK', 'TRX']);
const EQUITY_BROAD_SYMBOLS = new Set(['SPY', 'QQQ', 'USPYX']);
const MAJORS = new Set(['BTC', 'ETH', 'SOL', 'HYPE']);
const POSITIONING_MAJOR_PERPS = new Set(['BTC', 'ETH', 'SOL', 'HYPE', 'AAVE', 'ZEC', 'XRP', 'LINK', 'AVAX', 'SUI']);
const POSITIONING_HIP3_ALLOWLIST = new Set([
  'AAPL', 'MSFT', 'NVDA', 'SPY', 'QQQ', 'GLD', 'SLV', 'PAXG', 'XAU', 'XAUT0', 'USO', 'WTI', 'BRENT', 'BRENTOIL',
]);
const TELEGRAM_LARGE_CAP_PERP_ALLOWLIST = new Set([
  'BTC', 'ETH', 'SOL', 'HYPE', 'AAVE', 'LINK', 'AVAX', 'SUI', 'XRP', 'ADA', 'BNB', 'DOGE',
  'TAO', 'NEAR', 'RENDER', 'INJ', 'ONDO', 'UNI', 'CRV', 'GMX', 'JUP', 'PENDLE', 'MORPHO',
  'WLD', 'FET', 'ENA', 'ARB', 'OP', 'SEI', 'APT', 'TON', 'TRX', 'LTC', 'BCH'
]);
const QUALIFIED_HIP3_SYMBOLS = new Set([
  ...STOCK_SYMBOLS,
  ...OIL_SYMBOLS,
  ...METAL_SYMBOLS,
]);

function formatMultiple(value) {
  if (!Number.isFinite(value) || value <= 0) return 'n/a';
  if (value < 0.1) return '<0.1x';
  return `${value.toFixed(1)}x`;
}

function isQualifiedHip3Symbol(symbol) {
  return QUALIFIED_HIP3_SYMBOLS.has(normalizeSymbol(symbol));
}


const pool = new Pool({ connectionString: DATABASE_URL, max: 8 });
const info = new InfoClient({ transport: new HttpTransport() });
const marketWs = new SubscriptionClient({
  transport: new WebSocketTransport({ url: process.env.HYPERLIQUID_WS_URL || 'wss://api.hyperliquid.xyz/ws' }),
});
const rpcWs = new SubscriptionClient({
  transport: new WebSocketTransport({ url: process.env.WHALERPC_URL || 'wss://rpc.hyperliquid.xyz/ws' }),
});

const recentExplorerFlow = new Map();
const recentEpisodes = new Map();
const recentTelegramAlerts = new Map();
const recentPositioningAlerts = new Map();
const latestMarketSnapshots = new Map();
let perpUniverse = [];
let spotMarketMap = {};
let spotSubscriptions = [];

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeSymbol(symbol) {
  return String(symbol || '').toUpperCase().replace(/\/USDC$/, '');
}

function inferSpotCategory(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (STOCK_SYMBOLS.has(normalized)) return 'Stocks';
  if (OIL_SYMBOLS.has(normalized) || METAL_SYMBOLS.has(normalized)) return 'Commodities';
  if (/USD|USDC/.test(normalized)) return 'Other';
  if (/^[A-Z0-9]{2,16}$/.test(normalized)) return 'Crypto';
  return 'Other';
}

function classifyWhaleAsset(rawSymbol, marketType, spotCategory) {
  const symbol = normalizeSymbol(rawSymbol);

  if (marketType === 'hip3_spot') {
    const category = spotCategory || inferSpotCategory(symbol);
    if (OIL_SYMBOLS.has(symbol)) {
      return { symbol, marketType, assetClass: 'Oil', riskBucket: 'energy', hedgeProxyFor: ['energy'] };
    }
    if (METAL_SYMBOLS.has(symbol)) {
      return { symbol, marketType, assetClass: 'Commodity', riskBucket: 'metals', hedgeProxyFor: ['metals', 'commodities_other'] };
    }
    if (category === 'Stocks') {
      return {
        symbol,
        marketType,
        assetClass: 'Stock',
        riskBucket: EQUITY_BROAD_SYMBOLS.has(symbol) ? 'equities_broad' : 'equities_growth',
        hedgeProxyFor: ['equities_growth', 'equities_broad'],
      };
    }
    if (category === 'Commodities') {
      return { symbol, marketType, assetClass: 'Commodity', riskBucket: 'commodities_other', hedgeProxyFor: ['commodities_other'] };
    }
    return {
      symbol,
      marketType,
      assetClass: category === 'Crypto' ? 'Crypto' : 'Other HIP-3',
      riskBucket: category === 'Crypto' ? 'crypto_beta' : 'fx_rates_other',
      hedgeProxyFor: category === 'Crypto' ? ['crypto_beta'] : ['fx_rates_other'],
    };
  }

  if (AI_SYMBOLS.has(symbol)) return { symbol, marketType, assetClass: 'Crypto', riskBucket: 'crypto_ai', hedgeProxyFor: ['crypto_ai', 'crypto_beta'] };
  if (DEFI_SYMBOLS.has(symbol)) return { symbol, marketType, assetClass: 'Crypto', riskBucket: 'crypto_defi', hedgeProxyFor: ['crypto_defi', 'crypto_beta'] };
  if (MEME_SYMBOLS.has(symbol)) return { symbol, marketType, assetClass: 'Crypto', riskBucket: 'crypto_meme', hedgeProxyFor: ['crypto_meme', 'crypto_beta'] };
  return { symbol, marketType, assetClass: 'Crypto', riskBucket: 'crypto_beta', hedgeProxyFor: ['crypto_beta'] };
}

function buildSpotMarketMap(meta, assetCtxs = []) {
  const tokenByIndex = new Map(meta.tokens.map((token) => [token.index, token]));
  const contexts = {};
  for (const entry of meta.universe) {
    if (!Array.isArray(entry.tokens) || entry.tokens.length < 2) continue;
    const base = tokenByIndex.get(entry.tokens[0]);
    const quote = tokenByIndex.get(entry.tokens[1]);
    if (!base || !quote) continue;
    const symbol = normalizeSymbol(base.name);
    const category = inferSpotCategory(symbol);
    const descriptor = classifyWhaleAsset(symbol, 'hip3_spot', category);
    const ctx = assetCtxs[entry.index] || {};
    const marketKey = symbol === 'PURR' ? `${symbol}/USDC` : `@${entry.index}`;
    contexts[marketKey] = {
      ...descriptor,
      marketKey,
      category,
      pair: `${symbol}/${quote.name}`,
      markPx: parseNumber(ctx.markPx),
      midPx: parseNumber(ctx.midPx),
      prevDayPx: parseNumber(ctx.prevDayPx),
    };
    contexts[symbol] = contexts[marketKey];
  }
  return contexts;
}

function computeLiquidationDistancePct({ szi, markPx, liquidationPx }) {
  if (!liquidationPx || markPx <= 0) return null;
  return szi > 0 ? ((markPx - liquidationPx) / markPx) * 100 : ((liquidationPx - markPx) / markPx) * 100;
}

function positionSnapshot(assetPositions = []) {
  return assetPositions
    .map((item) => item.position)
    .filter((position) => Math.abs(parseNumber(position.szi)) > 1e-8)
    .map((position) => {
      const szi = parseNumber(position.szi);
      const entryPx = parseNumber(position.entryPx);
      const unrealizedPnl = parseNumber(position.unrealizedPnl);
      const markPx = Math.abs(szi) > 0 ? entryPx + unrealizedPnl / szi : entryPx;
      const liquidationPx = position.liquidationPx ? parseNumber(position.liquidationPx) : null;
      const descriptor = classifyWhaleAsset(position.coin, 'crypto_perp');
      return {
        coin: descriptor.symbol,
        side: szi > 0 ? 'long' : 'short',
        size: Math.abs(szi),
        entryPx,
        markPx,
        notionalUsd: parseNumber(position.positionValue) || Math.abs(szi) * markPx,
        leverage: position.leverage?.value || 0,
        liquidationPx,
        liquidationDistancePct: computeLiquidationDistancePct({ szi, markPx, liquidationPx }),
        unrealizedPnl,
        returnOnEquity: parseNumber(position.returnOnEquity),
        marketType: 'crypto_perp',
        assetClass: descriptor.assetClass,
        riskBucket: descriptor.riskBucket,
      };
    })
    .sort((a, b) => b.notionalUsd - a.notionalUsd);
}

function buildSpotPositions(balances = []) {
  return balances
    .map((balance) => {
      const symbol = normalizeSymbol(balance.coin);
      if (!symbol || symbol === 'USDC') return null;
      const total = parseNumber(balance.total);
      if (total <= 0) return null;
      const market = spotMarketMap[symbol];
      if (!market || market.markPx <= 0) return null;
      const entryNtl = parseNumber(balance.entryNtl);
      const notionalUsd = total * market.markPx;
      const entryPx = total > 0 && entryNtl > 0 ? entryNtl / total : market.markPx;
      const unrealizedPnl = entryNtl > 0 ? notionalUsd - entryNtl : 0;
      return {
        coin: market.symbol,
        side: 'long',
        size: total,
        entryPx,
        markPx: market.markPx,
        notionalUsd,
        leverage: 1,
        liquidationPx: null,
        liquidationDistancePct: null,
        unrealizedPnl,
        returnOnEquity: entryNtl > 0 ? (unrealizedPnl / entryNtl) * 100 : 0,
        marketType: 'hip3_spot',
        assetClass: market.assetClass,
        riskBucket: market.riskBucket,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.notionalUsd - a.notionalUsd);
}

function normalizeLedger(rawLedger = [], address) {
  const lower = address.toLowerCase();
  return rawLedger
    .map((entry, index) => {
      const delta = entry.delta || {};
      const type = String(delta.type || '');
      const amount = (() => {
        if (type === 'deposit') return parseNumber(delta.usdc);
        if (type === 'withdraw') return -(parseNumber(delta.usdc) + parseNumber(delta.fee));
        if (type === 'accountClassTransfer') return (delta.toPerp ? 1 : -1) * parseNumber(delta.usdc);
        if (type === 'internalTransfer' || type === 'subAccountTransfer') {
          const amt = parseNumber(delta.usdc);
          return String(delta.destination || '').toLowerCase() === lower ? amt : -amt;
        }
        if (type === 'spotTransfer' || type === 'send') {
          const amt = parseNumber(delta.usdcValue || delta.amount);
          return String(delta.destination || '').toLowerCase() === lower ? amt : -amt;
        }
        if (type === 'rewardsClaim') return parseNumber(delta.amount);
        if (type === 'vaultDeposit') return -parseNumber(delta.usdc);
        if (type === 'vaultDistribution' || type === 'vaultWithdraw') return parseNumber(delta.usdc);
        return 0;
      })();
      const label = (() => {
        if (type === 'deposit') return 'Deposit USDC';
        if (type === 'withdraw') return 'Withdraw USDC';
        if (type === 'spotTransfer' || type === 'send') return 'Spot transfer USDC';
        if (type === 'accountClassTransfer') return delta.toPerp ? 'Transfer to perps' : 'Transfer to spot';
        if (type === 'internalTransfer') return 'Internal transfer';
        if (type === 'subAccountTransfer') return 'Subaccount transfer';
        return type || 'Ledger update';
      })();
      return {
        id: entry.hash || `${entry.time}-${type}-${index}`,
        time: Number(entry.time || 0),
        amountUsd: amount,
        label,
        asset: String(delta.token || 'USDC'),
        type,
      };
    })
    .sort((a, b) => b.time - a.time);
}

function sumFlowSince(ledger, ms, now = Date.now()) {
  return ledger.reduce((sum, event) => {
    if (event.time < now - ms) return sum;
    return sum + event.amountUsd;
  }, 0);
}

function normalizeFills(rawFills = []) {
  return rawFills.map((fill) => ({
    coin: spotMarketMap[String(fill.coin)]?.symbol || normalizeSymbol(fill.coin),
    dir: String(fill.dir || ''),
    side: String(fill.side || 'A'),
    px: parseNumber(fill.px),
    sz: parseNumber(fill.sz),
    time: Number(fill.time || 0),
    fee: parseNumber(fill.fee),
    feeToken: String(fill.feeToken || 'USDC'),
    closedPnl: parseNumber(fill.closedPnl),
  }));
}

function groupFillsIntoTrades(fills) {
  const sorted = [...fills].sort((a, b) => a.time - b.time);
  const trades = [];
  const openPositions = new Map();

  for (const fill of sorted) {
    const normalized = (() => {
      if (fill.dir === 'Open Long' || fill.dir === 'Close Long') return { isOpen: fill.dir === 'Open Long', direction: 'long' };
      if (fill.dir === 'Open Short' || fill.dir === 'Close Short') return { isOpen: fill.dir === 'Open Short', direction: 'short' };
      if (fill.dir === 'Buy') return { isOpen: true, direction: 'long' };
      if (fill.dir === 'Sell') return { isOpen: false, direction: 'long' };
      return { isOpen: true, direction: 'long' };
    })();

    const existing = openPositions.get(fill.coin);
    if (normalized.isOpen) {
      if (existing && existing.direction === normalized.direction) {
        existing.fills.push(fill);
        existing.size += fill.sz;
      } else {
        openPositions.set(fill.coin, { direction: normalized.direction, fills: [fill], size: fill.sz });
      }
      continue;
    }

    if (!existing) continue;
    existing.fills.push(fill);
    existing.size -= fill.sz;
    if (existing.size > 0.000001) continue;

    const entryFills = existing.fills.filter((item) => item.dir.startsWith('Open') || item.dir === 'Buy');
    const exitFills = existing.fills.filter((item) => item.dir.startsWith('Close') || item.dir === 'Sell');
    if (entryFills.length && exitFills.length) {
      const totalEntryNotional = entryFills.reduce((sum, item) => sum + item.px * item.sz, 0);
      const totalEntrySize = entryFills.reduce((sum, item) => sum + item.sz, 0);
      const totalExitNotional = exitFills.reduce((sum, item) => sum + item.px * item.sz, 0);
      const totalExitSize = exitFills.reduce((sum, item) => sum + item.sz, 0);
      const fees = existing.fills.reduce((sum, item) => sum + item.fee, 0);
      const pnl = existing.fills.reduce((sum, item) => sum + item.closedPnl, 0);
      const notional = totalEntryNotional;
      trades.push({
        id: `${fill.coin}-${entryFills[0].time}-${fill.time}`,
        coin: fill.coin,
        direction: existing.direction,
        entryTime: entryFills[0].time,
        exitTime: fill.time,
        durationMs: fill.time - entryFills[0].time,
        entryPx: totalEntrySize > 0 ? totalEntryNotional / totalEntrySize : 0,
        exitPx: totalExitSize > 0 ? totalExitNotional / totalExitSize : 0,
        size: totalEntrySize,
        notionalUsd: notional,
        realizedPnl: pnl,
        pnlPct: notional > 0 ? (pnl / notional) * 100 : 0,
        fees,
        funding: 0,
      });
    }

    openPositions.delete(fill.coin);
  }

  return trades.sort((a, b) => b.exitTime - a.exitTime);
}

function mergeFundingIntoTrades(trades, funding) {
  return trades.map((trade) => {
    const fundingPaid = funding
      .filter((event) => normalizeSymbol(event.coin) === trade.coin && event.time >= trade.entryTime && event.time <= trade.exitTime)
      .reduce((sum, event) => sum + parseNumber(event.usdc), 0);
    return { ...trade, funding: fundingPaid };
  });
}

function buildBucketExposures(positions) {
  const map = new Map();
  for (const position of positions) {
    const bucket = position.riskBucket;
    const current = map.get(bucket) || { long: 0, short: 0 };
    if (position.side === 'long') current.long += position.notionalUsd;
    else current.short += position.notionalUsd;
    map.set(bucket, current);
  }
  return Array.from(map.entries()).map(([bucket, values]) => ({
    bucket,
    longNotionalUsd: values.long,
    shortNotionalUsd: values.short,
    netNotionalUsd: values.long - values.short,
  })).sort((a, b) => Math.abs(b.netNotionalUsd) - Math.abs(a.netNotionalUsd));
}

function deriveBehaviorTags({ positions, netFlow24hUsd, funding30d, realizedPnl30d, unrealizedPnl }) {
  const tags = new Set();
  const totalOpen = positions.reduce((sum, position) => sum + position.notionalUsd, 0);
  const avgLeverage = totalOpen > 0 ? positions.reduce((sum, position) => sum + position.notionalUsd * position.leverage, 0) / totalOpen : 0;
  const topPosition = positions[0];
  if (netFlow24hUsd >= DEPOSIT_THRESHOLD && totalOpen >= ALT_THRESHOLD) tags.add('Deposit-led');
  if (avgLeverage >= HIGH_LEVERAGE || positions.some((position) => position.leverage >= HIGH_LEVERAGE)) tags.add('Aggressive leverage');
  if (topPosition && totalOpen > 0 && topPosition.notionalUsd / totalOpen >= 0.7) tags.add('Single-asset concentrated');
  if (positions.some((position) => position.side === 'long') && positions.some((position) => position.side === 'short')) tags.add('Two-sided book');
  if (unrealizedPnl <= RISK_LOSS_USD) tags.add('Underwater');
  if (Math.abs(funding30d) >= Math.max(50_000, Math.abs(realizedPnl30d) * 0.1)) tags.add('Funding-sensitive');
  return Array.from(tags);
}

function deriveFocusTags(positions, bucketExposures) {
  const tags = [];
  const buckets = new Set(bucketExposures.map((bucket) => bucket.bucket));
  if (buckets.has('crypto_beta')) tags.push('Crypto beta');
  if (buckets.has('crypto_ai')) tags.push('Crypto AI');
  if (buckets.has('crypto_defi')) tags.push('DeFi');
  if (buckets.has('crypto_meme')) tags.push('Meme');
  if (buckets.has('equities_growth') || buckets.has('equities_broad')) tags.push('Stocks');
  if (buckets.has('energy')) tags.push('Energy');
  if (buckets.has('metals')) tags.push('Metals');
  if (buckets.size >= 3 || new Set(positions.map((position) => position.marketType)).size > 1) tags.push('Multi-asset');
  return tags.length ? Array.from(new Set(tags)) : ['Crypto beta'];
}

function deriveStyleTags(trades, positions, avgHoldHours30d, longBiasPct30d) {
  const tags = [];
  const avgLeverage = average(positions.map((position) => position.leverage));
  const positiveRate = trades.length ? trades.filter((trade) => trade.realizedPnl > 0).length / trades.length : 0;
  if (avgLeverage >= HIGH_LEVERAGE) tags.push('High leverage');
  if (avgHoldHours30d > 0 && avgHoldHours30d <= 12) tags.push('Scalp trader');
  if (avgHoldHours30d > 12) tags.push('Swing trader');
  if (positiveRate >= 0.55 && trades.length >= 4) tags.push('Conviction trader');
  if (positions.some((position) => position.side === 'long') && positions.some((position) => position.side === 'short')) tags.push('Hedger');
  if (longBiasPct30d >= 65) tags.push('Momentum trader');
  if (longBiasPct30d <= 35) tags.push('Dip buyer');
  return tags.length ? Array.from(new Set(tags)).slice(0, 3) : ['Conviction trader'];
}

function buildBaselineStats(trades, positions, realizedPnl30d, bucketExposures) {
  const tradeSizes = trades.map((trade) => trade.notionalUsd).filter((value) => value > 0);
  const holdHours = trades.map((trade) => trade.durationMs / (1000 * 60 * 60)).filter((value) => value > 0);
  const longTrades = trades.filter((trade) => trade.direction === 'long').length;
  const volume30d = trades.reduce((sum, trade) => sum + trade.notionalUsd, 0);
  const favoriteAssetCounts = new Map();
  for (const trade of trades) {
    favoriteAssetCounts.set(trade.coin, (favoriteAssetCounts.get(trade.coin) || 0) + 1);
  }
  return {
    medianTradeSize30d: median(tradeSizes),
    medianLeverage30d: median(positions.map((position) => position.leverage).filter((value) => value > 0)),
    avgHoldHours30d: average(holdHours),
    longBiasPct30d: trades.length ? (longTrades / trades.length) * 100 : 50,
    realizedPnl30d,
    volume30d,
    favoriteAssets: Array.from(favoriteAssetCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([coin]) => coin),
    dominantBuckets: bucketExposures.slice(0, 3).map((bucket) => bucket.bucket),
    directionalHitRate30d: trades.length ? (trades.filter((trade) => trade.realizedPnl > 0).length / trades.length) * 100 : 0,
  };
}

function buildNarrative(styleTags, focusTags, baseline, bucketExposures) {
  const primaryStyle = styleTags[0] || 'Conviction trader';
  const focus = focusTags.slice(0, 2).join(' and ').toLowerCase();
  const dominant = bucketExposures[0];
  const bucketText = dominant ? `${dominant.bucket.replace(/_/g, ' ')} is the largest current bucket` : 'book is currently flat';
  return `${primaryStyle} focused on ${focus}. Median trade size ${baseline.medianTradeSize30d > 0 ? `$${baseline.medianTradeSize30d.toLocaleString()}` : 'n/a'}; median hold ${baseline.avgHoldHours30d > 0 ? `${baseline.avgHoldHours30d.toFixed(1)}h` : 'n/a'}; ${bucketText}.`;
}

function buildProfile(address, perpState, spotState, fills, funding, ledger) {
  const positions = [...positionSnapshot(perpState.assetPositions || []), ...buildSpotPositions(spotState.balances || [])].sort((a, b) => b.notionalUsd - a.notionalUsd);
  const trades = mergeFundingIntoTrades(groupFillsIntoTrades(fills), funding);
  const spotUsdc = parseNumber((spotState.balances || []).find((balance) => String(balance.coin) === 'USDC')?.total);
  const totalOpenNotionalUsd = positions.reduce((sum, position) => sum + position.notionalUsd, 0);
  const unrealizedPnl = positions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
  const perpsEquity = parseNumber(perpState.marginSummary?.accountValue);
  const realizedPnl30d = trades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const funding30d = funding.reduce((sum, event) => sum + parseNumber(event.usdc), 0);
  const averageLeverage = totalOpenNotionalUsd > 0 ? positions.reduce((sum, position) => sum + position.notionalUsd * position.leverage, 0) / totalOpenNotionalUsd : 0;
  const netFlow24hUsd = sumFlowSince(ledger, 24 * 60 * 60 * 1000);
  const netFlow7dUsd = sumFlowSince(ledger, 7 * 24 * 60 * 60 * 1000);
  const netFlow30dUsd = ledger.reduce((sum, event) => sum + event.amountUsd, 0);
  const bucketExposures = buildBucketExposures(positions);
  const baseline = buildBaselineStats(trades, positions, realizedPnl30d, bucketExposures);
  const focusTags = deriveFocusTags(positions, bucketExposures);
  const styleTags = deriveStyleTags(trades, positions, baseline.avgHoldHours30d, baseline.longBiasPct30d);
  const behaviorTags = deriveBehaviorTags({ positions, netFlow24hUsd, funding30d, realizedPnl30d, unrealizedPnl });
  const timeline = [
    ...fills.map((fill) => fill.time).filter(Boolean),
    ...ledger.map((event) => event.time).filter(Boolean),
  ];
  return {
    address,
    firstSeenAt: timeline.length ? Math.min(...timeline) : null,
    lastSeenAt: timeline.length ? Math.max(...timeline) : Date.now(),
    accountEquity: perpsEquity + spotUsdc,
    perpsEquity,
    spotUsdc,
    totalOpenNotionalUsd,
    unrealizedPnl,
    realizedPnl30d,
    funding30d,
    openPositionsCount: positions.length,
    averageLeverage,
    dominantAssets: positions.slice(0, 4).map((position) => position.coin),
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
    narrative: buildNarrative(styleTags, focusTags, baseline, bucketExposures),
    positions,
    trades,
    ledger: ledger.map((event) => ({
      id: event.id,
      time: event.time,
      type: event.type,
      direction: event.amountUsd >= 0 ? 'in' : 'out',
      amountUsd: Math.abs(event.amountUsd),
      asset: event.asset,
      label: event.label,
    })),
    activeAlerts: [],
  };
}

function inferSeverity(profile, notionalUsd) {
  const nearestDistance = profile.positions.reduce((nearest, position) => {
    if (position.liquidationDistancePct == null) return nearest;
    if (nearest == null) return position.liquidationDistancePct;
    return Math.min(nearest, position.liquidationDistancePct);
  }, null);
  if (notionalUsd >= 2_000_000 || profile.unrealizedPnl <= RISK_LOSS_USD || (nearestDistance != null && nearestDistance < LIQ_DISTANCE_PCT)) {
    return 'high';
  }
  if (notionalUsd >= 1_000_000 || profile.averageLeverage >= HIGH_LEVERAGE) return 'medium';
  return 'low';
}

function convictionFromSeverity(severity, sizeVsWalletAverage) {
  if (severity === 'high' || sizeVsWalletAverage >= 2.5) return 'high';
  if (severity === 'medium' || sizeVsWalletAverage >= 1.4) return 'medium';
  return 'low';
}

function buildEpisodeId(address, symbol, timestamp, bucket) {
  return `${address.toLowerCase()}:${bucket}:${symbol}:${Math.floor(timestamp / EPISODE_WINDOW_MS)}`;
}

function recentFillNotionalByBucket(fills, bucket, since, kind = 'close', excludeCoin = null) {
  return fills.reduce((sum, fill) => {
    if (fill.time < since) return sum;
    const descriptor = classifyWhaleAsset(fill.coin, spotMarketMap[fill.coin] ? 'hip3_spot' : 'crypto_perp', spotMarketMap[fill.coin]?.category);
    if (descriptor.riskBucket !== bucket) return sum;
    if (excludeCoin && descriptor.symbol === excludeCoin) return sum;
    const isClose = fill.dir.startsWith('Close') || fill.dir === 'Sell';
    const isOpen = fill.dir.startsWith('Open') || fill.dir === 'Buy';
    if (kind === 'close' && !isClose) return sum;
    if (kind === 'open' && !isOpen) return sum;
    return sum + fill.px * fill.sz;
  }, 0);
}

function classifyEpisode({ trigger, profile, fills }) {
  const descriptor = classifyWhaleAsset(trigger.coin, trigger.marketType, trigger.spotCategory);
  const currentPositions = profile.positions.filter((position) => position.riskBucket === descriptor.riskBucket);
  const currentLong = currentPositions.filter((position) => position.side === 'long').reduce((sum, position) => sum + position.notionalUsd, 0);
  const currentShort = currentPositions.filter((position) => position.side === 'short').reduce((sum, position) => sum + position.notionalUsd, 0);
  const currentNet = currentLong - currentShort;
  const signedTrigger = trigger.side === 'long' ? trigger.notionalUsd : -trigger.notionalUsd;
  const preNet = currentNet - signedTrigger;
  const bucketChangePct = trigger.notionalUsd > 0 ? Math.abs((currentNet - preNet) / trigger.notionalUsd) * 100 : 0;
  const offsetNotional = trigger.side === 'long' ? currentShort : currentLong;
  const offsetRatio = trigger.notionalUsd > 0 ? offsetNotional / trigger.notionalUsd : 0;
  const focusPosition = profile.positions.find((position) => position.coin === descriptor.symbol && position.marketType === descriptor.marketType);
  const previousExposure = Math.max((focusPosition?.notionalUsd || 0) - trigger.notionalUsd, 0);
  const assetIncreasePct = previousExposure > 0 ? (trigger.notionalUsd / previousExposure) * 100 : 100;
  const sizeVsWalletAverage = profile.medianTradeSize30d > 0 ? trigger.notionalUsd / profile.medianTradeSize30d : 2;
  const recentSameBucketCloses = recentFillNotionalByBucket(fills, descriptor.riskBucket, trigger.timestamp - ROTATION_WINDOW_MS, 'close', descriptor.symbol);
  const nearestLiq = profile.positions.reduce((nearest, position) => {
    if (position.liquidationDistancePct == null) return nearest;
    if (nearest == null) return position.liquidationDistancePct;
    return Math.min(nearest, position.liquidationDistancePct);
  }, null);

  let directionality = 'directional_entry';
  let eventType = trigger.side === 'long' ? 'deposit-led-long' : 'deposit-led-short';

  if (profile.unrealizedPnl <= RISK_LOSS_USD || (nearestLiq != null && nearestLiq < LIQ_DISTANCE_PCT)) {
    directionality = 'stress';
    eventType = profile.unrealizedPnl <= RISK_LOSS_USD ? 'underwater-whale' : 'liquidation-risk';
  } else if (profile.netFlow24hUsd >= DEPOSIT_THRESHOLD) {
    directionality = previousExposure > 0 ? 'directional_add' : 'directional_entry';
    eventType = trigger.side === 'long' ? 'deposit-led-long' : 'deposit-led-short';
  } else if (recentSameBucketCloses >= trigger.notionalUsd * 0.5 && bucketChangePct < 30) {
    directionality = 'rotation';
    eventType = 'flip';
  } else if (offsetRatio >= 0.6 && bucketChangePct < 30) {
    directionality = 'hedge';
    eventType = 'aggressive-add';
  } else if (focusPosition && focusPosition.notionalUsd < trigger.notionalUsd * 0.75) {
    directionality = 'reduce';
    eventType = 'reduce';
  } else if (trigger.notionalUsd >= (MAJORS.has(descriptor.symbol) ? MAJOR_THRESHOLD : ALT_THRESHOLD) && (assetIncreasePct >= 25 || sizeVsWalletAverage >= 1.5) && offsetRatio < 0.4) {
    directionality = previousExposure > 0 ? 'directional_add' : 'directional_entry';
    eventType = 'aggressive-add';
  }

  const severity = inferSeverity(profile, trigger.notionalUsd);
  const conviction = convictionFromSeverity(severity, sizeVsWalletAverage);
  const evidenceSummary =
    directionality === 'hedge'
      ? `New ${descriptor.assetClass.toLowerCase()} ${trigger.side} mostly offsets existing ${descriptor.riskBucket.replace(/_/g, ' ')} exposure.`
      : directionality === 'rotation'
        ? `Recent closes in the same bucket suggest a rotation rather than a fresh net bet.`
        : directionality === 'stress'
          ? `Open book is under stress with elevated leverage or liquidation proximity.`
          : `Adds ${sizeVsWalletAverage.toFixed(1)}x normal size with ${offsetRatio < 0.4 ? 'no material' : 'limited'} offsetting hedge.`;

  return {
    directionality,
    eventType,
    severity,
    conviction,
    sizeVsWalletAverage,
    offsetRatio,
    evidence: {
      summary: evidenceSummary,
      sizeVsWalletAverage,
      offsetRatio,
      preNetBucketUsd: preNet,
      postNetBucketUsd: currentNet,
      bucketChangePct,
    },
    descriptor,
  };
}

function buildAlertHeadline({ eventType, directionality, coin, side, leverage, assetClass }) {
  const lev = leverage ? `${leverage.toFixed(1)}x` : 'spot';
  if (eventType === 'deposit-led-long' || eventType === 'deposit-led-short') {
    return `Flow-led positioning in ${coin} ${side} at ${lev}`;
  }
  if (directionality === 'stress' || eventType === 'underwater-whale') return `Positioning stress in ${coin} ${side}`;
  if (directionality === 'hedge') return `Hedge overlay in ${coin}`;
  if (directionality === 'rotation') return `Rotation into ${coin}`;
  if (directionality === 'reduce') return `De-risking ${coin}`;
  return directionality === 'directional_add' ? `Positioning add in ${coin} ${side}` : `Positioning entry in ${coin} ${side}`;
}

async function persistWorkerStatus(payload = {}) {
  const updatedAt = Date.now();
  await pool.query(
    `insert into whale_worker_status (service, updated_at, payload)
     values ('whale-indexer', $1, $2::jsonb)
     on conflict (service) do update set updated_at = excluded.updated_at, payload = excluded.payload`,
    [updatedAt, JSON.stringify(payload)],
  );
}

async function ensureTables() {
  await pool.query(`
    create table if not exists whale_alerts (
      id text primary key,
      address text not null,
      created_at bigint not null,
      coin text not null,
      event_type text not null,
      severity text not null,
      directionality text,
      market_type text,
      risk_bucket text,
      payload jsonb not null
    );
  `);
  await pool.query(`
    create table if not exists whale_profiles_current (
      address text primary key,
      updated_at bigint not null,
      payload jsonb not null
    );
  `);
  await pool.query(`
    create table if not exists whale_trade_episodes (
      id text primary key,
      address text not null,
      created_at bigint not null,
      directionality text,
      market_type text,
      risk_bucket text,
      payload jsonb not null
    );
  `);
  await pool.query(`
    create table if not exists whale_telegram_queue (
      id text primary key,
      alert_id text unique not null,
      created_at bigint not null,
      sent_at bigint,
      message_hash text,
      payload jsonb not null
    );
  `);
  await pool.query(`
    create table if not exists whale_worker_status (
      service text primary key,
      updated_at bigint not null,
      payload jsonb
    );
  `);
  await pool.query(`create table if not exists whale_watchlist (address text primary key, nickname text, created_at bigint not null);`);
  await pool.query(`
    create table if not exists positioning_market_snapshots (
      id text primary key,
      asset text not null,
      created_at bigint not null,
      market_type text not null,
      payload jsonb not null
    );
  `);
  await pool.query(`
    create table if not exists positioning_alerts (
      id text primary key,
      asset text not null,
      alert_type text not null,
      regime text not null,
      severity text not null,
      created_at bigint not null,
      payload jsonb not null
    );
  `);
  await pool.query(`
    create table if not exists positioning_digest_runs (
      id text primary key,
      created_at bigint not null,
      payload jsonb not null,
      message_hash text,
      telegram_sent_at bigint
    );
  `);
  await pool.query(`
    create table if not exists wallet_timing_scores (
      address text not null,
      asset text not null,
      lookahead_hours integer not null,
      updated_at bigint not null,
      payload jsonb not null,
      primary key (address, asset, lookahead_hours)
    );
  `);
  await pool.query(`alter table whale_alerts add column if not exists directionality text;`);
  await pool.query(`alter table whale_alerts add column if not exists market_type text;`);
  await pool.query(`alter table whale_alerts add column if not exists risk_bucket text;`);
  await pool.query(`alter table whale_trade_episodes add column if not exists directionality text;`);
  await pool.query(`alter table whale_trade_episodes add column if not exists market_type text;`);
  await pool.query(`alter table whale_trade_episodes add column if not exists risk_bucket text;`);
  await pool.query(`create index if not exists whale_alerts_created_at_idx on whale_alerts (created_at desc);`);
  await pool.query(`create index if not exists whale_alerts_address_idx on whale_alerts (address);`);
  await pool.query(`create index if not exists whale_alerts_directionality_idx on whale_alerts (directionality, created_at desc);`);
  await pool.query(`create index if not exists positioning_alerts_created_at_idx on positioning_alerts (created_at desc);`);
  await pool.query(`create index if not exists positioning_alerts_asset_idx on positioning_alerts (asset, created_at desc);`);
  await pool.query(`create index if not exists positioning_market_snapshots_asset_idx on positioning_market_snapshots (asset, created_at desc);`);
}

async function persistAlert(alert, profile, episode) {
  await pool.query(
    `insert into whale_alerts (id, address, created_at, coin, event_type, severity, directionality, market_type, risk_bucket, payload)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     on conflict (id) do update set payload = excluded.payload, severity = excluded.severity, directionality = excluded.directionality, market_type = excluded.market_type, risk_bucket = excluded.risk_bucket`,
    [
      alert.id,
      alert.address.toLowerCase(),
      alert.timestamp,
      alert.coin,
      alert.eventType,
      alert.severity,
      alert.directionality,
      alert.marketType,
      alert.riskBucket,
      JSON.stringify(alert),
    ],
  );
  await pool.query(
    `insert into whale_profiles_current (address, updated_at, payload)
     values ($1, $2, $3::jsonb)
     on conflict (address) do update set updated_at = excluded.updated_at, payload = excluded.payload`,
    [profile.address.toLowerCase(), profile.lastSeenAt || Date.now(), JSON.stringify(profile)],
  );
  await pool.query(
    `insert into whale_trade_episodes (id, address, created_at, directionality, market_type, risk_bucket, payload)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     on conflict (id) do update set payload = excluded.payload`,
    [episode.id, episode.address.toLowerCase(), episode.startedAt, episode.directionality, episode.marketType, episode.riskBucket, JSON.stringify(episode)],
  );
}

function buildWhyItPassed(alert, profile) {
  const reasons = [];
  if (alert.sizeVsWalletAverage >= 1) {
    reasons.push(`${alert.sizeVsWalletAverage.toFixed(1)}x avg size`);
  }
  if (Number.isFinite(profile?.realizedPnl30d)) {
    reasons.push(`${formatSignedUsd(profile.realizedPnl30d)} 30d PnL`);
  } else if (alert.directionality === 'stress') {
    reasons.push('stress setup');
  } else if (alert.offsetRatio <= 0.2) {
    reasons.push('low offset');
  } else if (alert.marketType === 'hip3_spot') {
    reasons.push('qualified HIP-3 flow');
  } else {
    reasons.push('positioning imbalance');
  }
  return reasons.slice(0, 2).join(' · ');
}

function shouldSendTelegram(alert, profile) {
  if (profile.realizedPnl30d < DEFAULT_WHALE_MIN_REALIZED_PNL_30D) return false;
  if (!['directional_entry', 'directional_add', 'stress'].includes(alert.directionality)) return false;
  if (alert.eventType === 'reduce') return false;
  if (alert.conviction === 'low' && alert.directionality !== 'stress') return false;
  if (alert.marketType === 'hip3_spot') {
    if (!isQualifiedHip3Symbol(alert.coin)) return false;
  } else if (!TELEGRAM_LARGE_CAP_PERP_ALLOWLIST.has(alert.coin)) {
    return false;
  }

  const dedupeKey = `${alert.address.toLowerCase()}:${alert.coin}:${alert.directionality}:${alert.side}`;
  const lastSentAt = recentTelegramAlerts.get(dedupeKey);
  if (lastSentAt && Date.now() - lastSentAt < TELEGRAM_ALERT_COOLDOWN_MS) return false;
  recentTelegramAlerts.set(dedupeKey, Date.now());
  return true;
}

const TELEGRAM_ASSET_EMOJI = new Map([
  ['BTC', '₿'],
  ['ETH', 'Ξ'],
  ['SOL', '◎'],
  ['HYPE', '⚡'],
  ['AAVE', '🏦'],
  ['LINK', '🔗'],
  ['AVAX', '🏔️'],
  ['XRP', '💧'],
  ['DOGE', '🐕'],
  ['TAO', '🧠'],
  ['NEAR', '🌐'],
  ['RENDER', '🎨'],
]);

function titleCase(value) {
  if (!value) return '';
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function inferDisplaySide(alert) {
  const detailMatch = alert.detail?.match(/\b(long|short)\b/i);
  if (detailMatch) return titleCase(detailMatch[1].toLowerCase());
  if (alert.side === 'mixed') return 'Two-way';
  return titleCase(alert.side);
}

function telegramHeader(alert) {
  const assetEmoji = TELEGRAM_ASSET_EMOJI.get(alert.coin) || '🐋';
  if (alert.directionality === 'stress') return `${assetEmoji} ⚠️ POSITIONING STRESS`;
  if (alert.eventType.startsWith('deposit-led')) return `${assetEmoji} 💸 FLOW-LED POSITIONING`;
  if (alert.directionality === 'directional_add') return `${assetEmoji} 📈 POSITIONING ADD`;
  return `${assetEmoji} 🎯 POSITIONING IMBALANCE`;
}

function buildTelegramMessage(alert, profile) {
  const marketLabel = alert.marketType === 'hip3_spot' ? `QUALIFIED HIP-3 ${titleCase(alert.assetClass)}` : 'Perp';
  const leverageLabel = alert.leverage ? `${alert.leverage.toFixed(1)}x` : 'spot';
  const sizeVsAvg = formatMultiple(alert.sizeVsWalletAverage);
  const displaySide = inferDisplaySide(alert);
  const evidenceLine = buildWhyItPassed(alert, profile);
  const walletUrl = `${APP_URL}/whales/${alert.address}?alert=${alert.id}`;
  const chartUrl = `${APP_URL}/?tab=markets&asset=${alert.coin}`;

  const line1 = telegramHeader(alert);
  const line2 = `${alert.coin} ${displaySide.toUpperCase()} · ${marketLabel.toUpperCase()}`;
  const line3 = `SIZE: ${formatCompact(alert.notionalUsd)} · LEVERAGE: ${leverageLabel} · VS AVG: ${sizeVsAvg}`;
  const line4 = `30D PNL: ${formatSignedUsd(profile.realizedPnl30d)} · WIN RATE: ${profile.directionalHitRate30d.toFixed(1)}%`;
  const line5 = `WHY IT MATTERS: ${evidenceLine}`;
  const line6 = `WALLET: ${walletUrl}`;
  const line7 = `CHART: ${chartUrl}`;
  return [line1, line2, line3, line4, line5, line6, line7].filter(Boolean).join('\n');
}

function formatCompact(value) {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatSignedUsd(value) {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatPct(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${value >= 0 ? '+' : ''}${Number(value).toFixed(1)}%`;
}

function percentileRank(values, value) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  let count = 0;
  for (const entry of sorted) {
    if (entry <= value) count += 1;
  }
  return (count / sorted.length) * 100;
}

function snapshotAtOrBefore(snapshots, targetTime) {
  for (const snapshot of snapshots) {
    if (snapshot.timestamp <= targetTime) return snapshot;
  }
  return null;
}

function formatPositioningRegime(regime) {
  switch (regime) {
    case 'crowded_long':
      return 'Crowded Long';
    case 'crowded_short':
      return 'Crowded Short';
    case 'downside_magnet':
      return 'Downside Magnet';
    case 'upside_magnet':
      return 'Upside Magnet';
    case 'whale_conviction':
      return 'Whale Conviction';
    default:
      return titleCase(regime || '');
  }
}

function severityFromSnapshot(snapshot) {
  if (Math.abs(snapshot.oiChange4h || 0) >= 12 || Math.abs(snapshot.fundingAPR || 0) >= 50) return 'high';
  if (Math.abs(snapshot.oiChange4h || 0) >= 8 || Math.abs(snapshot.fundingAPR || 0) >= 25) return 'medium';
  return 'low';
}

function buildSnapshotId(asset, timestamp) {
  return `snap:${asset}:${Math.floor(timestamp / POSITIONING_SNAPSHOT_INTERVAL_MS)}`;
}

async function persistPositioningSnapshot(snapshot) {
  await pool.query(
    `insert into positioning_market_snapshots (id, asset, created_at, market_type, payload)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (id) do update set created_at = excluded.created_at, payload = excluded.payload`,
    [snapshot.id, snapshot.asset, snapshot.timestamp, snapshot.marketType, JSON.stringify(snapshot)],
  );
}

async function persistPositioningAlert(alert) {
  await pool.query(
    `insert into positioning_alerts (id, asset, alert_type, regime, severity, created_at, payload)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     on conflict (id) do update set created_at = excluded.created_at, payload = excluded.payload, severity = excluded.severity`,
    [alert.id, alert.asset, alert.alertType, alert.regime, alert.severity, alert.timestamp, JSON.stringify(alert)],
  );
}

async function persistPositioningDigest(digest, messageHash = null, telegramSentAt = null) {
  await pool.query(
    `insert into positioning_digest_runs (id, created_at, payload, message_hash, telegram_sent_at)
     values ($1, $2, $3::jsonb, $4, $5)
     on conflict (id) do update set payload = excluded.payload, message_hash = excluded.message_hash, telegram_sent_at = excluded.telegram_sent_at`,
    [digest.id, digest.createdAt, JSON.stringify({ ...digest, telegramSentAt }), messageHash, telegramSentAt],
  );
}

async function queueTelegramMessage(id, payload) {
  if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const message = payload.message;
  const messageHash = createHash('sha256').update(message).digest('hex');
  await pool.query(
    `insert into whale_telegram_queue (id, alert_id, created_at, message_hash, payload)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (alert_id) do nothing`,
    [`tg:${id}`, id, Date.now(), messageHash, JSON.stringify(payload)],
  );
}

async function loadRecentSnapshots(asset, limit = 600) {
  const result = await pool.query(
    `select payload from positioning_market_snapshots where asset = $1 order by created_at desc limit $2`,
    [asset, limit],
  );
  return result.rows.map((row) => row.payload).sort((a, b) => b.timestamp - a.timestamp);
}

async function loadTimingScore(address, asset, lookaheadHours = 4) {
  const result = await pool.query(
    `select payload from wallet_timing_scores where address = $1 and asset = $2 and lookahead_hours = $3 limit 1`,
    [address.toLowerCase(), asset, lookaheadHours],
  );
  return result.rows[0]?.payload || null;
}

async function loadTopDecilePnlCutoff() {
  const result = await pool.query(`select payload from whale_profiles_current`);
  const realizedPnls = result.rows
    .map((row) => Number(row.payload?.realizedPnl30d || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!realizedPnls.length) return HIGH_CONVICTION_PNL_FLOOR;
  const idx = Math.max(Math.floor(realizedPnls.length * 0.9) - 1, 0);
  return Math.max(realizedPnls[idx], HIGH_CONVICTION_PNL_FLOOR);
}

async function loadRepeatedAddCount(address, asset, side) {
  const result = await pool.query(
    `select count(*)::int as count
     from whale_alerts
     where address = $1
       and coin = $2
       and directionality in ('directional_entry', 'directional_add')
       and created_at >= $3
       and (payload->>'side') = $4`,
    [address.toLowerCase(), asset, Date.now() - 6 * 60 * 60 * 1000, side],
  );
  return Number(result.rows[0]?.count || 0);
}

function buildCrowdingAlert(snapshot, history) {
  const fundingValues = history
    .map((entry) => Number(entry.fundingAPR))
    .filter((value) => Number.isFinite(value));
  const fundingPercentile = percentileRank(fundingValues, snapshot.fundingAPR || 0);
  const oi1h = snapshot.oiChange1h || 0;
  const oi4h = snapshot.oiChange4h || 0;
  const price1h = snapshot.priceChange1h || 0;
  const basisBps = snapshot.basisBps ?? null;

  const crowdedLong =
    (snapshot.fundingAPR || 0) >= CROWDING_POS_FUNDING_APR &&
    (fundingPercentile == null || fundingPercentile >= 85) &&
    (oi1h >= CROWDING_OI_CHANGE_1H_PCT || oi4h >= CROWDING_OI_CHANGE_4H_PCT) &&
    price1h <= 1.5;
  const crowdedShort =
    (snapshot.fundingAPR || 0) <= -CROWDING_NEG_FUNDING_APR_ABS &&
    (fundingPercentile == null || fundingPercentile <= 15) &&
    (oi1h >= CROWDING_OI_CHANGE_1H_PCT || oi4h >= CROWDING_OI_CHANGE_4H_PCT) &&
    price1h >= -1.5;

  if (!crowdedLong && !crowdedShort) return null;

  const regime = crowdedLong ? 'crowded_long' : 'crowded_short';
  const divergence =
    basisBps == null
      ? ''
      : basisBps >= 20
        ? ' · perps leading spot'
        : basisBps <= -10
          ? ' · spot leading perp'
          : '';
  const directionText = crowdedLong ? 'heavily long' : 'heavily short';
  const fragilityText = crowdedLong ? 'downside risk' : 'squeeze risk';

  return {
    id: `pos:crowding:${snapshot.asset}:${regime}:${Math.floor(snapshot.timestamp / CROWDING_ALERT_COOLDOWN_MS)}`,
    asset: snapshot.asset,
    alertType: 'crowding',
    regime,
    severity: severityFromSnapshot(snapshot),
    timestamp: snapshot.timestamp,
    whyItMatters: `${snapshot.asset} is ${directionText} with OI ${formatPct(oi4h)} in 4h while price stayed ${price1h >= 0 ? 'flat-to-up' : 'flat-to-down'}${divergence} -> ${fragilityText}.`,
    fundingApr: snapshot.fundingAPR,
    oiChange1h: snapshot.oiChange1h,
    oiChange4h: snapshot.oiChange4h,
    basisBps,
    price: snapshot.price,
    marketType: snapshot.marketType,
    payload: { fundingPercentile, priceChange1h: snapshot.priceChange1h, priceChange4h: snapshot.priceChange4h, spotProxySource: snapshot.spotProxySource },
  };
}

function clusterTrackedLiquidations(asset, currentPrice, profiles) {
  const below = new Map();
  const above = new Map();
  for (const profile of profiles) {
    for (const position of profile.positions || []) {
      if (position.coin !== asset || position.marketType !== 'crypto_perp') continue;
      if (!position.liquidationPx || position.notionalUsd <= 0) continue;
      const bucketPrice = Math.round((position.liquidationPx / currentPrice) * 200) / 200;
      const targetMap = position.side === 'long' ? below : above;
      const current = targetMap.get(bucketPrice) || { notionalUsd: 0, price: position.liquidationPx };
      current.notionalUsd += position.notionalUsd;
      targetMap.set(bucketPrice, current);
    }
  }
  const bestBelow = [...below.values()].sort((a, b) => b.notionalUsd - a.notionalUsd)[0] || null;
  const bestAbove = [...above.values()].sort((a, b) => b.notionalUsd - a.notionalUsd)[0] || null;
  return { bestBelow, bestAbove };
}

function buildLiquidationAlert(asset, currentPrice, cluster, side, timestamp) {
  if (!cluster || cluster.notionalUsd < TRACKED_CLUSTER_MIN_USD) return null;
  const regime = side === 'below' ? 'downside_magnet' : 'upside_magnet';
  return {
    id: `pos:liquidation:${asset}:${regime}:${Math.floor(timestamp / LIQUIDATION_ALERT_COOLDOWN_MS)}`,
    asset,
    alertType: 'liquidation_pressure',
    regime,
    severity: cluster.notionalUsd >= TRACKED_CLUSTER_MIN_USD * 2 ? 'high' : 'medium',
    timestamp,
    whyItMatters: `Tracked-book ${side === 'below' ? 'long' : 'short'} liquidations cluster at ${cluster.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} with ${formatCompact(cluster.notionalUsd)} at risk -> ${side === 'below' ? 'downside magnet' : 'upside squeeze'} if price drifts there.`,
    trackedLiquidationClusterUsd: cluster.notionalUsd,
    clusterPrice: cluster.price,
    price: currentPrice,
    marketType: 'crypto_perp',
  };
}

function shouldQueuePositioningAlert(alert) {
  const cooldown =
    alert.alertType === 'crowding'
      ? CROWDING_ALERT_COOLDOWN_MS
      : alert.alertType === 'liquidation_pressure'
        ? LIQUIDATION_ALERT_COOLDOWN_MS
        : HIGH_CONVICTION_ALERT_COOLDOWN_MS;
  const dedupeKey =
    alert.alertType === 'high_conviction_whale'
      ? `${alert.walletAddress || 'walletless'}:${alert.asset}:${alert.alertType}`
      : `${alert.asset}:${alert.regime}:${alert.alertType}`;
  const lastSentAt = recentPositioningAlerts.get(dedupeKey);
  if (lastSentAt && Date.now() - lastSentAt < cooldown) return false;
  recentPositioningAlerts.set(dedupeKey, Date.now());
  return true;
}

function buildPositioningTelegramMessage(alert) {
  const line1 =
    alert.alertType === 'crowding'
      ? `🔥 ${alert.asset} ${formatPositioningRegime(alert.regime).toUpperCase()}`
      : alert.alertType === 'liquidation_pressure'
        ? `💥 ${alert.asset} ${formatPositioningRegime(alert.regime).toUpperCase()}`
        : `🐋 ${alert.asset} HIGH-CONVICTION WHALE`;
  const contextParts = [];
  if (alert.fundingApr != null) contextParts.push(`Funding ${formatPct(alert.fundingApr)}`);
  if (alert.oiChange4h != null) contextParts.push(`OI 4h ${formatPct(alert.oiChange4h)}`);
  if (alert.basisBps != null) contextParts.push(`Basis ${alert.basisBps.toFixed(0)}bps`);
  if (alert.trackedLiquidationClusterUsd != null) {
    contextParts.push(`Cluster ${formatCompact(alert.trackedLiquidationClusterUsd)} @ ${alert.clusterPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 'n/a'}`);
  }
  if (alert.repeatedAdds6h != null) contextParts.push(`Adds ${alert.repeatedAdds6h} in 6h`);
  const walletLine = alert.walletAddress ? `WALLET: ${APP_URL}/whales/${alert.walletAddress}?alert=${alert.id}` : `CHART: ${APP_URL}/?tab=markets&asset=${alert.asset}`;
  return [line1, contextParts.join(' · '), `WHY IT MATTERS: ${alert.whyItMatters}`, walletLine]
    .filter(Boolean)
    .join('\n');
}

function buildDigestMessage(digest) {
  return [
    `📬 HYPERPULSE POSITIONING DIGEST`,
    digest.headline,
    ...digest.summaryLines,
    `APP: ${APP_URL}/whales`,
  ].join('\n');
}

async function emitPositioningAlert(alert, { queueTelegram = true } = {}) {
  await persistPositioningAlert(alert);
  if (!queueTelegram || !shouldQueuePositioningAlert(alert)) return;
  const message = buildPositioningTelegramMessage(alert);
  await queueTelegramMessage(alert.id, { kind: 'positioning-alert', alert, message });
}

async function updateWalletTimingScores() {
  const alertsResult = await pool.query(
    `select payload from whale_alerts
     where directionality in ('directional_entry', 'directional_add')
       and market_type = 'crypto_perp'
       and created_at >= $1
     order by created_at desc
     limit 1500`,
    [Date.now() - 30 * 24 * 60 * 60 * 1000],
  );

  const grouped = new Map();
  for (const row of alertsResult.rows) {
    const alert = row.payload;
    if (!POSITIONING_MAJOR_PERPS.has(alert.coin)) continue;
    const key = `${alert.address.toLowerCase()}:${alert.coin}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(alert);
  }

  for (const [key, alerts] of grouped.entries()) {
    const [address, asset] = key.split(':');
    const snapshots = await loadRecentSnapshots(asset, 800);
    if (snapshots.length < 12) continue;

    const scored = [1, 4].map((lookaheadHours) => {
      let sampleSize = 0;
      let hits = 0;
      for (const alert of alerts) {
        const startSnapshot = snapshotAtOrBefore(snapshots, alert.timestamp);
        const endSnapshot = snapshotAtOrBefore(snapshots, alert.timestamp + lookaheadHours * 60 * 60 * 1000);
        if (!startSnapshot || !endSnapshot) continue;
        const returnPct = ((endSnapshot.price - startSnapshot.price) / startSnapshot.price) * 100;
        const success = alert.side === 'long' ? returnPct > 0 : returnPct < 0;
        sampleSize += 1;
        if (success) hits += 1;
      }
      return {
        address,
        asset,
        lookaheadHours,
        sampleSize,
        hitRate: sampleSize > 0 ? (hits / sampleSize) * 100 : 0,
        updatedAt: Date.now(),
      };
    });

    for (const score of scored) {
      if (score.sampleSize === 0) continue;
      await pool.query(
        `insert into wallet_timing_scores (address, asset, lookahead_hours, updated_at, payload)
         values ($1, $2, $3, $4, $5::jsonb)
         on conflict (address, asset, lookahead_hours) do update set updated_at = excluded.updated_at, payload = excluded.payload`,
        [score.address, score.asset, score.lookaheadHours, score.updatedAt, JSON.stringify(score)],
      );
    }
  }
}

async function maybeEmitHighConvictionWhale(alert, profile) {
  if (alert.marketType !== 'crypto_perp' && !POSITIONING_HIP3_ALLOWLIST.has(alert.coin)) return null;
  if (alert.marketType === 'crypto_perp' && !POSITIONING_MAJOR_PERPS.has(alert.coin)) return null;
  if (profile.realizedPnl30d < HIGH_CONVICTION_PNL_FLOOR) return null;

  const topDecileCutoff = await loadTopDecilePnlCutoff();
  if (profile.realizedPnl30d < topDecileCutoff) return null;

  const repeatedAdds6h = await loadRepeatedAddCount(alert.address, alert.coin, alert.side);
  const timingScore = await loadTimingScore(alert.address, alert.coin, 4);
  profile.repeatedAddCount6h = repeatedAdds6h;
  profile.preMoveHitRate4h = timingScore?.hitRate ?? null;
  profile.preMoveSampleSize = timingScore?.sampleSize ?? null;

  const qualifiesByAdds = repeatedAdds6h >= 4;
  const qualifiesByTiming = (timingScore?.sampleSize || 0) >= 5 && (timingScore?.hitRate || 0) >= 65;
  if (!qualifiesByAdds && !qualifiesByTiming) return null;

  const positioningAlert = {
    id: `pos:whale:${alert.address.toLowerCase()}:${alert.coin}:${Math.floor(alert.timestamp / HIGH_CONVICTION_ALERT_COOLDOWN_MS)}`,
    asset: alert.coin,
    alertType: 'high_conviction_whale',
    regime: 'whale_conviction',
    severity: profile.realizedPnl30d >= Math.max(topDecileCutoff * 1.25, 2_000_000) ? 'high' : 'medium',
    timestamp: alert.timestamp,
    whyItMatters: qualifiesByAdds
      ? `${shortAddress(alert.address)} has added ${repeatedAdds6h} times in 6h with ${formatSignedUsd(profile.realizedPnl30d)} 30d PnL -> rare conviction signal.`
      : `${shortAddress(alert.address)} has a ${timingScore.hitRate.toFixed(0)}% pre-move hit rate over ${timingScore.sampleSize} samples and is adding again -> timing edge worth watching.`,
    walletAddress: alert.address,
    walletLabel: shortAddress(alert.address),
    fundingApr: null,
    oiChange1h: null,
    oiChange4h: null,
    basisBps: null,
    trackedLiquidationClusterUsd: null,
    repeatedAdds6h,
    price: alert.markPx ?? null,
    marketType: alert.marketType,
    payload: {
      topDecileCutoff,
      timingScore,
      sourceAlertId: alert.id,
      realizedPnl30d: profile.realizedPnl30d,
    },
  };

  await emitPositioningAlert(positioningAlert, { queueTelegram: true });
  return positioningAlert;
}

async function enqueueTelegram(alert, profile) {
  if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !shouldSendTelegram(alert, profile)) return;
  const message = buildTelegramMessage(alert, profile);
  const messageHash = createHash('sha256').update(message).digest('hex');
  await pool.query(
    `insert into whale_telegram_queue (id, alert_id, created_at, message_hash, payload)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (alert_id) do nothing`,
    [`tg:${alert.id}`, alert.id, Date.now(), messageHash, JSON.stringify({ alert, profile, message })],
  );
}

async function flushTelegramQueue() {
  if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const result = await pool.query(
    `select id, message_hash, payload from whale_telegram_queue where sent_at is null order by created_at asc limit 10`,
  );
  for (const row of result.rows) {
    const payload = row.payload || {};
    const message = payload.message;
    if (!message) continue;
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, disable_web_page_preview: true }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error('[whale-indexer] telegram send failed', response.status, body);
      continue;
    }
    const sentAt = Date.now();
    await pool.query(`update whale_telegram_queue set sent_at = $2 where id = $1`, [row.id, sentAt]);
    if (payload.kind === 'positioning-digest' && payload.digest?.id) {
      await pool.query(
        `update positioning_digest_runs set telegram_sent_at = $2 where id = $1`,
        [payload.digest.id, sentAt],
      );
    }
    if (payload.alert && payload.kind !== 'positioning-alert') await appendAlertToSheet(payload.alert);
  }
}

let sheetsClient = null;
async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  if (!SHEETS_ENABLED || !SHEETS_CREDS_B64 || !SHEETS_SPREADSHEET_ID) return null;
  const credsJson = Buffer.from(SHEETS_CREDS_B64, 'base64').toString('utf8');
  const creds = JSON.parse(credsJson);
  const auth = new google.auth.JWT(creds.client_email, null, creds.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
  await auth.authorize();
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

function shortAddress(addr) {
  if (!addr || addr.length < 12) return addr || '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function appendAlertToSheet(alert) {
  if (!SHEETS_ENABLED) return;
  try {
    const sheets = await getSheetsClient();
    if (!sheets) return;
    const ts = new Date(alert.timestamp || Date.now()).toISOString().replace('T', ' ').slice(0, 19);
    const eventLabel = String(alert.eventType || '').replace(/-/g, ' ').toUpperCase();
    const sideLabel = String(alert.side || '').toUpperCase();
    const trade = `${eventLabel} ${sideLabel} ${alert.coin}`.trim();
    const conviction = alert.conviction ? alert.conviction.charAt(0).toUpperCase() + alert.conviction.slice(1) : '';
    const sizeVsAvg = formatMultiple(alert.sizeVsWalletAverage);
    const wallet = `${shortAddress(alert.address)}`;
    const entry = alert.entryPx != null ? Number(alert.entryPx) : '';
    const current = alert.markPx != null ? Number(alert.markPx) : '';
    const pnlPct = alert.pnlPct != null ? Number(alert.pnlPct.toFixed(2)) : '';
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEETS_SPREADSHEET_ID,
      range: `${SHEETS_TAB}!A:H`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[ts, trade, conviction, sizeVsAvg, wallet, entry, current, pnlPct]] },
    });
  } catch (err) {
    console.error('[whale-indexer] sheets append failed', err.message);
  }
}

async function refreshUniverse() {
  const [meta] = await info.metaAndAssetCtxs();
  perpUniverse = meta.universe.filter((asset) => !asset.isDelisted).map((asset) => asset.name);
  const [spotMeta, spotCtxs] = await info.spotMetaAndAssetCtxs();
  spotMarketMap = buildSpotMarketMap(spotMeta, spotCtxs);
  spotSubscriptions = Object.values(spotMarketMap)
    .filter((market, index, self) => self.findIndex((entry) => entry.marketKey === market.marketKey) === index)
    .map((market) => market.marketKey);
  console.log(`[whale-indexer] loaded ${perpUniverse.length} perps and ${spotSubscriptions.length} spot markets`);
}

async function loadTrackedProfiles() {
  const result = await pool.query(`select payload from whale_profiles_current`);
  return result.rows
    .map((row) => row.payload)
    .filter((profile) => Number(profile?.realizedPnl30d || 0) >= TRACKED_BOOK_PNL_FLOOR);
}

async function runMarketStructureCycle() {
  const now = Date.now();
  const [meta, spotMeta] = await Promise.all([info.metaAndAssetCtxs(), info.spotMetaAndAssetCtxs()]);
  const [perpMeta, perpAssetCtxs] = meta;
  const [spotMetaData, spotAssetCtxs] = spotMeta;
  spotMarketMap = buildSpotMarketMap(spotMetaData, spotAssetCtxs);

  const currentPrices = new Map();

  for (const assetName of POSITIONING_MAJOR_PERPS) {
    const assetIndex = perpMeta.universe.findIndex((asset) => asset.name === assetName && !asset.isDelisted);
    if (assetIndex === -1) continue;
    const ctx = perpAssetCtxs[assetIndex];
    if (!ctx) continue;

    const price = parseNumber(ctx.markPx);
    const fundingAPR = parseNumber(ctx.funding) * 8760 * 100;
    const openInterestUsd = parseNumber(ctx.openInterest) * price;
    const history = await loadRecentSnapshots(assetName, 900);
    const oneHour = snapshotAtOrBefore(history, now - 60 * 60 * 1000);
    const fourHours = snapshotAtOrBefore(history, now - 4 * 60 * 60 * 1000);
    const spotProxy = spotMarketMap[assetName] || null;
    const basisBps = spotProxy?.markPx ? ((price - spotProxy.markPx) / spotProxy.markPx) * 10_000 : null;

    const snapshot = {
      id: buildSnapshotId(assetName, now),
      asset: assetName,
      timestamp: now,
      price,
      marketType: 'crypto_perp',
      fundingAPR,
      openInterestUsd,
      oiChange1h: oneHour?.openInterestUsd ? ((openInterestUsd - oneHour.openInterestUsd) / oneHour.openInterestUsd) * 100 : null,
      oiChange4h: fourHours?.openInterestUsd ? ((openInterestUsd - fourHours.openInterestUsd) / fourHours.openInterestUsd) * 100 : null,
      basisBps,
      spotProxySource: spotProxy?.pair || null,
      priceChange1h: oneHour?.price ? ((price - oneHour.price) / oneHour.price) * 100 : null,
      priceChange4h: fourHours?.price ? ((price - fourHours.price) / fourHours.price) * 100 : null,
    };

    latestMarketSnapshots.set(assetName, snapshot);
    currentPrices.set(assetName, price);
    await persistPositioningSnapshot(snapshot);

    const crowdingAlert = buildCrowdingAlert(snapshot, [snapshot, ...history]);
    if (crowdingAlert) {
      await emitPositioningAlert(crowdingAlert, { queueTelegram: true });
    }
  }

  const trackedProfiles = await loadTrackedProfiles();
  for (const assetName of POSITIONING_MAJOR_PERPS) {
    const currentPrice = currentPrices.get(assetName);
    if (!currentPrice) continue;
    const clusters = clusterTrackedLiquidations(assetName, currentPrice, trackedProfiles);
    const downsideAlert = buildLiquidationAlert(assetName, currentPrice, clusters.bestBelow, 'below', now);
    const upsideAlert = buildLiquidationAlert(assetName, currentPrice, clusters.bestAbove, 'above', now);
    if (downsideAlert) await emitPositioningAlert(downsideAlert, { queueTelegram: true });
    if (upsideAlert) await emitPositioningAlert(upsideAlert, { queueTelegram: true });
  }
}

async function maybeRunDigest() {
  const now = Date.now();
  const periodEnd = Math.floor(now / POSITIONING_DIGEST_INTERVAL_MS) * POSITIONING_DIGEST_INTERVAL_MS;
  const periodStart = periodEnd - POSITIONING_DIGEST_INTERVAL_MS;
  const digestId = `digest:${periodEnd}`;
  const existing = await pool.query(`select id from positioning_digest_runs where id = $1 limit 1`, [digestId]);
  if (existing.rows[0]) return;

  const alertsResult = await pool.query(
    `select payload from positioning_alerts where created_at >= $1 and created_at < $2 order by created_at desc limit 12`,
    [periodStart, periodEnd],
  );
  const alerts = alertsResult.rows.map((row) => row.payload);
  const crowding = alerts.filter((alert) => alert.alertType === 'crowding').slice(0, 3);
  const liquidation = alerts.filter((alert) => alert.alertType === 'liquidation_pressure').slice(0, 2);
  const whale = alerts.find((alert) => alert.alertType === 'high_conviction_whale') || null;

  const summaryLines = [];
  if (crowding.length > 0) {
    summaryLines.push(...crowding.map((alert) => `CROWDING: ${alert.asset} · ${alert.whyItMatters}`));
  } else {
    const latest = [...latestMarketSnapshots.values()]
      .sort((a, b) => Math.abs(b.oiChange4h || 0) - Math.abs(a.oiChange4h || 0))
      .slice(0, 2);
    if (latest.length > 0) {
      summaryLines.push(...latest.map((snapshot) => `SETUP: ${snapshot.asset} funding ${formatPct(snapshot.fundingAPR)} · OI 4h ${formatPct(snapshot.oiChange4h)}`));
    } else {
      summaryLines.push('No major crowding setups crossed the high-confidence threshold in this window.');
    }
  }
  if (liquidation.length > 0) {
    summaryLines.push(...liquidation.map((alert) => `LIQUIDATION: ${alert.asset} · ${alert.whyItMatters}`));
  } else {
    summaryLines.push('No tracked-book liquidation magnets passed the alert threshold in this window.');
  }
  if (whale) {
    summaryLines.push(`RARE WHALE: ${whale.asset} · ${whale.whyItMatters}`);
  }

  const digest = {
    id: digestId,
    createdAt: now,
    periodStart,
    periodEnd,
    headline: `Window ${new Date(periodStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${new Date(periodEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
    summaryLines,
    alertIds: alerts.map((alert) => alert.id),
    telegramSentAt: null,
  };

  const message = buildDigestMessage(digest);
  await queueTelegramMessage(digest.id, { kind: 'positioning-digest', digest, message });
  await persistPositioningDigest(digest, createHash('sha256').update(message).digest('hex'), null);
}

async function enrichWallet(address, trigger) {
  const now = Date.now();
  const startTime = now - 30 * 24 * 60 * 60 * 1000;
  const [perpState, spotState, rawFills, funding, rawLedger] = await Promise.all([
    info.clearinghouseState({ user: address }),
    info.spotClearinghouseState({ user: address }),
    info.userFillsByTime({ user: address, startTime, aggregateByTime: true }),
    info.userFunding({ user: address, startTime, endTime: now }),
    info.userNonFundingLedgerUpdates({ user: address, startTime, endTime: now }),
  ]);

  const fills = normalizeFills(rawFills || []);
  const ledger = normalizeLedger(rawLedger || [], address);
  const profile = buildProfile(address, perpState, spotState, fills, funding || [], ledger);
  const classification = classifyEpisode({ trigger, profile, fills });
  const focusPosition = profile.positions.find(
    (position) => position.coin === classification.descriptor.symbol && position.marketType === classification.descriptor.marketType,
  ) || {
    coin: classification.descriptor.symbol,
    side: trigger.side,
    notionalUsd: trigger.notionalUsd,
    leverage: trigger.leverage || null,
  };

  const headline = buildAlertHeadline({
    eventType: classification.eventType,
    directionality: classification.directionality,
    coin: classification.descriptor.symbol,
    side: trigger.side,
    leverage: focusPosition.leverage,
    assetClass: classification.descriptor.assetClass,
  });

  const alert = {
    id: buildEpisodeId(address, classification.descriptor.symbol, trigger.timestamp, classification.descriptor.riskBucket),
    address,
    walletLabel: address,
    eventType: classification.eventType,
    directionality: classification.directionality,
    severity: classification.severity,
    conviction: classification.conviction,
    headline,
    detail: `${classification.descriptor.symbol} ${trigger.side} · ${classification.descriptor.assetClass} · ${classification.evidence.summary}`,
    timestamp: trigger.timestamp,
    coin: classification.descriptor.symbol,
    side: trigger.side,
    notionalUsd: trigger.notionalUsd,
    leverage: focusPosition.leverage,
    entryPx: focusPosition.entryPx ?? null,
    markPx: focusPosition.markPx ?? null,
    positionUnrealizedPnl: focusPosition.unrealizedPnl ?? null,
    pnlPct:
      focusPosition.entryPx > 0 && focusPosition.szi
        ? (focusPosition.unrealizedPnl / (Math.abs(focusPosition.szi) * focusPosition.entryPx)) * 100
        : null,
    netFlow24hUsd: profile.netFlow24hUsd,
    deposit24h: Math.max(profile.netFlow24hUsd, 0),
    unrealizedPnl: profile.unrealizedPnl,
    sizeVsWalletAverage: classification.sizeVsWalletAverage,
    offsetRatio: classification.offsetRatio,
    marketType: classification.descriptor.marketType,
    assetClass: classification.descriptor.assetClass,
    riskBucket: classification.descriptor.riskBucket,
    confidenceLabel: '',
    walletRealizedPnl30d: profile.realizedPnl30d,
    walletDirectionalHitRate30d: profile.directionalHitRate30d,
    behaviorTags: Array.from(new Set([...(profile.behaviorTags || []), ...(profile.styleTags || []).includes('Hedger') ? ['Two-sided book'] : []])),
    evidence: classification.evidence,
  };
  alert.confidenceLabel = buildWhyItPassed(alert, profile);

  const episode = {
    id: alert.id,
    address,
    coin: alert.coin,
    startedAt: trigger.timestamp,
    endedAt: trigger.timestamp,
    marketType: alert.marketType,
    riskBucket: alert.riskBucket,
    directionality: alert.directionality,
    fills: fills.filter((fill) => fill.time >= trigger.timestamp - EPISODE_WINDOW_MS && fill.time <= trigger.timestamp + 5_000),
    ledger: profile.ledger.filter((event) => event.time >= trigger.timestamp - EPISODE_WINDOW_MS),
    alert,
  };

  profile.activeAlerts = [alert];
  return { alert, profile, episode };
}

async function processTrigger(trigger) {
  const episodeId = buildEpisodeId(trigger.address, trigger.coin, trigger.timestamp, trigger.riskBucket);
  const lastSeen = recentEpisodes.get(episodeId);
  if (lastSeen && Date.now() - lastSeen < EPISODE_WINDOW_MS) return;
  recentEpisodes.set(episodeId, Date.now());
  const enriched = await enrichWallet(trigger.address, trigger);
  await maybeEmitHighConvictionWhale(enriched.alert, enriched.profile);
  await persistAlert(enriched.alert, enriched.profile, enriched.episode);
  await persistWorkerStatus({
    lastAlertAt: enriched.alert.timestamp,
    lastCoin: enriched.alert.coin,
    directionality: enriched.alert.directionality,
    marketType: enriched.alert.marketType,
  });
  console.log(`[whale-indexer] ${enriched.alert.headline}`);
}

function tradeThreshold(symbol) {
  return MAJORS.has(symbol) ? MAJOR_THRESHOLD : ALT_THRESHOLD;
}

async function handleTrade(trade, marketType) {
  const coinKey = String(trade.coin || '');
  const address = trade.users?.[1];
  if (!address) return;

  const descriptor = marketType === 'hip3_spot'
    ? spotMarketMap[coinKey] || classifyWhaleAsset(coinKey, 'hip3_spot', inferSpotCategory(coinKey))
    : classifyWhaleAsset(coinKey, 'crypto_perp');
  const symbol = descriptor.symbol;
  if (marketType === 'hip3_spot' && !isQualifiedHip3Symbol(symbol)) return;
  const notionalUsd = parseNumber(trade.px) * parseNumber(trade.sz);
  if (notionalUsd < tradeThreshold(symbol)) return;

  const side = String(trade.side || 'B') === 'B' ? 'long' : 'short';
  await processTrigger({
    address,
    coin: symbol,
    timestamp: Number(trade.time || Date.now()),
    notionalUsd,
    side,
    leverage: marketType === 'crypto_perp' ? null : 1,
    marketType,
    spotCategory: marketType === 'hip3_spot' ? descriptor.category : null,
    riskBucket: descriptor.riskBucket,
  });
}

async function subscribeTrades() {
  for (const coin of perpUniverse) {
    try {
      await marketWs.trades({ coin }, async (trades) => {
        for (const trade of trades) {
          try {
            await handleTrade(trade, 'crypto_perp');
          } catch (error) {
            console.error('[whale-indexer] failed handling perp trade', coin, error);
          }
        }
      });
    } catch (error) {
      console.error('[whale-indexer] perp subscription failed', coin, error);
    }
  }

  for (const spotCoin of spotSubscriptions) {
    try {
      await marketWs.trades({ coin: spotCoin }, async (trades) => {
        for (const trade of trades) {
          try {
            await handleTrade(trade, 'hip3_spot');
          } catch (error) {
            console.error('[whale-indexer] failed handling spot trade', spotCoin, error);
          }
        }
      });
    } catch (error) {
      console.error('[whale-indexer] spot subscription failed', spotCoin, error);
    }
  }
}

async function main() {
  await ensureTables();
  await refreshUniverse();
  await persistWorkerStatus({ status: 'booted', perps: perpUniverse.length, spots: spotSubscriptions.length });

  await rpcWs.explorerTxs((txs) => {
    for (const tx of txs) {
      if (!tx?.user) continue;
      recentExplorerFlow.set(tx.user.toLowerCase(), tx.time || Date.now());
    }
  });

  await marketWs.allMids(() => {});
  await subscribeTrades();
  await runMarketStructureCycle();
  await updateWalletTimingScores();
  await maybeRunDigest();

  setInterval(() => {
    persistWorkerStatus({
      status: 'running',
      explorerUsersTracked: recentExplorerFlow.size,
      latestPositioningAssets: latestMarketSnapshots.size,
    }).catch((error) => {
      console.error('[whale-indexer] heartbeat failed', error);
    });
  }, 15_000);

  setInterval(() => {
    runMarketStructureCycle().catch((error) => {
      console.error('[whale-indexer] market structure cycle failed', error);
    });
  }, POSITIONING_SNAPSHOT_INTERVAL_MS);

  setInterval(() => {
    updateWalletTimingScores().catch((error) => {
      console.error('[whale-indexer] timing score refresh failed', error);
    });
  }, 60 * 60 * 1000);

  setInterval(() => {
    maybeRunDigest().catch((error) => {
      console.error('[whale-indexer] digest scheduler failed', error);
    });
  }, 60 * 1000);

  if (TELEGRAM_ENABLED) {
    setInterval(() => {
      flushTelegramQueue().catch((error) => {
        console.error('[whale-indexer] telegram flush failed', error);
      });
    }, 10_000);
  }

  console.log('[whale-indexer] running');
}

main().catch((error) => {
  console.error('[whale-indexer] fatal', error);
  process.exit(1);
});
