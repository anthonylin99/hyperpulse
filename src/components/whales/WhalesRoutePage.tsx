"use client";

import Link from "next/link";
import { AlertTriangle, Plus, Search, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn, formatCompact, truncateAddress } from "@/lib/format";
import { withNetworkParam } from "@/lib/hyperliquid";
import type { WalletLeaderboardRow, WhaleLeaderboardResult } from "@/types/whales";

const LOCAL_WALLETS_KEY = "hyperpulse.whaleWatchlist";
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return formatCompact(value);
}

function formatSignedMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatCompact(Math.abs(value))}`;
}

function formatLev(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(2)}x`;
}

function formatAge(days: number | null) {
  if (days == null) return "n/a";
  return `${days}d`;
}

function pnlTone(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-zinc-400";
  return value > 0 ? "text-emerald-300" : "text-rose-300";
}

function biasTone(row: WalletLeaderboardRow) {
  if (row.directionalBias.includes("bearish")) return "border-rose-400/30 bg-rose-500/10 text-rose-200";
  if (row.directionalBias.includes("bullish")) return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  return "border-zinc-700 bg-zinc-900/70 text-zinc-300";
}

export default function WhalesRoutePage({ initialAddress }: { initialAddress?: string }) {
  const initialWallet = initialAddress?.trim().toLowerCase();
  const [data, setData] = useState<WhaleLeaderboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [localWallets, setLocalWallets] = useState<string[]>(
    initialWallet && ADDRESS_REGEX.test(initialWallet) ? [initialWallet] : [],
  );
  const [selected, setSelected] = useState<WalletLeaderboardRow | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LOCAL_WALLETS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const stored = Array.isArray(parsed)
        ? parsed.filter((value) => typeof value === "string" && ADDRESS_REGEX.test(value))
        : [];
      setLocalWallets(
        initialWallet && ADDRESS_REGEX.test(initialWallet)
          ? [initialWallet, ...stored.filter((address) => address !== initialWallet)]
          : stored,
      );
    } catch {
      setLocalWallets(initialWallet && ADDRESS_REGEX.test(initialWallet) ? [initialWallet] : []);
    }
  }, [initialWallet]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setError(null);
        const params = localWallets.length > 0 ? `/api/whales/leaderboard?addresses=${localWallets.join(",")}` : "/api/whales/leaderboard";
        const response = await fetch(withNetworkParam(params));
        if (!response.ok) throw new Error(`Whales request failed (${response.status})`);
        const next = (await response.json()) as WhaleLeaderboardResult;
        if (!cancelled) {
          setData(next);
          setSelected((current) => current ?? next.wallets[0] ?? null);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Failed to load whales");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [localWallets]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data?.wallets ?? [];
    return (data?.wallets ?? []).filter((row) => {
      const positions = row.topPositions.map((position) => position.coin).join(" ");
      return `${row.walletAddress} ${row.directionalLabel} ${positions}`.toLowerCase().includes(needle);
    });
  }, [data, query]);

  const summary = useMemo(() => {
    const rows = data?.wallets ?? [];
    return {
      accountValue: rows.reduce((sum, row) => sum + row.accountValueUsd, 0),
      notional: rows.reduce((sum, row) => sum + row.notionalExposureUsd, 0),
      pnlDay: rows.reduce((sum, row) => sum + (row.pnl.day.pnlUsd ?? 0), 0),
    };
  }, [data]);

  function addWallet() {
    const normalized = addressInput.trim().toLowerCase();
    if (!ADDRESS_REGEX.test(normalized)) {
      setError("Enter a valid 0x wallet address.");
      return;
    }
    const next = [normalized, ...localWallets.filter((address) => address !== normalized)].slice(0, 12);
    window.localStorage.setItem(LOCAL_WALLETS_KEY, JSON.stringify(next));
    setLocalWallets(next);
    setAddressInput("");
  }

  return (
    <div className="mx-auto max-w-[1540px] px-4 py-5 pb-20">
      <header className="relative overflow-hidden rounded-[28px] border border-teal-400/10 bg-[radial-gradient(circle_at_80%_15%,rgba(20,184,166,0.14),transparent_30%),linear-gradient(135deg,#071819,#090b10_58%)] p-5 md:p-7">
        <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/20 bg-teal-400/10 px-3 py-1 text-xs text-teal-100">
              <WalletCards className="h-3.5 w-3.5" />
              Tracked wallet sample
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">Whales</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Public Hyperliquid wallet leaderboard for known addresses. It ranks the wallets HyperPulse can see, not every exchange account.
            </p>
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-3 xl:min-w-[560px]">
            <SummaryTile label="Account value" value={data ? formatMoney(summary.accountValue) : "--"} />
            <SummaryTile label="Open notional" value={data ? formatMoney(summary.notional) : "--"} />
            <SummaryTile label="Day PnL" value={data ? formatSignedMoney(summary.pnlDay) : "--"} tone={summary.pnlDay >= 0 ? "green" : "red"} />
          </div>
        </div>
      </header>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0b0d10]">
          <div className="flex flex-col gap-3 border-b border-zinc-800 bg-zinc-950/70 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 flex-1 lg:max-w-[460px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search wallet, bias, or asset..."
                className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950/80 pl-9 pr-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-teal-500/40"
              />
            </div>
            <div className="flex min-w-0 gap-2">
              <input
                value={addressInput}
                onChange={(event) => setAddressInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addWallet();
                }}
                placeholder="Add 0x wallet..."
                className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 font-mono text-xs text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-teal-500/40 lg:w-[270px]"
              />
              <button
                type="button"
                onClick={addWallet}
                title="Add wallet"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-teal-400/20 bg-teal-400/10 text-teal-100 transition hover:border-teal-300/40 hover:bg-teal-400/15"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {data?.universe.caveats.length ? (
            <div className="border-b border-amber-500/15 bg-amber-500/5 px-4 py-2 text-xs leading-5 text-amber-100/80">
              Tracked-wallet sample. Directional bias shows current exposure, not a copy-trade.
            </div>
          ) : null}

          {error ? (
            <div className="m-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : data === null ? (
            <WhalesSkeleton />
          ) : data.wallets.length === 0 ? (
            <EmptyWhalesNotice />
          ) : (
            <WhalesTable rows={filtered} selected={selected} onSelect={setSelected} />
          )}
        </div>

        <WhaleDetail row={selected} />
      </section>
    </div>
  );
}

function SummaryTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "green" | "red" }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className={cn("mt-1 font-mono text-xl", tone === "green" ? "text-emerald-300" : tone === "red" ? "text-rose-300" : "text-zinc-50")}>{value}</div>
    </div>
  );
}

function WhalesTable({
  rows,
  selected,
  onSelect,
}: {
  rows: WalletLeaderboardRow[];
  selected: WalletLeaderboardRow | null;
  onSelect: (row: WalletLeaderboardRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1040px] w-full text-left text-sm">
        <thead className="border-b border-zinc-800 bg-zinc-950/60 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          <tr>
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">Wallet</th>
            <th className="px-4 py-3 text-right">Age</th>
            <th className="px-4 py-3 text-right">Value</th>
            <th className="px-4 py-3 text-right">Notional</th>
            <th className="px-4 py-3 text-right">Lev</th>
            <th className="px-4 py-3">Bias</th>
            <th className="px-4 py-3 text-right">Day</th>
            <th className="px-4 py-3 text-right">Week</th>
            <th className="px-4 py-3 text-right">Month</th>
            <th className="px-4 py-3 text-right">All-time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-900">
          {rows.map((row) => (
            <tr
              key={row.walletAddress}
              onClick={() => onSelect(row)}
              className={cn(
                "cursor-pointer transition hover:bg-zinc-900/70",
                selected?.walletAddress === row.walletAddress && "bg-teal-400/[0.06]",
              )}
            >
              <td className="px-4 py-3">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs text-zinc-300">
                  {row.rank}
                </span>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/whales/${row.walletAddress}`}
                  className="font-mono text-zinc-100 underline decoration-zinc-700 underline-offset-4 hover:text-teal-200"
                  onClick={(event) => event.stopPropagation()}
                >
                  {truncateAddress(row.walletAddress)}
                </Link>
                <div className="mt-1 text-[11px] text-zinc-600">{row.source}</div>
              </td>
              <td className="px-4 py-3 text-right font-mono text-zinc-400">{formatAge(row.ageDays)}</td>
              <td className="px-4 py-3 text-right font-mono text-zinc-100">{formatMoney(row.accountValueUsd)}</td>
              <td className="px-4 py-3 text-right font-mono text-zinc-100">{formatMoney(row.notionalExposureUsd)}</td>
              <td className="px-4 py-3 text-right font-mono text-emerald-300">{formatLev(row.effectiveLeverage)}</td>
              <td className="px-4 py-3">
                <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs", biasTone(row))}>
                  {row.directionalLabel}
                </span>
              </td>
              <PnlCell value={row.pnl.day.pnlUsd} />
              <PnlCell value={row.pnl.week.pnlUsd} />
              <PnlCell value={row.pnl.month.pnlUsd} />
              <PnlCell value={row.pnl.allTime.pnlUsd} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PnlCell({ value }: { value: number | null }) {
  return (
    <td className={cn("px-4 py-3 text-right font-mono", pnlTone(value))}>
      {formatSignedMoney(value)}
    </td>
  );
}

function WhaleDetail({ row }: { row: WalletLeaderboardRow | null }) {
  if (!row) {
    return (
      <aside className="rounded-2xl border border-zinc-800 bg-[#0b0d10] p-5 text-sm text-zinc-500">
        Select a wallet to inspect current exposure.
      </aside>
    );
  }

  return (
    <aside className="rounded-2xl border border-zinc-800 bg-[#0b0d10] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">Wallet detail</div>
          <div className="mt-1 truncate font-mono text-sm text-zinc-100">{row.walletAddress}</div>
        </div>
        <span className={cn("rounded-full border px-2.5 py-1 text-xs", biasTone(row))}>{row.directionalLabel}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <MiniMetric label="Equity" value={formatMoney(row.accountValueUsd)} />
        <MiniMetric label="Notional" value={formatMoney(row.notionalExposureUsd)} />
        <MiniMetric label="Long" value={formatMoney(row.longNotionalUsd)} tone="green" />
        <MiniMetric label="Short" value={formatMoney(row.shortNotionalUsd)} tone="red" />
        <MiniMetric label="Unrealized" value={formatSignedMoney(row.unrealizedPnlUsd)} tone={row.unrealizedPnlUsd >= 0 ? "green" : "red"} />
        <MiniMetric label="Leverage" value={formatLev(row.effectiveLeverage)} />
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs font-medium text-zinc-300">Top positions</div>
        <div className="space-y-2">
          {row.topPositions.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-3 text-xs text-zinc-500">
              No open perp positions.
            </div>
          ) : (
            row.topPositions.map((position) => (
              <div key={`${position.coin}-${position.side}`} className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-mono text-sm text-zinc-100">{position.coin}</div>
                  <div className={position.side === "long" ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{position.side}</div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <MiniMetric label="Ntl" value={formatMoney(position.notionalUsd)} compact />
                  <MiniMetric label="PnL" value={formatSignedMoney(position.unrealizedPnlUsd)} tone={position.unrealizedPnlUsd >= 0 ? "green" : "red"} compact />
                  <MiniMetric label="Liq" value={position.liquidationPx == null ? "n/a" : position.liquidationPx.toLocaleString("en-US", { maximumFractionDigits: 2 })} compact />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100/75">
        <AlertTriangle className="mb-2 h-4 w-4 text-amber-200" />
        Directional bias is current exposure, not a trade recommendation. This is paper/research context only.
      </div>
    </aside>
  );
}

function MiniMetric({
  label,
  value,
  tone = "neutral",
  compact = false,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "red";
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "rounded-lg border border-zinc-800 bg-zinc-950/55 px-2.5 py-2"}>
      <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</div>
      <div className={cn("mt-1 truncate font-mono", compact ? "text-[11px]" : "text-xs", tone === "green" ? "text-emerald-300" : tone === "red" ? "text-rose-300" : "text-zinc-100")}>{value}</div>
    </div>
  );
}

function WhalesSkeleton() {
  return (
    <div className="space-y-px p-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="skeleton h-14 rounded-md" />
      ))}
    </div>
  );
}

function EmptyWhalesNotice() {
  return (
    <div className="m-4 rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-8 text-sm text-zinc-400">
      <div className="font-medium text-zinc-100">No tracked wallets yet.</div>
      <div className="mt-2 max-w-2xl leading-6">
        Paste a Hyperliquid wallet above, or configure <span className="font-mono text-zinc-300">HYPERPULSE_TRACKED_WALLETS</span> with comma-separated addresses.
      </div>
    </div>
  );
}
