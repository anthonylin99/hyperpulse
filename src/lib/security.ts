import { NextResponse, type NextRequest } from "next/server";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const COIN_REGEX = /^[A-Z0-9][A-Z0-9/:_-]{0,31}$/;
const VALID_INTERVALS = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
] as const;

type Interval = (typeof VALID_INTERVALS)[number];

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type CachePolicy = "private-no-store" | "public-market";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export function validateAddress(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return ADDRESS_REGEX.test(normalized) ? normalized : null;
}

export function validateCoin(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return COIN_REGEX.test(normalized) ? normalized : null;
}

export function parseInterval(value: string | null, fallback: Interval = "1h"): Interval {
  if (!value) return fallback;
  return VALID_INTERVALS.includes(value as Interval) ? (value as Interval) : fallback;
}

export function parseBoolean(value: string | null, fallback = false): boolean {
  if (value == null) return fallback;
  return value === "true";
}

export function parseTimestamp(
  value: string | null,
  options: {
    fallback?: number;
    min?: number;
    max?: number;
  } = {},
): number | null {
  if (value == null || value === "") {
    return options.fallback ?? null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (!Number.isInteger(parsed)) return null;
  if (options.min != null && parsed < options.min) return null;
  if (options.max != null && parsed > options.max) return null;
  return parsed;
}

export function enforceTimeRange(args: {
  startTime: number;
  endTime: number;
  maxLookbackMs: number;
}): boolean {
  const { startTime, endTime, maxLookbackMs } = args;
  if (startTime <= 0 || endTime <= 0) return false;
  if (endTime < startTime) return false;
  return endTime - startTime <= maxLookbackMs;
}

function applyCacheHeaders(response: NextResponse, cachePolicy: CachePolicy) {
  if (cachePolicy === "private-no-store") {
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  } else {
    response.headers.set("Cache-Control", "public, max-age=30, s-maxage=120, stale-while-revalidate=300");
  }
}

export function jsonSuccess(
  body: unknown,
  options: {
    status?: number;
    cache?: CachePolicy;
  } = {},
): NextResponse {
  const response = NextResponse.json(body, { status: options.status ?? 200 });
  applyCacheHeaders(response, options.cache ?? "private-no-store");
  return response;
}

export function jsonError(
  message: string,
  options: {
    status?: number;
    cache?: CachePolicy;
  } = {},
): NextResponse {
  const response = NextResponse.json(
    { error: message },
    { status: options.status ?? 400 },
  );
  applyCacheHeaders(response, options.cache ?? "private-no-store");
  return response;
}

function getClientIp(request: Request | NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function enforceRateLimit(
  request: Request | NextRequest,
  options: RateLimitOptions,
): NextResponse | null {
  const now = Date.now();
  const ip = getClientIp(request);
  const storeKey = `${options.key}:${ip}`;
  const current = rateLimitStore.get(storeKey);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(storeKey, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return null;
  }

  if (current.count >= options.limit) {
    console.warn(`[security] rate limit exceeded`, {
      bucket: options.key,
      ip,
    });
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    const response = jsonError("Too many requests. Please try again shortly.", {
      status: 429,
    });
    response.headers.set("Retry-After", String(retryAfter));
    return response;
  }

  current.count += 1;
  rateLimitStore.set(storeKey, current);
  return null;
}

export function logServerError(scope: string, error: unknown) {
  console.error(`[${scope}] upstream request failed`, error);
}

export { VALID_INTERVALS };
