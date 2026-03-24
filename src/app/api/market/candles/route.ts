import { NextResponse } from "next/server";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

const transport = new HttpTransport({ isTestnet: false });
const info = new InfoClient({ transport });

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const coin = searchParams.get("coin");
  const interval = (searchParams.get("interval") || "1h") as "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M";
  const startTime = searchParams.get("startTime");
  const endTime = searchParams.get("endTime");

  if (!coin || !startTime) {
    return NextResponse.json(
      { error: "Missing coin or startTime" },
      { status: 400 }
    );
  }

  try {
    const data = await info.candleSnapshot({
      coin,
      interval,
      startTime: Number(startTime),
      endTime: endTime ? Number(endTime) : Date.now(),
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch candles" },
      { status: 500 }
    );
  }
}
