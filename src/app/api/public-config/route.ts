import { NextResponse } from "next/server";
import { isFactorsEnabled, isTradingEnabled } from "@/lib/appConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const tradingEnabled = isTradingEnabled();
  const factorsEnabled = isFactorsEnabled();

  return NextResponse.json(
    {
      tradingEnabled,
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
