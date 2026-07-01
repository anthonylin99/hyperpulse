#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const API_URL = process.env.HYPERLIQUID_INFO_URL || "https://api.hyperliquid.xyz/info";
const OUT_FILE = resolve(process.cwd(), "quant_research/data/high_funding_shadow_pilot.json");
const UNIVERSE = (process.env.HIGH_FUNDING_REVERSAL_ASSETS || "BTC,ETH,SOL,HYPE,AAVE,BNB,TAO,ONDO")
  .split(",")
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean);

const RULE = {
  side: "short",
  fundingZ7dMin: 1,
  fundingAprMin: 25,
  return24hMin: 0.5,
  takeProfitPct: 0.8,
  stopLossPct: 2,
  timeStopHours: 8,
  cooldownHours: 4,
  roundTripCostBps: 11.78,
};

function nowMs() {
  return Date.now();
}

function num(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function fundingZScore7d(fundingRates) {
  const clean = fundingRates.filter(Number.isFinite).slice(-24 * 7);
  if (clean.length < 48) return null;
  const current = clean[clean.length - 1];
  const prior = clean.slice(0, -1);
  const sigma = stdev(prior);
  if (sigma <= 0) return null;
  return (current - average(prior)) / sigma;
}

async function hyperliquidInfo(body) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid info request failed ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function fundingRates(asset, endTime) {
  const rows = await hyperliquidInfo({
    type: "fundingHistory",
    coin: asset,
    startTime: endTime - 8 * 24 * 60 * 60 * 1000,
    endTime,
  });
  return Array.isArray(rows)
    ? rows.map((row) => num(row?.fundingRate)).filter((value) => value != null)
    : [];
}

function readState() {
  if (!existsSync(OUT_FILE)) {
    return {
      version: 1,
      rule: RULE,
      universe: UNIVERSE,
      createdAt: nowMs(),
      updatedAt: null,
      scans: [],
      openTrades: [],
      closedTrades: [],
    };
  }
  const parsed = JSON.parse(readFileSync(OUT_FILE, "utf8"));
  return {
    version: 1,
    rule: RULE,
    universe: UNIVERSE,
    scans: [],
    openTrades: [],
    closedTrades: [],
    ...parsed,
  };
}

function writeState(state) {
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function tradeId(asset, openedAt) {
  return `hfr-${asset}-${openedAt}`;
}

function exitTrade(trade, exitPrice, reason, at) {
  const grossReturnPct = ((trade.entryPrice - exitPrice) / trade.entryPrice) * 100;
  const netReturnPct = grossReturnPct - RULE.roundTripCostBps / 100;
  return {
    ...trade,
    status: "closed",
    closedAt: at,
    exitPrice,
    exitReason: reason,
    grossReturnPct,
    netReturnPct,
  };
}

function evaluateCandidate({ asset, markPx, prevDayPx, fundingApr, fundingRates }) {
  const return24hPct =
    markPx != null && prevDayPx != null && markPx > 0 && prevDayPx > 0
      ? ((markPx - prevDayPx) / prevDayPx) * 100
      : null;
  const fundingZ7d = fundingZScore7d(fundingRates);

  let status = "eligible";
  let reason = "eligible";
  if (markPx == null || prevDayPx == null || fundingApr == null || return24hPct == null) {
    status = "market_unavailable";
    reason = "missing mark, prev-day price, or funding";
  } else if (fundingZ7d == null) {
    status = "funding_history_thin";
    reason = "not enough 7d funding samples";
  } else if (fundingZ7d <= RULE.fundingZ7dMin || fundingApr <= RULE.fundingAprMin) {
    status = "funding_not_extreme";
    reason = `funding ${fundingApr.toFixed(1)}% APR, z ${fundingZ7d.toFixed(2)}`;
  } else if (return24hPct <= RULE.return24hMin) {
    status = "price_not_extended";
    reason = `24h return ${return24hPct.toFixed(2)}%`;
  }

  return {
    asset,
    status,
    reason,
    markPx,
    prevDayPx,
    return24hPct,
    fundingApr,
    fundingZ7d,
    fundingSampleSize: fundingRates.length,
  };
}

function summarize(state) {
  const closed = state.closedTrades || [];
  const wins = closed.filter((trade) => trade.netReturnPct > 0).length;
  const net = closed.reduce((sum, trade) => sum + (trade.netReturnPct || 0), 0);
  return {
    open: state.openTrades.length,
    closed: closed.length,
    wins,
    winRatePct: closed.length ? (wins / closed.length) * 100 : null,
    totalNetReturnPct: net,
  };
}

async function main() {
  const at = nowMs();
  const state = readState();
  const [meta, ctxs] = await hyperliquidInfo({ type: "metaAndAssetCtxs" });
  const universe = Array.isArray(meta?.universe) ? meta.universe : [];
  const markByAsset = new Map();
  const candidates = [];

  for (const asset of UNIVERSE) {
    const index = universe.findIndex((item) => String(item?.name || "").toUpperCase() === asset);
    const ctx = index >= 0 ? ctxs[index] : null;
    const markPx = num(ctx?.markPx);
    const prevDayPx = num(ctx?.prevDayPx);
    const fundingRate = num(ctx?.funding);
    const fundingApr = fundingRate == null ? null : fundingRate * 8760 * 100;
    if (markPx != null) markByAsset.set(asset, markPx);
    let rates = [];
    try {
      rates = index >= 0 ? await fundingRates(asset, at) : [];
    } catch (error) {
      console.warn(`[shadow-pilot] funding unavailable ${asset}:`, error instanceof Error ? error.message : error);
    }
    candidates.push(evaluateCandidate({ asset, markPx, prevDayPx, fundingApr, fundingRates: rates }));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 125));
  }

  const stillOpen = [];
  const newlyClosed = [];
  for (const trade of state.openTrades || []) {
    const markPx = markByAsset.get(trade.asset);
    if (!markPx) {
      stillOpen.push(trade);
      continue;
    }
    if (markPx <= trade.targetPrice) {
      newlyClosed.push(exitTrade(trade, markPx, "take_profit", at));
    } else if (markPx >= trade.stopPrice) {
      newlyClosed.push(exitTrade(trade, markPx, "stop_loss", at));
    } else if (at >= trade.expiresAt) {
      newlyClosed.push(exitTrade(trade, markPx, "time_stop", at));
    } else {
      stillOpen.push({
        ...trade,
        lastMarkPx: markPx,
        lastMarkedAt: at,
        unrealizedReturnPct: ((trade.entryPrice - markPx) / trade.entryPrice) * 100 - RULE.roundTripCostBps / 100,
      });
    }
  }

  const closedByAsset = [...(state.closedTrades || []), ...newlyClosed].filter((trade) => trade.closedAt != null);
  const lastCloseByAsset = new Map();
  for (const trade of closedByAsset) {
    const previous = lastCloseByAsset.get(trade.asset) || 0;
    lastCloseByAsset.set(trade.asset, Math.max(previous, trade.closedAt || 0));
  }

  const newlyOpened = [];
  for (const candidate of candidates.filter((item) => item.status === "eligible")) {
    const alreadyOpen = stillOpen.some((trade) => trade.asset === candidate.asset);
    const lastClose = lastCloseByAsset.get(candidate.asset) || 0;
    const coolingDown = at - lastClose < RULE.cooldownHours * 60 * 60 * 1000;
    if (alreadyOpen || coolingDown || candidate.markPx == null) continue;
    const entryPrice = candidate.markPx;
    newlyOpened.push({
      id: tradeId(candidate.asset, at),
      status: "open",
      openedAt: at,
      asset: candidate.asset,
      side: RULE.side,
      entryPrice,
      targetPrice: entryPrice * (1 - RULE.takeProfitPct / 100),
      stopPrice: entryPrice * (1 + RULE.stopLossPct / 100),
      expiresAt: at + RULE.timeStopHours * 60 * 60 * 1000,
      entryContext: candidate,
      lastMarkPx: entryPrice,
      lastMarkedAt: at,
      unrealizedReturnPct: -RULE.roundTripCostBps / 100,
    });
  }

  const scan = {
    at,
    eligibleAssets: candidates.filter((candidate) => candidate.status === "eligible").map((candidate) => candidate.asset),
    openedTradeIds: newlyOpened.map((trade) => trade.id),
    closedTradeIds: newlyClosed.map((trade) => trade.id),
    candidates,
  };

  const nextState = {
    ...state,
    rule: RULE,
    universe: UNIVERSE,
    updatedAt: at,
    scans: [scan, ...(state.scans || [])].slice(0, 200),
    openTrades: [...stillOpen, ...newlyOpened],
    closedTrades: [...newlyClosed, ...(state.closedTrades || [])].slice(0, 500),
  };
  writeState(nextState);

  console.log(JSON.stringify({
    output: OUT_FILE,
    scanAt: new Date(at).toISOString(),
    eligible: scan.eligibleAssets,
    opened: newlyOpened.map((trade) => `${trade.asset}@${trade.entryPrice}`),
    closed: newlyClosed.map((trade) => `${trade.asset}:${trade.exitReason}:${trade.netReturnPct.toFixed(2)}%`),
    summary: summarize(nextState),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
