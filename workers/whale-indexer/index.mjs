import { Pool } from 'pg';
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

const MAJORS = new Set(['BTC', 'ETH', 'SOL', 'HYPE']);
const MAJOR_THRESHOLD = envNumber('WHALE_MAJOR_THRESHOLD_USD', 500_000);
const ALT_THRESHOLD = envNumber('WHALE_ALT_THRESHOLD_USD', 200_000);
const DEPOSIT_THRESHOLD = envNumber('WHALE_DEPOSIT_THRESHOLD_USD', 100_000);
const EPISODE_WINDOW_MS = 15 * 60 * 1000;
const RISK_LOSS_USD = -envNumber('WHALE_RISK_LOSS_USD', 400_000);
const HIGH_LEVERAGE = envNumber('WHALE_HIGH_LEVERAGE', 8);
const LIQ_DISTANCE_PCT = envNumber('WHALE_LIQ_DISTANCE_PCT', 12);

const pool = new Pool({ connectionString: DATABASE_URL, max: 8 });
const info = new InfoClient({ transport: new HttpTransport() });
const marketWs = new SubscriptionClient({
  transport: new WebSocketTransport({ url: process.env.HYPERLIQUID_WS_URL || 'wss://api.hyperliquid.xyz/ws' }),
});
const rpcWs = new SubscriptionClient({
  transport: new WebSocketTransport({ url: process.env.WHALERPC_URL || 'wss://rpc.hyperliquid.xyz/ws' }),
});

let universe = [];
const recentExplorerFlow = new Map();

async function ensureTables() {
  await pool.query(`
    create table if not exists whale_alerts (
      id text primary key,
      address text not null,
      created_at bigint not null,
      coin text not null,
      event_type text not null,
      severity text not null,
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
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
      const liqDistance = !liquidationPx || markPx <= 0
        ? null
        : szi > 0
          ? ((markPx - liquidationPx) / markPx) * 100
          : ((liquidationPx - markPx) / markPx) * 100;
      return {
        coin: position.coin,
        side: szi > 0 ? 'long' : 'short',
        size: Math.abs(szi),
        entryPx,
        markPx,
        notionalUsd: parseNumber(position.positionValue) || Math.abs(szi) * markPx,
        leverage: position.leverage?.value || 0,
        liquidationPx,
        liquidationDistancePct: liqDistance,
        unrealizedPnl,
        returnOnEquity: parseNumber(position.returnOnEquity),
      };
    })
    .sort((a, b) => b.notionalUsd - a.notionalUsd);
}

function normalizeLedger(rawLedger = [], address) {
  const lower = address.toLowerCase();
  return rawLedger.map((entry, index) => {
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
      return 0;
    })();
    return {
      id: entry.hash || `${entry.time}-${type}-${index}`,
      time: Number(entry.time || 0),
      amountUsd: amount,
      type,
    };
  });
}

function sum24hFlow(ledger) {
  const floor = Date.now() - 24 * 60 * 60 * 1000;
  return ledger.reduce((sum, event) => (event.time >= floor ? sum + event.amountUsd : sum), 0);
}

function episodeId(address, coin, ts) {
  return `${address.toLowerCase()}:${coin}:${Math.floor(ts / EPISODE_WINDOW_MS)}`;
}

function buildHeadline(eventType, flow, coin, side, leverage) {
  const lev = leverage ? `${leverage.toFixed(1)}x` : 'n/a';
  if (eventType.startsWith('deposit-led')) {
    return `Whale deposits ${Math.abs(flow).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })} and leans ${side} ${coin} at ${lev}`;
  }
  if (eventType === 'underwater-whale') return `Whale underwater on ${coin} ${side} with ${lev} leverage`;
  if (eventType === 'liquidation-risk') return `Whale nearing liquidation on ${coin} ${side}`;
  return `Whale aggressively adds ${side} ${coin}`;
}

async function persistAlert(alert, profile) {
  await pool.query(
    `insert into whale_alerts (id, address, created_at, coin, event_type, severity, payload)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     on conflict (id) do update set payload = excluded.payload, severity = excluded.severity`,
    [alert.id, alert.address.toLowerCase(), alert.timestamp, alert.coin, alert.eventType, alert.severity, JSON.stringify(alert)],
  );
  await pool.query(
    `insert into whale_profiles_current (address, updated_at, payload)
     values ($1, $2, $3::jsonb)
     on conflict (address) do update set updated_at = excluded.updated_at, payload = excluded.payload`,
    [profile.address.toLowerCase(), profile.lastSeenAt || Date.now(), JSON.stringify(profile)],
  );
}

async function enrichWallet(address, trigger) {
  const now = Date.now();
  const startTime = now - 30 * 24 * 60 * 60 * 1000;
  const [perpState, spotState, fills, funding, ledger] = await Promise.all([
    info.clearinghouseState({ user: address }),
    info.spotClearinghouseState({ user: address }),
    info.userFillsByTime({ user: address, startTime, aggregateByTime: true }),
    info.userFunding({ user: address, startTime, endTime: now }),
    info.userNonFundingLedgerUpdates({ user: address, startTime, endTime: now }),
  ]);

  const positions = positionSnapshot(perpState.assetPositions || []);
  if (!positions.length) return null;

  const focusPosition = positions.find((position) => position.coin === trigger.coin) || positions[0];
  const unrealizedPnl = positions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
  const totalOpenNotionalUsd = positions.reduce((sum, position) => sum + position.notionalUsd, 0);
  const avgLeverage = totalOpenNotionalUsd > 0
    ? positions.reduce((sum, position) => sum + position.notionalUsd * position.leverage, 0) / totalOpenNotionalUsd
    : 0;
  const balances = spotState.balances || [];
  const usdcBalance = balances.find((balance) => balance.coin === 'USDC');
  const spotUsdc = usdcBalance ? parseNumber(usdcBalance.total) : 0;
  const ledgerEvents = normalizeLedger(ledger, address);
  const netFlow24hUsd = sum24hFlow(ledgerEvents);
  const realizedPnl30d = (fills || []).reduce((sum, fill) => sum + parseNumber(fill.closedPnl), 0);
  const funding30d = (funding || []).reduce((sum, event) => sum + parseNumber(event.usdc), 0);
  const nearestLiq = positions.reduce((nearest, position) => {
    if (position.liquidationDistancePct == null) return nearest;
    if (nearest == null) return position.liquidationDistancePct;
    return Math.min(nearest, position.liquidationDistancePct);
  }, null);

  let eventType = 'aggressive-add';
  if (netFlow24hUsd >= DEPOSIT_THRESHOLD) {
    eventType = focusPosition.side === 'long' ? 'deposit-led-long' : 'deposit-led-short';
  } else if (unrealizedPnl <= RISK_LOSS_USD) {
    eventType = 'underwater-whale';
  } else if (nearestLiq != null && nearestLiq < LIQ_DISTANCE_PCT) {
    eventType = 'liquidation-risk';
  }

  const severity =
    unrealizedPnl <= RISK_LOSS_USD || (nearestLiq != null && nearestLiq < LIQ_DISTANCE_PCT)
      ? 'high'
      : trigger.notionalUsd >= 1_000_000 || avgLeverage >= HIGH_LEVERAGE
        ? 'medium'
        : 'low';

  const alert = {
    id: episodeId(address, trigger.coin, trigger.timestamp),
    address,
    walletLabel: address,
    eventType,
    severity,
    headline: buildHeadline(eventType, netFlow24hUsd, focusPosition.coin, focusPosition.side, focusPosition.leverage),
    detail: `${focusPosition.coin} ${focusPosition.side} ${focusPosition.leverage.toFixed(1)}x · ${positions.length} open positions · U.PnL ${unrealizedPnl.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`,
    timestamp: trigger.timestamp,
    coin: focusPosition.coin,
    side: positions.some((position) => position.side !== focusPosition.side) ? 'mixed' : focusPosition.side,
    notionalUsd: focusPosition.notionalUsd,
    leverage: focusPosition.leverage,
    netFlow24hUsd,
    unrealizedPnl,
    confidenceLabel: severity === 'high' ? 'high signal' : severity === 'medium' ? 'validated' : 'watch',
    behaviorTags: Array.from(new Set([
      netFlow24hUsd >= DEPOSIT_THRESHOLD ? 'Deposit-led' : null,
      avgLeverage >= HIGH_LEVERAGE ? 'Aggressive leverage' : null,
      positions.length > 1 && positions.some((position) => position.side !== focusPosition.side) ? 'Two-sided book' : null,
      unrealizedPnl <= RISK_LOSS_USD ? 'Underwater' : null,
      Math.abs(funding30d) >= Math.abs(realizedPnl30d) * 0.1 ? 'Funding-sensitive' : null,
    ].filter(Boolean))),
  };

  const profile = {
    address,
    firstSeenAt: Math.min(...[...fills.map((fill) => fill.time), ...ledgerEvents.map((event) => event.time)].filter(Boolean)),
    lastSeenAt: now,
    accountEquity: parseNumber(perpState.marginSummary?.accountValue) + spotUsdc,
    perpsEquity: parseNumber(perpState.marginSummary?.accountValue),
    spotUsdc,
    totalOpenNotionalUsd,
    unrealizedPnl,
    realizedPnl30d,
    funding30d,
    openPositionsCount: positions.length,
    averageLeverage: avgLeverage,
    dominantAssets: positions.slice(0, 3).map((position) => position.coin),
    netFlow24hUsd,
    netFlow7dUsd: ledgerEvents.filter((event) => event.time >= now - 7 * 24 * 60 * 60 * 1000).reduce((sum, event) => sum + event.amountUsd, 0),
    netFlow30dUsd: ledgerEvents.reduce((sum, event) => sum + event.amountUsd, 0),
    behaviorTags: alert.behaviorTags,
    positions,
    trades: [],
    ledger: ledgerEvents.map((event) => ({
      id: event.id,
      time: event.time,
      type: event.type,
      direction: event.amountUsd >= 0 ? 'in' : 'out',
      amountUsd: Math.abs(event.amountUsd),
      asset: 'USDC',
      label: event.type,
    })),
    activeAlerts: [alert],
  };

  return { alert, profile };
}

async function bootstrapUniverse() {
  const [meta] = await info.metaAndAssetCtxs();
  universe = meta.universe.filter((asset) => !asset.isDelisted).map((asset) => asset.name);
  console.log(
    `[whale-indexer] loaded ${universe.length} assets · thresholds majors=${MAJOR_THRESHOLD} alts=${ALT_THRESHOLD} deposits=${DEPOSIT_THRESHOLD} lev=${HIGH_LEVERAGE}x`,
  );
}

async function handleTrade(trade) {
  const threshold = MAJORS.has(trade.coin) ? MAJOR_THRESHOLD : ALT_THRESHOLD;
  const notionalUsd = parseNumber(trade.px) * parseNumber(trade.sz);
  if (notionalUsd < threshold) return;

  const address = trade.users?.[1];
  if (!address) return;
  const enriched = await enrichWallet(address, {
    coin: trade.coin,
    timestamp: Number(trade.time || Date.now()),
    notionalUsd,
  });
  if (!enriched) return;
  await persistAlert(enriched.alert, enriched.profile);
  console.log(`[whale-indexer] ${enriched.alert.headline}`);
}

async function main() {
  await ensureTables();
  await bootstrapUniverse();

  await rpcWs.explorerTxs((txs) => {
    for (const tx of txs) {
      if (!tx?.user) continue;
      recentExplorerFlow.set(tx.user.toLowerCase(), tx.time || Date.now());
    }
  });

  await marketWs.allMids(() => {});

  for (const coin of universe) {
    try {
      await marketWs.trades({ coin }, async (trades) => {
        for (const trade of trades) {
          try {
            await handleTrade(trade);
          } catch (error) {
            console.error('[whale-indexer] failed handling trade', coin, error);
          }
        }
      });
    } catch (error) {
      console.error('[whale-indexer] subscription failed', coin, error);
    }
  }

  console.log('[whale-indexer] running');
}

main().catch((error) => {
  console.error('[whale-indexer] fatal', error);
  process.exit(1);
});
