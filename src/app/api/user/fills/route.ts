import { NextRequest, NextResponse } from "next/server";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

const transport = new HttpTransport({ isTestnet: false });
const info = new InfoClient({ transport });

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const startTime = req.nextUrl.searchParams.get("startTime");
  const aggregateByTime =
    req.nextUrl.searchParams.get("aggregateByTime") === "true";

  try {
    // Use userFillsByTime if startTime provided (for historical data)
    // Otherwise use userFills (returns recent fills)
    let fills;
    if (startTime) {
      fills = await info.userFillsByTime({
        user: address as `0x${string}`,
        startTime: Number(startTime),
        aggregateByTime,
      });
    } else {
      fills = await info.userFills({
        user: address as `0x${string}`,
        aggregateByTime,
      });
    }
    return NextResponse.json(fills);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch fills" },
      { status: 500 },
    );
  }
}
