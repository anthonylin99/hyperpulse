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

  try {
    const [perpState, spotState] = await Promise.all([
      info.clearinghouseState({ user: address as `0x${string}` }),
      info.spotClearinghouseState({ user: address as `0x${string}` }),
    ]);
    return NextResponse.json({ perpState, spotState });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch state" },
      { status: 500 },
    );
  }
}
