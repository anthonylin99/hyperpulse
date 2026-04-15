import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const tradingEnabled = process.env.NEXT_PUBLIC_ENABLE_TRADING === "true";

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
