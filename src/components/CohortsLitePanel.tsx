"use client";

import { useEffect, useState } from "react";
import { UsersRound } from "lucide-react";
import { cn, formatCompact } from "@/lib/format";
import type { CohortsLiteBucket } from "@/types";
import { SectionEyebrow } from "@/components/trading-ui";

type CohortsResponse = {
  cohorts: CohortsLiteBucket[];
  coverage: {
    label: string;
    walletCount: number;
    caveat: string;
  };
  updatedAt: number | null;
};

function biasClass(bias: CohortsLiteBucket["netBias"]) {
  if (bias === "long") return "text-emerald-300";
  if (bias === "short") return "text-rose-300";
  return "text-zinc-300";
}

export default function CohortsLitePanel() {
  const [data, setData] = useState<CohortsResponse | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const response = await fetch("/api/cohorts/lite", { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as CohortsResponse;
      if (mounted) setData(next);
    };
    load().catch(() => undefined);
    const interval = window.setInterval(() => load().catch(() => undefined), 180_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  if (!data) return null;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionEyebrow>Cohorts Lite</SectionEyebrow>
          <div className="mt-1 text-sm font-medium text-zinc-100">Tracked wallet map</div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {data.coverage.walletCount} wallets · {data.coverage.label}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-2 text-emerald-300">
          <UsersRound className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {data.cohorts.map((cohort) => (
          <div key={cohort.id} className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-100">{cohort.label}</div>
                <div className="mt-1 text-[11px] leading-4 text-zinc-500">{cohort.description}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm text-zinc-100">{cohort.walletCount}</div>
                <div className={cn("mt-1 text-[10px] uppercase tracking-[0.14em]", biasClass(cohort.netBias))}>
                  {cohort.netBias}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-zinc-500">
              <div>
                <div className="uppercase tracking-[0.14em] text-zinc-600">Long</div>
                <div className="mt-1 font-mono text-emerald-300">{formatCompact(cohort.netLongUsd)}</div>
              </div>
              <div>
                <div className="uppercase tracking-[0.14em] text-zinc-600">Short</div>
                <div className="mt-1 font-mono text-rose-300">{formatCompact(cohort.netShortUsd)}</div>
              </div>
              <div>
                <div className="uppercase tracking-[0.14em] text-zinc-600">Top</div>
                <div className="mt-1 font-mono text-zinc-300">{cohort.topAsset ?? "n/a"}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-[11px] leading-5 text-zinc-500">
        {data.coverage.caveat}
      </div>
    </section>
  );
}
