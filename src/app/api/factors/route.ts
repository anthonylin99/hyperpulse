import { FACTOR_SNAPSHOTS } from "@/lib/factors/snapshots";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";

export const dynamic = "force-dynamic";

const ARTEMIS_PRICE_URL = "https://data-svc.artemisxyz.com/data/api/price";

function uniqueSymbols() {
  return [...new Set(
    FACTOR_SNAPSHOTS.flatMap((snapshot) => [
      ...snapshot.longs.map((holding) => holding.symbol),
      ...snapshot.shorts.map((holding) => holding.symbol),
    ]),
  )];
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-factors",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const apiKey = process.env.ARTEMIS_API_KEY;
  if (!apiKey) {
    return jsonError("Factors are unavailable until ARTEMIS_API_KEY is configured.", {
      status: 503,
      cache: "public-market",
    });
  }

  const params = new URLSearchParams({
    symbols: uniqueSymbols().join(","),
    startDate: isoDaysAgo(95),
    endDate: new Date().toISOString().slice(0, 10),
    APIKey: apiKey,
  });

  try {
    const response = await fetch(`${ARTEMIS_PRICE_URL}?${params.toString()}`, {
      headers: {
        "User-Agent": "HyperPulse/1.0",
      },
      next: { revalidate: 900 },
    });

    if (!response.ok) {
      return jsonError("Unable to fetch Artemis factor prices right now.", {
        status: 502,
        cache: "public-market",
      });
    }

    const prices = await response.json();
    return jsonSuccess(
      {
        snapshots: FACTOR_SNAPSHOTS,
        prices,
      },
      { cache: "public-market" },
    );
  } catch (error) {
    logServerError("api/factors", error);
    return jsonError("Unable to fetch factor data right now.", {
      status: 502,
      cache: "public-market",
    });
  }
}
