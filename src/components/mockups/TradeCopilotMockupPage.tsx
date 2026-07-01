"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  Maximize2,
  Target,
  XCircle,
} from "lucide-react";
import {
  mockTradeCopilotData,
  type MockMarketSetup,
  type MockSetupStatus,
  type MockSignalCheck,
} from "@/lib/mockTradeCopilotData";
import { cn, formatPct, formatUSD } from "@/lib/format";

const STATUS_STYLES: Record<MockSetupStatus, string> = {
  "trade-ready": "border-[#74c69d]/35 bg-[#74c69d]/10 text-[#b8f0d0]",
  "watch-only": "border-[#d8a85a]/35 bg-[#d8a85a]/10 text-[#f0cf91]",
  "no-trade": "border-[#d97a6c]/35 bg-[#d97a6c]/10 text-[#f0aaa1]",
};

const CHECK_STYLES: Record<MockSignalCheck["state"], string> = {
  pass: "border-[#74c69d]/25 bg-[#74c69d]/10 text-[#b8f0d0]",
  warn: "border-[#d8a85a]/25 bg-[#d8a85a]/10 text-[#f0cf91]",
  fail: "border-[#d97a6c]/25 bg-[#d97a6c]/10 text-[#f0aaa1]",
};

export default function TradeCopilotMockupPage() {
  const [selectedAsset, setSelectedAsset] = useState(mockTradeCopilotData.dailySetup.asset);
  const selectedSetup = useMemo(
    () =>
      mockTradeCopilotData.marketSetups.find((setup) => setup.asset === selectedAsset) ??
      mockTradeCopilotData.dailySetup,
    [selectedAsset],
  );

  return (
    <div className="min-h-screen bg-[#0a0b0c] px-4 py-5 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1280px] space-y-5">
        <header className="flex flex-col gap-3 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[#5ec8c0]/35 bg-[#5ec8c0]/10">
              <ArrowUpRight className="h-4 w-4 text-[#7fd6cf]" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-white">HyperPulse | Setups</div>
              <div className="text-xs text-[#7d808a]">Daily trade ideas with expandable detail.</div>
            </div>
          </div>
          <div className="rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 font-mono text-xs text-[#9396a0]">
            {mockTradeCopilotData.generatedAt}
          </div>
        </header>

        <main className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <SetupList selectedAsset={selectedAsset} onSelectAsset={setSelectedAsset} />
          <ExpandedSetupDetail setup={selectedSetup} />
        </main>
      </div>
    </div>
  );
}

function SetupList({
  selectedAsset,
  onSelectAsset,
}: {
  selectedAsset: string;
  onSelectAsset: (asset: string) => void;
}) {
  return (
    <section className="rounded-lg border border-white/[0.07] bg-[#111315] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5ec8c0]">Trade Setups</div>
          <h1 className="mt-2 text-lg font-semibold text-white">Today&apos;s board</h1>
        </div>
        <Target className="h-5 w-5 text-[#7fd6cf]" />
      </div>

      <div className="mt-4 space-y-3">
        {mockTradeCopilotData.marketSetups.map((setup) => (
          <button
            key={setup.asset}
            type="button"
            onClick={() => onSelectAsset(setup.asset)}
            onDoubleClick={() => onSelectAsset(setup.asset)}
            className={cn(
              "w-full rounded-lg border p-3 text-left transition",
              selectedAsset === setup.asset
                ? "border-[#5ec8c0]/45 bg-[#5ec8c0]/10"
                : "border-white/[0.07] bg-white/[0.03] hover:border-white/15",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-semibold text-white">{setup.asset}</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#74c69d]">
                    {setup.side}
                  </span>
                </div>
                <div className="mt-2 text-sm font-medium leading-5 text-zinc-200">{setup.decisionLabel}</div>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[#62656e]" />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniMetric label="Score" value={String(setup.confidence)} />
              <MiniMetric label="Trigger" value={formatPrice(setup.trigger)} />
              <MiniMetric label="TP1" value={formatPrice(setup.tp1)} />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <StatusPill status={setup.status} />
              <span className="inline-flex items-center gap-1 text-[11px] text-[#7d808a]">
                <Maximize2 className="h-3 w-3" />
                Detail
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function ExpandedSetupDetail({ setup }: { setup: MockMarketSetup }) {
  return (
    <section className="rounded-lg border border-white/[0.07] bg-[#111315] p-4 shadow-[0_22px_90px_rgba(0,0,0,0.28)] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5ec8c0]">Setup Detail</div>
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2">
            <h2 className="font-mono text-5xl font-semibold tracking-tight text-white sm:text-6xl">{setup.asset}</h2>
            <div className="pb-2 text-sm font-semibold uppercase tracking-[0.12em] text-[#74c69d]">{setup.side}</div>
            <div className="pb-2 font-mono text-sm text-[#9396a0]">{formatPrice(setup.price)}</div>
          </div>
        </div>
        <StatusPill status={setup.status} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          <p className="max-w-2xl text-xl font-medium leading-8 text-zinc-100">{setup.move}</p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9396a0]">{setup.whyNow}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric label="R:R to TP1" value={riskReward(setup)} />
            <Metric label="Distance to trigger" value={distanceToTrigger(setup)} />
            <Metric label="Funding" value={formatPct(setup.fundingApr)} />
          </div>
        </div>

        <div className="rounded-lg border border-white/[0.07] bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-[#9396a0]">Confidence</div>
            <div className="font-mono text-2xl font-semibold text-white">{setup.confidence}</div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-[#74c69d]" style={{ width: `${setup.confidence}%` }} />
          </div>
          <div className="mt-4 grid gap-2 text-xs">
            <div className="flex items-center justify-between gap-3 text-[#9396a0]">
              <span>Momentum</span>
              <span className="text-zinc-200">{setup.momentum}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[#9396a0]">
              <span>Open interest</span>
              <span className="font-mono text-zinc-200">{formatPct(setup.oiChangePct)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[#9396a0]">
              <span>Volume</span>
              <span className="font-mono text-zinc-200">{formatPct(setup.volumeChangePct)}</span>
            </div>
          </div>
        </div>
      </div>

      <LevelSpectrum setup={setup} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <LevelCard label="Trigger" value={setup.trigger} tone="teal" />
        <LevelCard label="Stop" value={setup.stop} tone="red" />
        <LevelCard label="Invalid" value={setup.invalidation} tone="amber" />
        <LevelCard label="TP1" value={setup.tp1} tone="green" />
        <LevelCard label="TP2" value={setup.tp2} tone="green" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <TradeRules setup={setup} />
        <SignalQuality setup={setup} />
      </div>
    </section>
  );
}

function TradeRules({ setup }: { setup: MockMarketSetup }) {
  return (
    <section className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5ec8c0]">Execution Plan</div>
      <div className="mt-4 space-y-3">
        <RuleRow label="Entry" value={`Accept above ${formatPrice(setup.trigger)} before considering the setup active.`} />
        <RuleRow label="Risk" value={`Stop at ${formatPrice(setup.stop)}. Hard invalidation at ${formatPrice(setup.invalidation)}.`} />
        <RuleRow label="Profit" value={`First trim at ${formatPrice(setup.tp1)}. Leave runner only if momentum expands.`} />
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/[0.07] bg-black/20 p-3 text-sm leading-6 text-[#9396a0]">
        <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-[#d97a6c]" />
        <span>
          <span className="font-medium text-zinc-200">Invalid if:</span> {setup.invalidLine}
        </span>
      </div>
    </section>
  );
}

function SignalQuality({ setup }: { setup: MockMarketSetup }) {
  return (
    <section className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5ec8c0]">Signal Checks</div>
      <div className="mt-4 space-y-3">
        {setup.signalChecks.map((check) => (
          <div key={check.label} className="rounded-lg border border-white/[0.07] bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <CheckIcon state={check.state} />
              <div className="text-sm font-medium text-zinc-100">{check.label}</div>
              <span className={cn("ml-auto rounded-full border px-2 py-0.5 text-[10px]", CHECK_STYLES[check.state])}>
                {check.state}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#9396a0]">{check.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LevelSpectrum({ setup }: { setup: MockMarketSetup }) {
  const prices = [setup.invalidation, setup.stop, setup.price, setup.trigger, setup.tp1, setup.tp2];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const markers = [
    { label: "Invalid", price: setup.invalidation, tone: "text-[#d97a6c]" },
    { label: "Stop", price: setup.stop, tone: "text-[#d97a6c]" },
    { label: "Now", price: setup.price, tone: "text-[#7fd6cf]" },
    { label: "Trigger", price: setup.trigger, tone: "text-[#7fd6cf]" },
    { label: "TP1", price: setup.tp1, tone: "text-[#74c69d]" },
    { label: "TP2", price: setup.tp2, tone: "text-[#74c69d]" },
  ];

  return (
    <div className="mt-7 rounded-lg border border-white/[0.07] bg-black/20 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-[#9396a0]">Level Map</div>
        <div className="font-mono text-xs text-[#62656e]">
          {formatPrice(min)} to {formatPrice(max)}
        </div>
      </div>
      <div className="relative h-24">
        <div className="absolute left-0 right-0 top-8 h-1 rounded-full bg-gradient-to-r from-[#d97a6c] via-[#5ec8c0] to-[#74c69d]" />
        {markers.map((marker) => {
          const left = ((marker.price - min) / Math.max(max - min, 1)) * 100;
          return (
            <div
              key={`${marker.label}-${marker.price}`}
              className="absolute top-4 -translate-x-1/2"
              style={{ left: `${left}%` }}
            >
              <div className="mx-auto h-9 w-px bg-white/35" />
              <div className={cn("mt-1 whitespace-nowrap text-center font-mono text-[10px]", marker.tone)}>
                {marker.label}
              </div>
              <div className="mt-0.5 whitespace-nowrap text-center font-mono text-[10px] text-[#62656e]">
                {formatPrice(marker.price)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 rounded-lg border border-white/[0.07] bg-black/20 p-3 sm:grid-cols-[88px_minmax(0,1fr)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#62656e]">{label}</div>
      <div className="text-sm leading-6 text-zinc-200">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/[0.07] bg-black/20 px-2 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#62656e]">{label}</div>
      <div className="mt-1 truncate font-mono text-xs font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#62656e]">{label}</div>
      <div className="mt-2 font-mono text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function LevelCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "teal" | "red" | "amber" | "green";
}) {
  const toneClass = {
    teal: "text-[#7fd6cf]",
    red: "text-[#f0aaa1]",
    amber: "text-[#f0cf91]",
    green: "text-[#b8f0d0]",
  }[tone];

  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#62656e]">{label}</div>
      <div className={cn("mt-2 font-mono text-sm font-semibold", toneClass)}>{formatPrice(value)}</div>
    </div>
  );
}

function StatusPill({ status }: { status: MockSetupStatus }) {
  const Icon = status === "trade-ready" ? CheckCircle2 : status === "watch-only" ? AlertTriangle : XCircle;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", STATUS_STYLES[status])}>
      <Icon className="h-3.5 w-3.5" />
      {statusLabel(status)}
    </span>
  );
}

function CheckIcon({ state }: { state: MockSignalCheck["state"] }) {
  const Icon = state === "pass" ? CheckCircle2 : state === "warn" ? AlertTriangle : XCircle;
  return (
    <Icon
      className={cn(
        "h-4 w-4 shrink-0",
        state === "pass" ? "text-[#74c69d]" : state === "warn" ? "text-[#d8a85a]" : "text-[#d97a6c]",
      )}
    />
  );
}

function statusLabel(status: MockSetupStatus) {
  if (status === "trade-ready") return "Trade ready";
  if (status === "watch-only") return "Watch only";
  return "No trade";
}

function riskReward(setup: MockMarketSetup) {
  const risk = Math.abs(setup.trigger - setup.stop);
  const reward = Math.abs(setup.tp1 - setup.trigger);
  return `${(reward / Math.max(risk, 0.01)).toFixed(2)}R`;
}

function distanceToTrigger(setup: MockMarketSetup) {
  const distance = ((setup.trigger - setup.price) / setup.price) * 100;
  const prefix = distance >= 0 ? "+" : "";
  return `${prefix}${distance.toFixed(2)}%`;
}

function formatPrice(value: number) {
  if (value >= 1000) return formatUSD(value, 0);
  if (value >= 100) return formatUSD(value, 2);
  return formatUSD(value, 2);
}
