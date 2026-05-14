import type { CapitalFlowEvent, CapitalFlowSummary, EquityPoint, RoundTripTrade } from "@/types";

const SYSTEM_ADDRESSES = new Set([
  "0x2222222222222222222222222222222222222222",
]);

const EMPTY_SUMMARY: CapitalFlowSummary = {
  directDepositsUsd: 0,
  directWithdrawalsUsd: 0,
  externalTransferInUsd: 0,
  externalTransferOutUsd: 0,
  externalDepositsUsd: 0,
  externalWithdrawalsUsd: 0,
  netExternalCapitalUsd: 0,
  rewardsUsd: 0,
  internalTransfersUsd: 0,
  stakingDeposits: 0,
  stakingWithdrawals: 0,
  flowCount: 0,
  lastFlowTime: null,
  notes: [],
  events: [],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function asString(value: unknown): string {
  return String(value ?? "");
}

function normalizeAddress(value: unknown): string {
  return asString(value).toLowerCase();
}

function isSystemAddress(value: unknown): boolean {
  const address = normalizeAddress(value);
  return !address || SYSTEM_ADDRESSES.has(address) || address.startsWith("0x200000000000000000000000000000000000");
}

function ledgerDelta(row: unknown): Record<string, unknown> | null {
  const record = asRecord(row);
  return asRecord(record?.delta);
}

function ledgerTime(row: unknown): number {
  const record = asRecord(row);
  return asNumber(record?.time);
}

function pushEvent(events: CapitalFlowEvent[], event: CapitalFlowEvent) {
  if (!Number.isFinite(event.amountUsd)) return;
  events.push(event);
}

export function summarizeCapitalFlows(rawLedger: unknown, walletAddress: string): CapitalFlowSummary {
  if (!Array.isArray(rawLedger)) return EMPTY_SUMMARY;

  const wallet = walletAddress.toLowerCase();
  const events: CapitalFlowEvent[] = [];
  const notes = new Set<string>();
  let directDepositsUsd = 0;
  let directWithdrawalsUsd = 0;
  let externalTransferInUsd = 0;
  let externalTransferOutUsd = 0;
  let rewardsUsd = 0;
  let internalTransfersUsd = 0;
  let stakingDeposits = 0;
  let stakingWithdrawals = 0;

  for (const row of rawLedger) {
    const delta = ledgerDelta(row);
    if (!delta) continue;

    const time = ledgerTime(row);
    const sourceType = asString(delta.type);
    const token = asString(delta.token || "USDC").toUpperCase();
    const amountUsd = Math.abs(asNumber(delta.usdc ?? delta.usdcValue));

    if (sourceType === "deposit") {
      directDepositsUsd += amountUsd;
      pushEvent(events, {
        time,
        type: "external_deposit",
        amountUsd,
        label: "Deposit",
        sourceType,
        token: "USDC",
      });
      continue;
    }

    if (sourceType === "withdraw") {
      const fee = Math.abs(asNumber(delta.fee));
      const totalOut = amountUsd + fee;
      directWithdrawalsUsd += totalOut;
      pushEvent(events, {
        time,
        type: "external_withdrawal",
        amountUsd: -totalOut,
        label: "Withdraw",
        sourceType,
        token: "USDC",
      });
      continue;
    }

    if (sourceType === "rewardsClaim") {
      const reward = Math.abs(asNumber(delta.amount));
      rewardsUsd += reward;
      pushEvent(events, {
        time,
        type: "reward",
        amountUsd: reward,
        label: "Rewards claim",
        sourceType,
        token,
      });
      continue;
    }

    if (sourceType === "accountClassTransfer") {
      internalTransfersUsd += amountUsd;
      pushEvent(events, {
        time,
        type: "internal_transfer",
        amountUsd: 0,
        label: "Perp/spot transfer",
        sourceType,
        token: "USDC",
      });
      continue;
    }

    if (sourceType === "cStakingTransfer") {
      const tokenAmount = Math.abs(asNumber(delta.amount));
      if (Boolean(delta.isDeposit)) stakingDeposits += tokenAmount;
      else stakingWithdrawals += tokenAmount;
      notes.add("Staked HYPE movements are tracked separately because staked HYPE is excluded from displayed spot/perp equity.");
      pushEvent(events, {
        time,
        type: "staking_transfer",
        amountUsd: 0,
        label: Boolean(delta.isDeposit) ? "Stake HYPE" : "Unstake HYPE",
        sourceType,
        token,
      });
      continue;
    }

    if (sourceType === "send" || sourceType === "spotTransfer" || sourceType === "internalTransfer") {
      const user = normalizeAddress(delta.user);
      const destination = normalizeAddress(delta.destination);
      const selfTransfer = user === wallet && destination === wallet;
      const systemTransfer = isSystemAddress(user) || isSystemAddress(destination);

      if (selfTransfer || systemTransfer || sourceType === "internalTransfer") {
        internalTransfersUsd += amountUsd;
        pushEvent(events, {
          time,
          type: "internal_transfer",
          amountUsd: 0,
          label: systemTransfer ? "System/spot settlement" : "Internal transfer",
          sourceType,
          token,
        });
        continue;
      }

      if (destination === wallet) {
        externalTransferInUsd += amountUsd;
        pushEvent(events, {
          time,
          type: "external_deposit",
          amountUsd,
          label: `${token} transfer in`,
          sourceType,
          token,
        });
      } else if (user === wallet) {
        externalTransferOutUsd += amountUsd;
        pushEvent(events, {
          time,
          type: "external_withdrawal",
          amountUsd: -amountUsd,
          label: `${token} transfer out`,
          sourceType,
          token,
        });
      }
    }
  }

  const externalDepositsUsd = directDepositsUsd + externalTransferInUsd;
  const externalWithdrawalsUsd = directWithdrawalsUsd + externalTransferOutUsd;
  const netExternalCapitalUsd = externalDepositsUsd - externalWithdrawalsUsd + rewardsUsd;
  const materialEvents = events.filter(
    (event) =>
      event.type === "external_deposit" ||
      event.type === "external_withdrawal" ||
      event.type === "reward",
  );

  return {
    directDepositsUsd,
    directWithdrawalsUsd,
    externalTransferInUsd,
    externalTransferOutUsd,
    externalDepositsUsd,
    externalWithdrawalsUsd,
    netExternalCapitalUsd,
    rewardsUsd,
    internalTransfersUsd,
    stakingDeposits,
    stakingWithdrawals,
    flowCount: materialEvents.length,
    lastFlowTime: materialEvents.reduce<number | null>(
      (latest, event) => (latest == null || event.time > latest ? event.time : latest),
      null,
    ),
    notes: Array.from(notes),
    events: events.sort((a, b) => a.time - b.time),
  };
}

export function computeCapitalAdjustedEquityCurve(
  trades: RoundTripTrade[],
  capitalSummary: CapitalFlowSummary,
): EquityPoint[] {
  const tradeEvents = trades.map((trade) => ({
    time: trade.exitTime,
    amount: trade.pnl,
  }));
  const cashEvents = capitalSummary.events
    .filter((event) => event.type === "external_deposit" || event.type === "external_withdrawal" || event.type === "reward")
    .map((event) => ({ time: event.time, amount: event.amountUsd }));
  const events = [...cashEvents, ...tradeEvents]
    .filter((event) => Number.isFinite(event.time) && event.time > 0)
    .sort((a, b) => a.time - b.time);

  if (events.length === 0) return [];

  let equity = 0;
  let peak = 0;
  return events.map((event) => {
    equity += event.amount;
    peak = Math.max(peak, equity);
    const drawdown = peak > 0 ? (equity - peak) / peak : 0;
    return { time: event.time, equity, drawdown };
  });
}
