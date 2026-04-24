const STORAGE_KEY_PREFIX = "hp_notes_";

function storageKey(address: string): string {
  return `${STORAGE_KEY_PREFIX}${address.toLowerCase()}`;
}

export function getNotes(address: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function setNote(address: string, tradeId: string, note: string): boolean {
  try {
    const notes = getNotes(address);
    if (note.trim() === "") {
      delete notes[tradeId];
    } else {
      notes[tradeId] = note;
    }
    localStorage.setItem(storageKey(address), JSON.stringify(notes));
    return true;
  } catch {
    // localStorage full or unavailable — silently fail
    return false;
  }
}

export function deleteNote(address: string, tradeId: string): void {
  try {
    const notes = getNotes(address);
    delete notes[tradeId];
    localStorage.setItem(storageKey(address), JSON.stringify(notes));
  } catch {
    // silently fail
  }
}
