"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatCompactUsd } from "@/lib/format";
import { cn } from "@/lib/format";
import type { ReactionOverlayMode } from "@/lib/reactionLevels";
import {
  ageLabel,
  normalizeReactionMap,
  selectedZoneRead,
  shelfMeta,
  windowLabel,
  zoneRangeLabel,
} from "./model";
import type {
  NormalizedHiddenPositioningSlot,
  NormalizedOrderBookShelf,
  NormalizedPositioningZone,
  NormalizedReactionMap,
  NormalizedReactionZone,
  ReactionMapPayloadLike,
  ReactionMapSelectableZone,
} from "./types";

interface ReactionMapPanelProps {
  payload: ReactionMapPayloadLike | null | undefined;
  mode?: ReactionOverlayMode;
  selectedZoneId?: string | null;
  onSelectZone?: (zone: ReactionMapSelectableZone) => void;
  shelfLimit?: number;
  className?: string;
}

interface OrderBookShelvesProps {
  bids: NormalizedOrderBookShelf[];
  asks: NormalizedOrderBookShelf[];
  className?: string;
}

interface PositioningZonesProps {
  buyerZones: NormalizedPositioningZone[];
  sellerZones: NormalizedPositioningZone[];
  hiddenSlots?: NormalizedHiddenPositioningSlot[];
  selectedZoneId?: string | null;
  onSelectZone?: (zone: NormalizedPositioningZone) => void;
  className?: string;
}

interface ReactionZoneListProps {
  zones: NormalizedReactionZone[];
  selectedZoneId?: string | null;
  onSelectZone?: (zone: NormalizedReactionZone) => void;
  className?: string;
}

interface SelectedZoneReadProps {
  zone: ReactionMapSelectableZone | null;
  coverageNote?: string | null;
  className?: string;
}

export function ReactionMapPanel({
  payload,
  mode = "oi_holding",
  selectedZoneId,
  onSelectZone,
  shelfLimit = 5,
  className,
}: ReactionMapPanelProps) {
  const model = useMemo(() => normalizeReactionMap(payload, shelfLimit), [payload, shelfLimit]);
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const activeId = selectedZoneId ?? localSelectedId;
  const selectableZones: ReactionMapSelectableZone[] = [
    ...model.reactionZones,
    ...model.buyerZones,
    ...model.sellerZones,
  ];
  const selectedZone = selectableZones.find((zone) => zone.id === activeId) ?? selectableZones[0] ?? null;
  const showOrderBook = mode === "book";
  const showPositioning = mode === "oi_holding";
  const showReactionZones = mode === "confluence" || mode === "stress";

  const handleSelect = (zone: ReactionMapSelectableZone) => {
    setLocalSelectedId(zone.id);
    onSelectZone?.(zone);
  };

  return (
    <aside className={cn("space-y-3 text-xs text-zinc-300", className)}>
      {showOrderBook ? <OrderBookShelves bids={model.bidShelves} asks={model.askShelves} /> : null}
      {showPositioning ? (
        <PositioningZones
          buyerZones={model.buyerZones}
          sellerZones={model.sellerZones}
          hiddenSlots={model.hiddenSlots}
          selectedZoneId={selectedZone?.id ?? null}
          onSelectZone={handleSelect}
        />
      ) : null}
      {showReactionZones ? (
        <ReactionZoneList
          zones={model.reactionZones}
          selectedZoneId={selectedZone?.id ?? null}
          onSelectZone={handleSelect}
        />
      ) : null}
      {showPositioning || showReactionZones ? (
        <SelectedZoneRead zone={selectedZone} coverageNote={model.coverageNote} />
      ) : null}
    </aside>
  );
}

export function OrderBookShelves({ bids, asks, className }: OrderBookShelvesProps) {
  return (
    <section className={cn("rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3", className)}>
      <PanelHeader title="Order Book Shelves" badge="real liquidity" note="Resting orders can pull." />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ShelfColumn title="Bid shelves" shelves={bids} tone="bid" />
        <ShelfColumn title="Ask shelves" shelves={asks} tone="ask" />
      </div>
    </section>
  );
}

export function PositioningZones({
  buyerZones,
  sellerZones,
  hiddenSlots = [],
  selectedZoneId,
  onSelectZone,
  className,
}: PositioningZonesProps) {
  const buyerHidden = hiddenSlots.filter((slot) => slot.side === "buyer");
  const sellerHidden = hiddenSlots.filter((slot) => slot.side === "seller");

  return (
    <section className={cn("rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3", className)}>
      <PanelHeader title="Positioning" badge="inferred" note="Use confidence and age before trusting a zone." />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <PositioningColumn
          title="Buyer-initiated builds"
          zones={buyerZones}
          hiddenSlots={buyerHidden}
          selectedZoneId={selectedZoneId}
          onSelectZone={onSelectZone}
          tone="buyer"
        />
        <PositioningColumn
          title="Seller-initiated builds"
          zones={sellerZones}
          hiddenSlots={sellerHidden}
          selectedZoneId={selectedZoneId}
          onSelectZone={onSelectZone}
          tone="seller"
        />
      </div>
    </section>
  );
}

export function ReactionZoneList({ zones, selectedZoneId, onSelectZone, className }: ReactionZoneListProps) {
  if (zones.length === 0) {
    return (
      <section className={cn("rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3", className)}>
        <PanelHeader title="Reaction Zones" badge="confluence" note="No scored reaction zone in this payload." />
      </section>
    );
  }

  return (
    <section className={cn("rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3", className)}>
      <PanelHeader title="Reaction Zones" badge="confluence" note="Acceptance or rejection matters more than the label." />
      <div className="mt-3 space-y-2">
        {zones.slice(0, 5).map((zone) => (
          <button
            key={zone.id}
            type="button"
            onClick={() => onSelectZone?.(zone)}
            className={cn(
              "w-full rounded-xl border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-1 focus:ring-teal-300/60",
              selectedZoneId === zone.id
                ? "border-teal-400/45 bg-teal-400/10"
                : "border-zinc-800 bg-zinc-900/45 hover:border-zinc-700 hover:bg-zinc-900/75",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-sm text-zinc-100">{zoneRangeLabel(zone)}</div>
                <div className="mt-1 text-[11px] text-zinc-500">{zone.role}</div>
              </div>
              <ZoneBadge label={zone.confidence} tone={zone.confidence === "high" ? "good" : zone.confidence === "low" ? "warn" : "neutral"} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-zinc-500">
              <MetaPill>{formatCompactUsd(zone.notionalUsd)}</MetaPill>
              <MetaPill>{ageLabel(zone.ageMs)}</MetaPill>
              <MetaPill>{windowLabel(zone.windowMs)}</MetaPill>
              {zone.score != null ? <MetaPill>score {Math.round(zone.score)}</MetaPill> : null}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export function SelectedZoneRead({ zone, coverageNote, className }: SelectedZoneReadProps) {
  if (!zone) {
    return (
      <section className={cn("rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 text-zinc-500", className)}>
        Select a reaction or positioning zone to inspect.
      </section>
    );
  }

  const read = selectedZoneRead(zone);

  return (
    <section className={cn("rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3", className)}>
      <PanelHeader title="Selected Zone Read" badge={zone.confidence} note={zone.caveat ?? coverageNote ?? null} />
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_0.9fr_0.9fr]">
        <ReadMetric label={zone.role} value={zoneRangeLabel(zone)} />
        <ReadMetric label="Age / window" value={`${ageLabel(zone.ageMs)} / ${windowLabel(zone.windowMs)}`} />
        <ReadMetric label="Size read" value={formatCompactUsd(zone.notionalUsd)} />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <PlanRead label="Trigger" value={read.trigger} tone="good" />
        <PlanRead label="Invalidation" value={read.invalidation} tone="danger" />
        {read.acceptance ? <PlanRead label="Acceptance" value={read.acceptance} /> : null}
        {read.rejection ? <PlanRead label="Rejection" value={read.rejection} /> : null}
      </div>
      {zone.confidenceReason ? (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2 text-[11px] leading-5 text-zinc-400">
          {zone.confidenceReason}
        </div>
      ) : null}
    </section>
  );
}

export function useReactionMapModel(payload: ReactionMapPayloadLike | null | undefined, shelfLimit = 5): NormalizedReactionMap {
  return useMemo(() => normalizeReactionMap(payload, shelfLimit), [payload, shelfLimit]);
}

function PanelHeader({ title, badge, note }: { title: string; badge: string; note?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{title}</h3>
        {note ? <div className="mt-1 text-[11px] leading-4 text-zinc-500">{note}</div> : null}
      </div>
      <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
        {badge}
      </span>
    </div>
  );
}

function ShelfColumn({
  title,
  shelves,
  tone,
}: {
  title: string;
  shelves: NormalizedOrderBookShelf[];
  tone: "bid" | "ask";
}) {
  const toneClass = tone === "bid" ? "text-emerald-300" : "text-red-300";

  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-600">{title}</div>
      <div className="space-y-1.5">
        {shelves.length === 0 ? (
          <EmptyLine>No {tone === "bid" ? "bid" : "ask"} shelves in this payload.</EmptyLine>
        ) : (
          shelves.map((shelf, index) => (
            <div key={shelf.id} className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className={cn("font-mono text-sm", toneClass)}>
                  {index + 1}. {zoneRangeLabel(shelf)}
                </div>
                <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[10px] text-zinc-500">
                  {shelf.status}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">{shelfMeta(shelf)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PositioningColumn({
  title,
  zones,
  hiddenSlots,
  selectedZoneId,
  onSelectZone,
  tone,
}: {
  title: string;
  zones: NormalizedPositioningZone[];
  hiddenSlots: NormalizedHiddenPositioningSlot[];
  selectedZoneId?: string | null;
  onSelectZone?: (zone: NormalizedPositioningZone) => void;
  tone: "buyer" | "seller";
}) {
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-600">{title}</div>
      <div className="space-y-1.5">
        {zones.map((zone) => (
          <PositioningZoneButton
            key={zone.id}
            zone={zone}
            selected={selectedZoneId === zone.id}
            tone={tone}
            onClick={() => onSelectZone?.(zone)}
          />
        ))}
        {hiddenSlots.map((slot) => (
          <HiddenSlot key={slot.id} slot={slot} />
        ))}
      </div>
    </div>
  );
}

function PositioningZoneButton({
  zone,
  selected,
  tone,
  onClick,
}: {
  zone: NormalizedPositioningZone;
  selected: boolean;
  tone: "buyer" | "seller";
  onClick: () => void;
}) {
  const toneClass = tone === "buyer" ? "text-emerald-300" : "text-red-300";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-1 focus:ring-teal-300/60",
        selected
          ? "border-teal-400/45 bg-teal-400/10"
          : "border-zinc-800 bg-zinc-900/45 hover:border-zinc-700 hover:bg-zinc-900/75",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={cn("font-mono text-sm", toneClass)}>{zoneRangeLabel(zone)}</div>
          <div className="mt-1 text-[11px] font-medium text-zinc-300">{zone.role}</div>
        </div>
        <ZoneBadge label={zone.confidence} tone={zone.confidence === "high" ? "good" : zone.confidence === "low" ? "warn" : "neutral"} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-zinc-500">
        <MetaPill>{formatCompactUsd(zone.notionalUsd)}</MetaPill>
        <MetaPill>{ageLabel(zone.ageMs)}</MetaPill>
        <MetaPill>{windowLabel(zone.windowMs)}</MetaPill>
        {zone.rank != null ? <MetaPill>rank #{zone.rank}</MetaPill> : null}
      </div>
      <div className="mt-2 text-[11px] leading-4 text-zinc-500">{zone.caveat}</div>
    </button>
  );
}

function HiddenSlot({ slot }: { slot: NormalizedHiddenPositioningSlot }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/45 px-3 py-2 text-[11px] text-zinc-500">
      <div className="flex items-center justify-between gap-3">
        <span>Hidden positioning slot</span>
        <span className="font-mono text-[10px]">{windowLabel(slot.windowMs)}</span>
      </div>
      <div className="mt-1 leading-4">{slot.reason}</div>
    </div>
  );
}

function ZoneBadge({ label, tone }: { label: string; tone: "good" | "warn" | "neutral" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px]",
        tone === "good"
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
          : tone === "warn"
            ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
            : "border-zinc-700 bg-zinc-950 text-zinc-400",
      )}
    >
      {label}
    </span>
  );
}

function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
      {children}
    </span>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/45 px-3 py-2 text-[11px] text-zinc-500">
      {children}
    </div>
  );
}

function ReadMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div className="mt-1 font-mono text-xs text-zinc-200">{value}</div>
    </div>
  );
}

function PlanRead({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "danger" | "neutral" }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</div>
      <div
        className={cn(
          "mt-1 text-xs leading-5",
          tone === "good" ? "text-emerald-300" : tone === "danger" ? "text-red-300" : "text-zinc-300",
        )}
      >
        {value}
      </div>
    </div>
  );
}
