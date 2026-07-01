"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpenCheck, ExternalLink, FlaskConical, RefreshCw } from "lucide-react";
import { SectionEyebrow } from "@/components/trading-ui";
import { cn, formatCompactUsd, formatFundingAPR, formatPct } from "@/lib/format";
import { formatEasternTime } from "@/lib/time";

type LabSetup = {
  coin: string;
  side: "long" | "short" | "watch";
  title: string;
  status: "watch" | "no-trade";
  markPx: number;
  fundingApr: number;
  priceChange24h: number;
  openInterestUsd: number;
  trigger: number | null;
  invalidation: number | null;
  target: number | null;
  score: number;
  decisionLabel: string;
  sentimentAlignment: "confirms" | "contradicts" | "mixed" | "none";
  socialContext: {
    label: string;
    note: string;
    caveat: string;
  };
  topTakes: Array<{
    id: string;
    title: string;
    analystHandle: string;
    sourceUrl: string;
    stance: "bullish" | "bearish" | "neutral";
  }>;
};

type SignalLabPayload = {
  lab: {
    id: string;
    generatedAt: number;
    expiresAt: number;
    status: "waiting" | "triggered" | "invalidated" | "target_hit" | "expired";
    statusLabel: string;
    statusNote: string;
    setup: LabSetup;
  };
  caveat: string;
};

const STORAGE_PREFIX = "hyperpulse.signalLab.daily.";

function storageKey(time: number) {
  return `${STORAGE_PREFIX}${new Date(time).toISOString().slice(0, 10)}`;
}

function formatPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (value >= 10) return `$${value.toFixed(2)}`;
  if (value >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toPrecision(4)}`;
}

function statusClasses(status: SignalLabPayload["lab"]["status"]) {
  if (status === "target_hit") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  if (status === "triggered") return "border-sky-500/25 bg-sky-500/10 text-sky-200";
  if (status === "invalidated") return "border-rose-500/25 bg-rose-500/10 text-rose-200";
  if (status === "expired") return "border-zinc-700 bg-zinc-950/70 text-zinc-400";
  return "border-amber-500/25 bg-amber-500/10 text-amber-100";
}

function alignmentClasses(alignment: LabSetup["sentimentAlignment"]) {
  if (alignment === "confirms") return "text-emerald-300";
  if (alignment === "contradicts") return "text-amber-300";
  if (alignment === "mixed") return "text-sky-300";
  return "text-zinc-500";
}

function evaluateFrozenStatus(args: {
  lab: SignalLabPayload["lab"];
  liveMark: number | null;
  now: number;
}): Pick<SignalLabPayload["lab"], "status" | "statusLabel" | "statusNote"> {
  const { lab, liveMark, now } = args;
  const setup = lab.setup;
  if (setup.status === "no-trade" || setup.side === "watch") {
    return {
      status: "waiting",
      statusLabel: "No trade",
      statusNote: "The lab is standing down until a cleaner setup appears.",
    };
  }
  if (liveMark == null || setup.trigger == null || setup.invalidation == null || setup.target == null) {
    return {
      status: "waiting",
      statusLabel: "Waiting",
      statusNote: "Live mark or levels are unavailable.",
    };
  }
  if (now > lab.expiresAt) {
    return {
      status: "expired",
      statusLabel: "Expired",
      statusNote: "The watch window elapsed before a decisive outcome.",
    };
  }
  if (setup.side === "short") {
    if (liveMark >= setup.invalidation) {
      return {
        status: "invalidated",
        statusLabel: "Invalidated",
        statusNote: "Price reclaimed invalidation. No averaging.",
      };
    }
    if (liveMark <= setup.target) {
      return {
        status: "target_hit",
        statusLabel: "Target hit",
        statusNote: "Price reached the paper target.",
      };
    }
    if (liveMark <= setup.trigger) {
      return {
        status: "triggered",
        statusLabel: "Triggered",
        statusNote: "Price broke the frozen trigger. Track target vs invalidation.",
      };
    }
  }
  if (setup.side === "long") {
    if (liveMark <= setup.invalidation) {
      return {
        status: "invalidated",
        statusLabel: "Invalidated",
        statusNote: "Price lost invalidation. No averaging.",
      };
    }
    if (liveMark >= setup.target) {
      return {
        status: "target_hit",
        statusLabel: "Target hit",
        statusNote: "Price reached the paper target.",
      };
    }
    if (liveMark >= setup.trigger) {
      return {
        status: "triggered",
        statusLabel: "Triggered",
        statusNote: "Price reclaimed the frozen trigger. Track target vs invalidation.",
      };
    }
  }
  return {
    status: "waiting",
    statusLabel: "Waiting",
    statusNote: "Funding is notable, but price has not confirmed the frozen setup.",
  };
}

export default function SignalLabPanel() {
  const [live, setLive] = useState<SignalLabPayload | null>(null);
  const [frozen, setFrozen] = useState<SignalLabPayload["lab"] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const response = await fetch("/api/signal-lab/daily");
      if (!response.ok) return;
      const payload = (await response.json()) as SignalLabPayload;
      setLive(payload);
      const key = storageKey(payload.lab.generatedAt);
      const stored = window.localStorage.getItem(key);
      if (stored) {
        setFrozen(JSON.parse(stored) as SignalLabPayload["lab"]);
      } else {
        window.localStorage.setItem(key, JSON.stringify(payload.lab));
        setFrozen(payload.lab);
      }
    } catch {
      /* keep last visible lab state */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const lab = frozen ?? live?.lab ?? null;
  const setup = lab?.setup ?? null;
  const liveSetup = live?.lab.setup ?? null;
  const currentMark = liveSetup && setup && liveSetup.coin === setup.coin ? liveSetup.markPx : setup?.markPx ?? null;
  const status = useMemo(() => {
    if (!lab || !setup) return lab;
    const liveMark = liveSetup && liveSetup.coin === setup.coin ? liveSetup.markPx : setup.markPx;
    const evaluated = evaluateFrozenStatus({
      lab,
      liveMark,
      now: Date.now(),
    });
    return {
      ...lab,
      ...evaluated,
      setup: {
        ...lab.setup,
        markPx: liveMark,
      },
    };
  }, [lab, liveSetup, setup]);

  if (!setup || !status) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-[#0b1016] p-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Building Signal Lab.
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0b1016]">
      <div className="border-b border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.12),transparent_34%),#0b1016] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <SectionEyebrow className="text-teal-300">Signal Lab</SectionEyebrow>
              <FlaskConical className="h-4 w-4 text-teal-300" />
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-50">
              Frozen daily setup.
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">
              One setup is frozen per day in this browser, then tracked against trigger, invalidation, target, and curated social context.
            </p>
          </div>
          <span className={cn("w-fit rounded-full border px-3 py-1.5 text-xs font-medium", statusClasses(status.status))}>
            {status.statusLabel}
          </span>
        </div>
      </div>

      <div className="grid gap-px bg-zinc-800 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4 bg-[#0b1016] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-3xl font-semibold text-zinc-50">{setup.coin}</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]", setup.side === "short" ? "border-rose-500/25 bg-rose-500/10 text-rose-200" : setup.side === "long" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-zinc-700 text-zinc-400")}>
              {setup.side === "watch" ? "watch" : `${setup.side} watch`}
            </span>
            <span className="font-mono text-xs text-zinc-600">
              Frozen {formatEasternTime(status.generatedAt, true)}
            </span>
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-200">{setup.title}</div>
            <div className="mt-1 text-sm leading-6 text-zinc-500">{status.statusNote}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <Metric label="Current" value={formatPrice(currentMark)} />
            <Metric label="Funding" value={formatFundingAPR(setup.fundingApr)} tone={Math.abs(setup.fundingApr) >= 20 ? "hot" : "neutral"} />
            <Metric label="24h" value={formatPct(setup.priceChange24h)} tone={setup.priceChange24h >= 0 ? "green" : "red"} />
            <Metric label="OI" value={formatCompactUsd(setup.openInterestUsd)} />
            <Metric label="Trigger" value={formatPrice(setup.trigger)} tone="green" />
            <Metric label="Invalid" value={formatPrice(setup.invalidation)} tone="red" />
            <Metric label="Target" value={formatPrice(setup.target)} />
            <Metric label="Score" value={setup.score.toFixed(1)} />
          </div>
        </div>

        <aside className="space-y-3 bg-[#090d12] p-4">
          <div>
            <SectionEyebrow>Social confirmation</SectionEyebrow>
            <div className={cn("mt-2 text-sm font-medium", alignmentClasses(setup.sentimentAlignment))}>
              {setup.socialContext.label}
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{setup.socialContext.note}</p>
          </div>
          {setup.topTakes.length > 0 ? (
            <div className="space-y-2">
              {setup.topTakes.slice(0, 3).map((take) => (
                <a
                  key={take.id}
                  href={take.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-zinc-800 bg-zinc-950/55 p-3 transition hover:border-teal-300/25"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-200">{take.title}</div>
                      <div className="mt-1 text-xs text-zinc-600">{take.analystHandle} - {take.stance}</div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 p-3 text-xs leading-5 text-zinc-500">
              No curated takes loaded for this asset yet.
            </div>
          )}
          {setup.side === "long" || setup.side === "short" ? (
            <Link
              href={`/portfolio?section=shadow&paper=${encodeURIComponent(`${setup.coin}-${setup.side.toUpperCase()}`)}`}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-teal-300/25 bg-teal-300/10 px-3 text-sm font-medium text-teal-100 transition hover:border-teal-200/45"
            >
              Paper trade
              <BookOpenCheck className="h-4 w-4" />
            </Link>
          ) : null}
          <p className="text-[11px] leading-5 text-zinc-600">
            {setup.socialContext.caveat}
          </p>
        </aside>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "red" | "hot";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-300"
      : tone === "red"
        ? "text-rose-300"
        : tone === "hot"
          ? "text-amber-300"
          : "text-zinc-100";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/55 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</div>
      <div className={cn("mt-1 font-mono text-sm", toneClass)}>{value}</div>
    </div>
  );
}
