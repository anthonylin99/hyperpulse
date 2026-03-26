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

  const startTime = Number(req.nextUrl.searchParams.get("startTime") || Date.now() - 90 * 24 * 60 * 60 * 1000);
  const endTime = req.nextUrl.searchParams.get("endTime");

  try {
    const params: Record<string, unknown> = {
      user: address as `0x${string}`,
      startTime,
    };
    if (endTime) params.endTime = Number(endTime);

    const ledger = await info.userNonFundingLedgerUpdates(
      params as Parameters<typeof info.userNonFundingLedgerUpdates>[0],
    );
    return NextResponse.json(ledger);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch ledger" },
      { status: 500 },
    );
  }
}
