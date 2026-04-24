import type { Position } from "@/types";

const STORAGE_KEY_PREFIX = "hp_position_notes_";

export interface PositionNote {
  thesis: string;
  invalidation: string;
  review: string;
  updatedAt: number;
}

function storageKey(address: string): string {
  return `${STORAGE_KEY_PREFIX}${address.toLowerCase()}`;
}

export function positionNoteKey(position: Position): string {
  const side = position.marketType === "hip3_spot" ? "spot" : position.szi >= 0 ? "long" : "short";
  const market = position.dex ? `${position.marketType ?? "perp"}:${position.dex}` : position.marketType ?? "perp";
  return `${market}:${position.coin}:${side}`;
}

export function emptyPositionNote(): PositionNote {
  return {
    thesis: "",
    invalidation: "",
    review: "",
    updatedAt: Date.now(),
  };
}

export function getPositionNotes(address: string): Record<string, PositionNote> {
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PositionNote>;
  } catch {
    return {};
  }
}

export function setPositionNote(address: string, key: string, note: PositionNote): boolean {
  try {
    const notes = getPositionNotes(address);
    const cleaned: PositionNote = {
      thesis: note.thesis.trim(),
      invalidation: note.invalidation.trim(),
      review: note.review.trim(),
      updatedAt: Date.now(),
    };
    if (!cleaned.thesis && !cleaned.invalidation && !cleaned.review) {
      delete notes[key];
    } else {
      notes[key] = cleaned;
    }
    localStorage.setItem(storageKey(address), JSON.stringify(notes));
    return true;
  } catch {
    // localStorage may be unavailable or full; notes are a convenience layer only.
    return false;
  }
}
