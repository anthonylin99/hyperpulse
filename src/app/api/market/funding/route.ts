import { NextResponse } from "next/server";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

const transport = new HttpTransport({ isTestnet: false });
const info = new InfoClient({ transport });

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const coin = searchParams.get("coin");
  const startTime = searchParams.get("startTime");
  const endTime = searchParams.get("endTime");

  if (!coin || !startTime || !endTime) {
    return NextResponse.json(
      { error: "Missing coin, startTime, or endTime" },
      { status: 400 }
    );
  }

  try {
    const data = await info.fundingHistory({
      coin,
      startTime: Number(startTime),
      endTime: Number(endTime),
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
