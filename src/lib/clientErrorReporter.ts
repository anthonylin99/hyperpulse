type ClientErrorEntry = {
  scope: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
};

const STORAGE_KEY = "hp_client_errors";
const MAX_ERRORS = 20;

export function reportClientError(
  scope: string,
  error: unknown,
  metadata?: Record<string, unknown>,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const entry: ClientErrorEntry = {
    scope,
    message,
    metadata,
    timestamp: Date.now(),
  };

  console.error(`[HyperPulse:${scope}]`, error, metadata ?? "");

  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const previous = raw ? (JSON.parse(raw) as ClientErrorEntry[]) : [];
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([entry, ...previous].slice(0, MAX_ERRORS)),
    );
  } catch {
    // Reporting should never break the product experience.
  }
}
