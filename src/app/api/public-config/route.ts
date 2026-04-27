import { NextResponse } from "next/server";
import { isFactorsEnabled, isTradingEnabled, isWhalesEnabled } from "@/lib/appConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const tradingEnabled = isTradingEnabled();
  const whalesEnabled = isWhalesEnabled();
  const factorsEnabled = isFactorsEnabled();

  return NextResponse.json(
    {
      tradingEnabled,
      whalesEnabled,
      factorsEnabled,
      deploymentMode: tradingEnabled ? "trading" : "read-only",
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
