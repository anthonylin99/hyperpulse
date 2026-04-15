import { NextResponse } from "next/server";
import { ENABLE_TRADING_DEFAULT } from "@/lib/appConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const tradingEnabled =
    process.env.ENABLE_TRADING === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_TRADING === "true" ||
    ENABLE_TRADING_DEFAULT;

  return NextResponse.json(
    {
      tradingEnabled,
      deploymentMode: tradingEnabled ? "trading" : "read-only",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
