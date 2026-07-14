// Typed access to the shipped crowding track record (a periodic backtest
// regenerated with `npm run research:crowding-track`). The UI must always
// present these as backtest numbers, never as live results.

import rawRecord from "@/data/crowding-track-record.json";
import type { TrackRecord, TrackRecordCell } from "./crowdingHistory";

const record = rawRecord as TrackRecord;

export function getTrackRecord(): TrackRecord {
  return record;
}

export function getTrackRecordCell(tier: string, horizonHours: number): TrackRecordCell | null {
  const cell = record.tiers[tier]?.[`${horizonHours}h`];
  if (!cell || !("meanNetPct" in cell)) return null;
  return cell;
}

export function formatTrackRecordWindow(): string {
  const start = new Date(record.startTime);
  const end = new Date(record.endTime);
  const options: Intl.DateTimeFormatOptions = { month: "short", year: "numeric", timeZone: "UTC" };
  return `${start.toLocaleDateString("en-US", options)} – ${end.toLocaleDateString("en-US", options)}`;
}

/** Days since the record was regenerated — used to warn when it goes stale. */
export function trackRecordAgeDays(now = Date.now()): number {
  return Math.floor((now - record.generatedAt) / (24 * 60 * 60 * 1000));
}
