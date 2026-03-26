import { NextRequest, NextResponse } from "next/server";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

const transport = new HttpTransport({ isTestnet: false });
const info = new InfoClient({ transport });

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const coin = req.nextUrl.searchParams.get("coin");
  if (!coin) {
    return NextResponse.json({ error: "coin required" }, { status: 400 });
  }

  const VALID_INTERVALS = ["1m","3m","5m","15m","30m","1h","2h","4h","8h","12h","1d","3d","1w","1M"] as const;
  type Interval = typeof VALID_INTERVALS[number];
  const rawInterval = req.nextUrl.searchParams.get("interval") || "1h";
  const interval: Interval = VALID_INTERVALS.includes(rawInterval as Interval)
    ? (rawInterval as Interval)
    : "1h";
  const startTime = Number(req.nextUrl.searchParams.get("startTime") || Date.now() - 7 * 24 * 60 * 60 * 1000);
  const endTime = Number(req.nextUrl.searchParams.get("endTime") || Date.now());

  try {
    const candles = await info.candleSnapshot({
      coin,
      interval,
      startTime,
      endTime,
    });
    return NextResponse.json(candles);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch candles" },
      { status: 500 },
    );
  }
}
