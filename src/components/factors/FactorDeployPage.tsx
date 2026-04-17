"use client";

import { useMemo, useState } from "react";
import { useAppConfig } from "@/context/AppConfigContext";
import { useFactors } from "@/context/FactorContext";
import { useWallet } from "@/context/WalletContext";
import { cn, formatPct } from "@/lib/format";
import type { FactorPerformanceWindow, LiveFactorState } from "@/types";
import FactorDeploymentHistory from "@/components/factors/FactorDeploymentHistory";
import FactorTradeDrawer from "@/components/factors/FactorTradeDrawer";
import WalletModal from "@/components/WalletModal";

function spreadTone(value: number | null) {
  if (value == null) return "text-zinc-500";
  return value >= 0 ? "text-emerald-400" : "text-red-400";
}

export default function FactorDeployPage() {
  const { tradingEnabled, configReady } = useAppConfig();
  const { factors, loading, error } = useFactors();
  const { address, isConnected, isReadOnly } = useWallet();
  const [tradeFactor, setTradeFactor] = useState<LiveFactorState | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const tradingModeValue = !configReady
    ? "Checking runtime config…"
    : !tradingEnabled
      ? "Disabled in runtime config"
      : !isConnected
        ? "Connect wallet"
        : isReadOnly
          ? "Read-only only"
          : "Ready";
  const tradingModeTone: "neutral" | "good" | "warn" = !configReady
    ? "neutral"
    : !tradingEnabled || isReadOnly
      ? "warn"
      : isConnected
        ? "good"
        : "neutral";
  const needsConnect = configReady && tradingEnabled && !isConnected;
  const deployDisabled =
    !configReady || !tradingEnabled || isReadOnly || (!needsConnect && !isConnected);
  const handleDeployClick = (factor: LiveFactorState) => {
    if (needsConnect) {
      setWalletModalOpen(true);
      return;
    }
    setTradeFactor(factor);
  };
  const deployLabel = !configReady
    ? "Loading…"
    : !tradingEnabled
      ? "Trading Off"
      : !isConnected
        ? "Connect Wallet"
        : isReadOnly
          ? "Read-Only"
          : "Deploy";

  const sorted = useMemo(
    () =>
      [...factors].sort(
        (a, b) =>
          (b.windows.find((window) => window.days === 7)?.spreadReturn ?? -Infinity) -
          (a.windows.find((window) => window.days === 7)?.spreadReturn ?? -Infinity),
      ),
    [factors],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 pb-20">
      <section className="rounded-3xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.14),transparent_30%),linear-gradient(180deg,rgba(18,24,27,0.96),rgba(10,10,10,0.98))] p-6 md:p-8">
        <div className="max-w-4xl">
          <div className="text-[11px] uppercase tracking-[0.2em] text-teal-400/80">Deploy</div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-50 md:text-5xl">
            Turn factor baskets into live Hyperliquid trades.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 md:text-base">
            Start from the canonical Artemis factor basket, then edit every leg, set long and short gross independently, save custom presets, and deploy the delta into your current Hyperliquid account.
          </p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <InfoPill
            label="Trading Mode"
            value={tradingModeValue}
            tone={tradingModeTone}
          />
          <InfoPill label="Workflow" value="Review then deploy" />
          <InfoPill label="Guardrails" value="Margin checks, typed confirm, skipped tiny legs" />
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <FactorDeploymentHistory
        address={address}
        refreshKey={historyRefreshKey}
      />

      {loading && factors.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-64 rounded-2xl border border-zinc-800 skeleton" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sorted.map((factor) => {
            const windows = Object.fromEntries(
              factor.windows.map((window: FactorPerformanceWindow) => [window.days, window]),
            ) as Record<number, FactorPerformanceWindow>;

            return (
              <article key={factor.snapshot.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-zinc-100">{factor.snapshot.name}</h2>
                      <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
                        {factor.snapshot.shortLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{factor.snapshot.description}</p>
                  </div>
                  <button
                    onClick={() => handleDeployClick(factor)}
                    disabled={deployDisabled}
                    className="shrink-0 cursor-pointer rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-sm font-medium text-teal-200 transition-colors hover:bg-teal-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deployLabel}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <StatBlock label="1d Spread" value={windows[1]?.spreadReturn ?? null} />
                  <StatBlock label="7d Spread" value={windows[7]?.spreadReturn ?? null} />
                  <StatBlock label="30d Spread" value={windows[30]?.spreadReturn ?? null} />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Coverage</div>
                    <div className="mt-2 text-sm text-zinc-300">
                      Basket {(factor.basketCoverage * 100).toFixed(0)}% · Hyperliquid {(factor.hyperliquidCoverage * 100).toFixed(0)}%
                    </div>
                    <div className="mt-3 text-xs text-zinc-500">{factor.snapshot.coverageNote}</div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Tradable Names</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {factor.tradeCandidates.length > 0 ? (
                        factor.tradeCandidates.map((candidate) => (
                          <span
                            key={`${factor.snapshot.id}-${candidate.symbol}`}
                            className={cn(
                              "rounded-full px-2 py-1 text-xs",
                              candidate.role === "long"
                                ? "bg-emerald-500/10 text-emerald-300"
                                : "bg-red-500/10 text-red-300",
                            )}
                          >
                            {candidate.symbol}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-zinc-500">No mapped names yet.</span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tradeFactor && (
        <FactorTradeDrawer
          factor={tradeFactor}
          onClose={() => setTradeFactor(null)}
          onDeploymentRecorded={() => setHistoryRefreshKey((current) => current + 1)}
        />
      )}
      {walletModalOpen && (
        <WalletModal onClose={() => setWalletModalOpen(false)} />
      )}
    </div>
  );
}

function InfoPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/75 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div
        className={cn(
          "mt-2 text-sm font-medium",
          tone === "good"
            ? "text-emerald-300"
            : tone === "warn"
              ? "text-amber-300"
              : "text-zinc-100",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className={cn("mt-2 text-sm font-semibold", spreadTone(value))}>
        {value == null ? "n/a" : formatPct(value)}
      </div>
    </div>
  );
}
