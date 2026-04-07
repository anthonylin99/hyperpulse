import https from "node:https";
import { FACTOR_SNAPSHOTS } from "@/lib/factors/snapshots";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";

export const dynamic = "force-dynamic";

const ARTEMIS_PRICE_URL = "https://data-svc.artemisxyz.com/data/api/price";

function requestArtemisPrices(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; HyperPulse/1.0; +https://hyperpulse-gold.vercel.app)",
          Accept: "application/json",
        },
        family: 4,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if ((res.statusCode ?? 500) < 200 || (res.statusCode ?? 500) >= 300) {
            reject(
              new Error(
                `Artemis upstream responded ${res.statusCode ?? 500}: ${res.statusMessage ?? "unknown"}`,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(20_000, () => {
      req.destroy(new Error("Artemis upstream request timed out"));
    });
    req.end();
  });
}

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
  const emptyPrices = { data: { symbols: {} } };

  try {
    const prices = await requestArtemisPrices(`${ARTEMIS_PRICE_URL}?${params.toString()}`);
    return jsonSuccess(
      {
        snapshots: FACTOR_SNAPSHOTS,
        prices,
      },
      { cache: "public-market" },
    );
  } catch (error) {
    logServerError("api/factors", error);
    return jsonSuccess(
      {
        snapshots: FACTOR_SNAPSHOTS,
        prices: emptyPrices,
        warning: "Artemis price history is temporarily unavailable, so factor returns may be incomplete.",
      },
      { cache: "public-market" },
    );
  }
}
