"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import toast from "react-hot-toast";
import { BookOpenCheck, X } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import { cn, formatChartPrice, formatUSD } from "@/lib/format";
import {
  calculateShadowTradeStats,
  closeShadowTrade,
  createShadowTrade,
  loadShadowTrades,
  saveShadowTrades,
  updateObservedPrice,
  type ShadowTrade,
  type ShadowTradeDraft,
  type ShadowTradeSide,
  type ShadowTradeSource,
} from "@/lib/shadowBook";

type TicketState = ShadowTradeDraft | null;

type ShadowBookContextValue = {
  trades: ShadowTrade[];
  openTicket: (draft: ShadowTradeDraft) => void;
  addTrade: (draft: ShadowTradeDraft) => ShadowTrade;
  closeTrade: (id: string, exitPrice: number) => void;
  deleteTrade: (id: string) => void;
  clearTrades: () => void;
  markForAsset: (asset: string) => number | null;
};

const ShadowBookContext = createContext<ShadowBookContextValue | null>(null);

export function ShadowBookProvider({ children }: { children: ReactNode }) {
  const { assets } = useMarket();
  const [trades, setTrades] = useState<ShadowTrade[]>([]);
  const [ticket, setTicket] = useState<TicketState>(null);

  const markMap = useMemo(() => {
    const next = new Map<string, number>();
    for (const asset of assets) {
      const mark = Number(asset.midPx || asset.markPx);
      if (Number.isFinite(mark) && mark > 0) next.set(asset.coin, mark);
    }
    return next;
  }, [assets]);

  useEffect(() => {
    setTrades(loadShadowTrades());
  }, []);

  useEffect(() => {
    if (trades.length === 0) return;
    saveShadowTrades(trades);
  }, [trades]);

  useEffect(() => {
    setTrades((prev) => {
      let changed = false;
      const next = prev.map((trade) => {
        const mark = markMap.get(trade.asset);
        if (!mark) return trade;
        const updated = updateObservedPrice(trade, mark);
        if (updated !== trade) changed = true;
        return updated;
      });
      return changed ? next : prev;
    });
  }, [markMap]);

  const markForAsset = useCallback((asset: string) => markMap.get(asset.toUpperCase()) ?? null, [markMap]);

  const addTrade = useCallback((draft: ShadowTradeDraft) => {
    const trade = createShadowTrade(draft);
    setTrades((prev) => {
      const next = [trade, ...prev].slice(0, 75);
      saveShadowTrades(next);
      return next;
    });
    toast.success(`${trade.asset} paper ${trade.side} tracked`);
    return trade;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const paper = url.searchParams.get("paper");
    if (!paper) return;

    const normalized = paper.trim().toUpperCase();
    const match = normalized.match(/^([A-Z0-9]+)[-_:](LONG|SHORT)(?:[-_:](\d+(?:\.\d+)?)X?)?$/);
    if (!match) return;

    const asset = match[1];
    const side = match[2].toLowerCase() as ShadowTradeSide;
    const leverage = Math.max(1, Number(match[3] ?? 3));
    const marginUsd = Math.max(1, Number(url.searchParams.get("margin") ?? 100));
    const entryPrice = Number(url.searchParams.get("entry") ?? markMap.get(asset));

    if (!Number.isFinite(entryPrice) || entryPrice <= 0) return;

    setTrades((prev) => {
      const alreadyOpen = prev.some(
        (trade) =>
          trade.asset === asset &&
          trade.side === side &&
          trade.status === "open" &&
          Number(trade.leverage) === leverage,
      );
      if (alreadyOpen) return prev;
      const trade = createShadowTrade({
        asset,
        side,
        entryPrice,
        marginUsd,
        leverage,
        source: "manual",
      });
      const next = [trade, ...prev].slice(0, 75);
      saveShadowTrades(next);
      toast.success(`${asset} paper ${side} tracked`);
      return next;
    });

    const nextParams = url.searchParams;
    nextParams.delete("paper");
    nextParams.delete("margin");
    nextParams.delete("entry");
    nextParams.set("section", "shadow");
    const nextQuery = nextParams.toString();
    window.location.replace(`${url.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
  }, [markMap]);

  const openTicket = useCallback((draft: ShadowTradeDraft) => {
    setTicket({
      ...draft,
      asset: draft.asset.toUpperCase(),
      marginUsd: draft.marginUsd ?? 100,
      leverage: draft.leverage ?? 3,
      source: draft.source ?? "manual",
    });
  }, []);

  const closeTrade = useCallback((id: string, exitPrice: number) => {
    setTrades((prev) => {
      const next = prev.map((trade) => trade.id === id ? closeShadowTrade(trade, exitPrice) : trade);
      saveShadowTrades(next);
      return next;
    });
  }, []);

  const deleteTrade = useCallback((id: string) => {
    setTrades((prev) => {
      const next = prev.filter((trade) => trade.id !== id);
      saveShadowTrades(next);
      return next;
    });
  }, []);

  const clearTrades = useCallback(() => {
    setTrades([]);
    saveShadowTrades([]);
  }, []);

  const value = useMemo<ShadowBookContextValue>(
    () => ({ trades, openTicket, addTrade, closeTrade, deleteTrade, clearTrades, markForAsset }),
    [trades, openTicket, addTrade, closeTrade, deleteTrade, clearTrades, markForAsset],
  );

  return (
    <ShadowBookContext.Provider value={value}>
      {children}
      {ticket ? (
        <ShadowTradeTicket
          ticket={ticket}
          onClose={() => setTicket(null)}
          onSubmit={(draft) => {
            addTrade(draft);
            setTicket(null);
          }}
        />
      ) : null}
    </ShadowBookContext.Provider>
  );
}

export function useShadowBook() {
  const ctx = useContext(ShadowBookContext);
  if (!ctx) throw new Error("useShadowBook must be used within ShadowBookProvider");
  return ctx;
}

function ShadowTradeTicket({
  ticket,
  onClose,
  onSubmit,
}: {
  ticket: ShadowTradeDraft;
  onClose: () => void;
  onSubmit: (draft: ShadowTradeDraft) => void;
}) {
  const [side, setSide] = useState<ShadowTradeSide>(ticket.side);
  const [marginUsd, setMarginUsd] = useState(String(ticket.marginUsd ?? 100));
  const [leverage, setLeverage] = useState(String(ticket.leverage ?? 3));
  const [stopPrice, setStopPrice] = useState(ticket.stopPrice == null ? "" : String(ticket.stopPrice));
  const [targetPrice, setTargetPrice] = useState(ticket.targetPrice == null ? "" : String(ticket.targetPrice));
  const margin = Math.max(0, Number(marginUsd) || 0);
  const lev = Math.max(1, Number(leverage) || 1);
  const notional = margin * lev;

  const submit = () => {
    onSubmit({
      ...ticket,
      side,
      marginUsd: margin,
      leverage: lev,
      stopPrice: stopPrice ? Number(stopPrice) : null,
      targetPrice: targetPrice ? Number(targetPrice) : null,
    });
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-zinc-800 bg-[#0b0f14] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 bg-zinc-950/80 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-teal-300">
              <BookOpenCheck className="h-3.5 w-3.5" />
              Shadow Book
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-50">
              Track {ticket.asset} paper {side}
            </h2>
            <div className="mt-1 text-sm text-zinc-500">
              Entry uses current mark: <span className="font-mono text-zinc-200">{formatChartPrice(ticket.entryPrice)}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-zinc-800 p-2 text-zinc-500 hover:text-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-2">
            <ChoiceButton label="Long" active={side === "long"} onClick={() => setSide("long")} tone="green" />
            <ChoiceButton label="Short" active={side === "short"} onClick={() => setSide("short")} tone="red" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="Fake margin" prefix="$" value={marginUsd} onChange={setMarginUsd} />
            <NumberField label="Leverage" suffix="x" value={leverage} onChange={setLeverage} />
            <NumberField label="Stop / invalidation" value={stopPrice} onChange={setStopPrice} placeholder="optional" />
            <NumberField label="Target" value={targetPrice} onChange={setTargetPrice} placeholder="optional" />
          </div>

          <div className="grid gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 text-sm sm:grid-cols-3">
            <MiniMetric label="Margin" value={formatUSD(margin)} />
            <MiniMetric label="Notional" value={formatUSD(notional)} />
            <MiniMetric label="Source" value={sourceLabel(ticket.source ?? "manual")} />
          </div>

          <div className="rounded-2xl border border-teal-500/15 bg-teal-500/5 px-3 py-2 text-xs leading-5 text-zinc-400">
            Paper trades are stored locally in this browser and are not real orders.
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-xl border border-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={margin <= 0 || lev <= 0}
              className="rounded-xl border border-teal-400/30 bg-teal-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start tracking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChoiceButton({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone: "green" | "red";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
        active
          ? tone === "green"
            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
            : "border-rose-400/40 bg-rose-500/15 text-rose-200"
          : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-200",
      )}
    >
      {label}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="block rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className="mt-1 flex items-center gap-1 font-mono text-sm text-zinc-100">
        {prefix ? <span className="text-zinc-500">{prefix}</span> : null}
        <input
          type="number"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-700"
        />
        {suffix ? <span className="text-zinc-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className="mt-1 font-mono text-zinc-100">{value}</div>
    </div>
  );
}

function sourceLabel(source: ShadowTradeSource) {
  if (source === "momentum_alert") return "Alert";
  if (source === "market_setup") return "Setup";
  return "Manual";
}

export { calculateShadowTradeStats };
