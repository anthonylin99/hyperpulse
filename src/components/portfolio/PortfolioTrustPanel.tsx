"use client";

import { ShieldCheck } from "lucide-react";
import { usePortfolio } from "@/context/PortfolioContext";
import { useWallet } from "@/context/WalletContext";
import { cn, formatUSD } from "@/lib/format";
import { formatEasternDateTime } from "@/lib/time";

function ToneValue({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        value > 0 ? "text-emerald-300" : value < 0 ? "text-rose-300" : "text-zinc-200",
      )}
    >
      {formatUSD(value)}
    </span>
  );
}

function ReconcileCell({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
      <div className="label">{label}</div>
      <div className="mt-2 text-sm font-semibold text-zinc-100">
        {typeof value === "number" ? <ToneValue value={value} /> : value}
      </div>
      <div className="mt-1 text-[11px] leading-4 text-zinc-500">{helper}</div>
    </div>
  );
}

function CoveragePill({
  label,
  value,
  healthy = true,
}: {
  label: string;
  value: string;
  healthy?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px]",
        healthy
          ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200"
          : "border-amber-500/25 bg-amber-500/[0.08] text-amber-200",
      )}
    >
      <span className="uppercase tracking-[0.14em] opacity-65">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export default function PortfolioTrustPanel() {
  const {
    analyticsCoverage,
    capitalSummary,
    stats,
    sizingSnapshots,
    lastUpdated,
  } = usePortfolio();
  const { accountState } = useWallet();

  if (!accountState && !stats && !analyticsCoverage) return null;

  const closedPnl = stats?.totalPnl ?? 0;
  const fundingNet = stats?.totalFundingNet ?? 0;
  const feesPaid = stats?.totalFeesPaid ?? 0;
  const realizedAfterCosts = closedPnl + fundingNet - feesPaid;
  const externalCapital = capitalSummary?.netExternalCapitalUsd ?? 0;
  const currentEquity = accountState?.accountValue ?? 0;
  const equityExDeposits = currentEquity - externalCapital;
  const unrealized = accountState?.unrealizedPnl ?? 0;

  const coverageNotes =
    analyticsCoverage?.notes && analyticsCoverage.notes.length > 0
      ? analyticsCoverage.notes
      : ["Coverage labels update after the wallet analytics refresh completes."];

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/85">
      <div className="flex flex-col gap-3 border-b border-zinc-800 bg-zinc-950/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <div className="label text-emerald-300/80">Source & reconciliation</div>
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Separates outside capital movement from trading results so the equity line is easier to trust.
          </div>
        </div>
        <div className="font-mono text-[11px] text-zinc-500">
          Last refreshed {lastUpdated ? formatEasternDateTime(lastUpdated, true) : "n/a"}
        </div>
      </div>

      <div className="grid gap-2 p-3 md:grid-cols-3 xl:grid-cols-6">
        <ReconcileCell
          label="External capital"
          value={capitalSummary ? externalCapital : "--"}
          helper="Deposits, withdrawals, and external transfers."
        />
        <ReconcileCell
          label="Closed P&L"
          value={stats ? closedPnl : "--"}
          helper="Realized P&L from grouped perp fills."
        />
        <ReconcileCell
          label="Funding"
          value={stats ? fundingNet : "--"}
          helper="Funding payments in the covered window."
        />
        <ReconcileCell
          label="Fees"
          value={stats ? -feesPaid : "--"}
          helper="Trading fees shown as a cost."
        />
        <ReconcileCell
          label="Realized after costs"
          value={stats ? realizedAfterCosts : "--"}
          helper="Closed P&L + funding - fees."
        />
        <ReconcileCell
          label="Equity ex-deposits"
          value={accountState && capitalSummary ? equityExDeposits : "--"}
          helper={
            accountState && capitalSummary
              ? `Raw ${formatUSD(currentEquity)} less external capital; includes unrealized ${formatUSD(unrealized)}.`
              : "Waiting for account state."
          }
        />
      </div>

      <div className="border-t border-zinc-800 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <CoveragePill
            label="Perp fills"
            value={
              analyticsCoverage
                ? `${analyticsCoverage.perpFillCount}/${analyticsCoverage.rawFillCount}`
                : "n/a"
            }
            healthy={(analyticsCoverage?.fillsAvailable ?? true) && (analyticsCoverage?.excludedFillCount ?? 0) === 0}
          />
          <CoveragePill
            label="Funding"
            value={analyticsCoverage ? `${analyticsCoverage.fundingLookbackDays}d` : "n/a"}
            healthy={analyticsCoverage?.fundingAvailable ?? true}
          />
          <CoveragePill
            label="Ledger"
            value={analyticsCoverage?.ledgerAvailable ? `${analyticsCoverage.ledgerEventCount} events` : "missing"}
            healthy={analyticsCoverage?.ledgerAvailable ?? true}
          />
          <CoveragePill
            label="Sizing"
            value={`${sizingSnapshots.length} snapshots`}
            healthy={sizingSnapshots.length > 0}
          />
        </div>
        <ul className="mt-3 space-y-1 text-[11px] leading-5 text-zinc-500">
          {coverageNotes.slice(0, 3).map((note) => (
            <li key={note}>- {note}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
