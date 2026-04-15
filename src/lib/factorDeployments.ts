import type { FactorDeploymentRecord } from "@/types";

const VERSION = "v1";
const MAX_RECORDS = 50;

function keyFor(address: string) {
  return `hp_factor_deploys_${VERSION}_${address.toLowerCase()}`;
}

export function listDeployments(address: string): FactorDeploymentRecord[] {
  if (typeof window === "undefined" || !address) return [];
  try {
    const raw = window.localStorage.getItem(keyFor(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FactorDeploymentRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDeployment(
  address: string,
  record: FactorDeploymentRecord,
): FactorDeploymentRecord[] {
  if (typeof window === "undefined" || !address) return [];
  const existing = listDeployments(address);
  const next = [record, ...existing].slice(0, MAX_RECORDS);
  try {
    window.localStorage.setItem(keyFor(address), JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
  return next;
}

export function clearDeployments(address: string): void {
  if (typeof window === "undefined" || !address) return;
  window.localStorage.removeItem(keyFor(address));
}
