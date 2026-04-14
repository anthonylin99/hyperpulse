import type { FactorTradePreset } from "@/types";

const STORAGE_KEY = "hp_factor_trade_presets";

function readAll(): FactorTradePreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(presets: FactorTradePreset[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function listFactorTradePresets(factorId: string): FactorTradePreset[] {
  return readAll()
    .filter((preset) => preset.factorId === factorId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveFactorTradePreset(
  preset: Omit<FactorTradePreset, "id" | "createdAt" | "updatedAt"> & { id?: string },
): FactorTradePreset {
  const all = readAll();
  const now = Date.now();
  const next: FactorTradePreset = {
    ...preset,
    id: preset.id ?? `preset_${now.toString(36)}`,
    createdAt: preset.id ? all.find((item) => item.id === preset.id)?.createdAt ?? now : now,
    updatedAt: now,
  };

  writeAll([...all.filter((item) => item.id !== next.id), next]);
  return next;
}

export function deleteFactorTradePreset(id: string) {
  writeAll(readAll().filter((preset) => preset.id !== id));
}
