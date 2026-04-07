import OpenAI from "openai";
import {
  enforceRateLimit,
  jsonError,
  jsonSuccess,
  logServerError,
} from "@/lib/security";
import type { FactorAiBrief, FactorAiInsight } from "@/types";

export const dynamic = "force-dynamic";

type InsightCandidate = {
  symbol: string;
  role: "long" | "short";
  liveChange24h: number | null;
  fundingAPR: number | null;
  signalLabel: string | null;
  trendStatus: "trend-confirmed" | "watchlist-only";
};

type FactorInsightInput = {
  name: string;
  shortLabel: string;
  reportDate: string;
  confidence: "high" | "medium" | "low";
  stalenessDays: number;
  basketCoverage: number;
  hyperliquidCoverage: number;
  spread7d: number | null;
  spread30d: number | null;
  narrativeTags: string[];
  tradeCandidates: InsightCandidate[];
};

type RequestPayload = {
  factors: FactorInsightInput[];
  warning?: string | null;
};

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizePayload(body: unknown): RequestPayload | null {
  if (!body || typeof body !== "object") return null;

  const maybeFactors = (body as { factors?: unknown }).factors;
  const warning = (body as { warning?: unknown }).warning;
  if (!Array.isArray(maybeFactors) || maybeFactors.length === 0 || maybeFactors.length > 8) {
    return null;
  }

  const factors: FactorInsightInput[] = [];

  for (const raw of maybeFactors) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;

    if (
      typeof item.name !== "string" ||
      typeof item.shortLabel !== "string" ||
      typeof item.reportDate !== "string" ||
      !["high", "medium", "low"].includes(String(item.confidence)) ||
      !isFiniteNumber(item.stalenessDays) ||
      !isFiniteNumber(item.basketCoverage) ||
      !isFiniteNumber(item.hyperliquidCoverage) ||
      !Array.isArray(item.narrativeTags) ||
      !Array.isArray(item.tradeCandidates)
    ) {
      return null;
    }

    const tradeCandidates: InsightCandidate[] = item.tradeCandidates
      .slice(0, 4)
      .map((candidate) => {
        if (!candidate || typeof candidate !== "object") {
          throw new Error("Invalid trade candidate payload");
        }

        const row = candidate as Record<string, unknown>;
        if (
          typeof row.symbol !== "string" ||
          !["long", "short"].includes(String(row.role)) ||
          !["trend-confirmed", "watchlist-only"].includes(String(row.trendStatus))
        ) {
          throw new Error("Invalid trade candidate payload");
        }

        return {
          symbol: row.symbol,
          role: row.role as "long" | "short",
          liveChange24h: isFiniteNumber(row.liveChange24h) ? row.liveChange24h : null,
          fundingAPR: isFiniteNumber(row.fundingAPR) ? row.fundingAPR : null,
          signalLabel: typeof row.signalLabel === "string" ? row.signalLabel : null,
          trendStatus: row.trendStatus as "trend-confirmed" | "watchlist-only",
        };
      });

    factors.push({
      name: item.name,
      shortLabel: item.shortLabel,
      reportDate: item.reportDate,
      confidence: item.confidence as "high" | "medium" | "low",
      stalenessDays: item.stalenessDays,
      basketCoverage: item.basketCoverage,
      hyperliquidCoverage: item.hyperliquidCoverage,
      spread7d: isFiniteNumber(item.spread7d) ? item.spread7d : null,
      spread30d: isFiniteNumber(item.spread30d) ? item.spread30d : null,
      narrativeTags: item.narrativeTags
        .filter((tag): tag is string => typeof tag === "string")
        .slice(0, 6),
      tradeCandidates,
    });
  }

  return {
    factors,
    warning: typeof warning === "string" ? warning : null,
  };
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function coerceBrief(raw: unknown): FactorAiBrief | null {
  if (!raw || typeof raw !== "object") return null;

  const value = raw as Record<string, unknown>;
  if (typeof value.headline !== "string" || typeof value.summary !== "string") {
    return null;
  }

  const insights: FactorAiInsight[] = Array.isArray(value.insights)
    ? value.insights
        .filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
        )
        .map((item) => {
          const tone: FactorAiInsight["tone"] =
            item.tone === "bullish" || item.tone === "cautious" || item.tone === "neutral"
              ? item.tone
              : "neutral";
          return {
            title: typeof item.title === "string" ? item.title : "Market note",
            body: typeof item.body === "string" ? item.body : "",
            tone,
            tickers: Array.isArray(item.tickers)
              ? item.tickers
                  .filter((ticker): ticker is string => typeof ticker === "string")
                  .slice(0, 4)
              : [],
          };
        })
        .filter((item) => item.body.length > 0)
        .slice(0, 3)
    : [];

  return {
    headline: value.headline,
    summary: value.summary,
    insights,
    disclaimer: typeof value.disclaimer === "string" ? value.disclaimer : undefined,
    generatedAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, {
    key: "api-factors-insights",
    limit: 8,
    windowMs: 60_000,
  });
  if (limited) return limited;

  if (!process.env.OPENAI_API_KEY) {
    return jsonError("AI insights are unavailable until OPENAI_API_KEY is configured.", {
      status: 503,
      cache: "private-no-store",
    });
  }

  let payload: RequestPayload | null = null;
  try {
    const body = await request.json();
    payload = normalizePayload(body);
  } catch {
    payload = null;
  }

  if (!payload) {
    return jsonError("Invalid factor insight payload.", {
      status: 400,
      cache: "private-no-store",
    });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: MODEL,
      temperature: 0.4,
      max_output_tokens: 500,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are HyperPulse's factor strategist. Turn structured factor data into a concise trader-facing brief. Do not invent metrics or symbols. Stay grounded in the supplied numbers only. Prefer cautious language when confidence is low, coverage is weak, or data is stale. Output strict JSON with keys: headline, summary, insights, disclaimer. insights must be an array of up to 3 objects with title, body, tone (bullish|cautious|neutral), tickers. Keep each body to 1-2 short sentences.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(payload),
            },
          ],
        },
      ],
    });

    const rawText = response.output_text?.trim();
    const parsedText = rawText ? extractJsonObject(rawText) : null;
    if (!parsedText) {
      throw new Error("OpenAI returned no JSON payload.");
    }

    const brief = coerceBrief(JSON.parse(parsedText));
    if (!brief) {
      throw new Error("OpenAI returned malformed JSON payload.");
    }

    return jsonSuccess(brief, { cache: "private-no-store" });
  } catch (error) {
    logServerError("api/factors/insights", error);
    return jsonError("AI insights are temporarily unavailable.", {
      status: 502,
      cache: "private-no-store",
    });
  }
}
