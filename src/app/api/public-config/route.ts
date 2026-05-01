import { NextResponse } from "next/server";
import { isTradingEnabled, isWhalesEnabled } from "@/lib/appConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const tradingEnabled = isTradingEnabled();
  const whalesEnabled = isWhalesEnabled();

  return NextResponse.json(
    {
      tradingEnabled,
      whalesEnabled,
      deploymentMode: tradingEnabled ? "trading" : "read-only",
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
