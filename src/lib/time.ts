export const EASTERN_TIME_ZONE = "America/New_York";
export const EASTERN_TIME_LABEL = "EST";

function normalizeMs(value: number): number {
  return value > 10_000_000_000 ? value : value * 1000;
}

export function chartTimeToMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return normalizeMs(value);
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object") {
    const maybe = value as { timestamp?: unknown; year?: unknown; month?: unknown; day?: unknown };
    if (typeof maybe.timestamp === "number" && Number.isFinite(maybe.timestamp)) {
      return normalizeMs(maybe.timestamp);
    }
    if (
      typeof maybe.year === "number" &&
      typeof maybe.month === "number" &&
      typeof maybe.day === "number"
    ) {
      return Date.UTC(maybe.year, maybe.month - 1, maybe.day);
    }
  }
  return null;
}

export function formatEasternTime(value: number | Date | null | undefined, includeSeconds = false): string {
  if (value == null) return "n/a";
  const date = value instanceof Date ? value : new Date(normalizeMs(value));
  if (!Number.isFinite(date.getTime())) return "n/a";
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" as const } : {}),
  }).format(date)} ${EASTERN_TIME_LABEL}`;
}

export function formatEasternDate(value: number | Date | null | undefined, includeYear = false): string {
  if (value == null) return "n/a";
  const date = value instanceof Date ? value : new Date(normalizeMs(value));
  if (!Number.isFinite(date.getTime())) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
  }).format(date);
}

export function formatEasternDateTime(value: number | Date | null | undefined, includeYear = false): string {
  if (value == null) return "n/a";
  const date = value instanceof Date ? value : new Date(normalizeMs(value));
  if (!Number.isFinite(date.getTime())) return "n/a";
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
    hour: "numeric",
    minute: "2-digit",
  }).format(date)} ${EASTERN_TIME_LABEL}`;
}

export function formatEasternChartTick(value: unknown, mode: "time" | "date" | "datetime" = "time"): string {
  const ms = chartTimeToMs(value);
  if (ms == null) return "";
  if (mode === "date") return formatEasternDate(ms);
  if (mode === "datetime") return formatEasternDateTime(ms);
  return formatEasternTime(ms);
}
