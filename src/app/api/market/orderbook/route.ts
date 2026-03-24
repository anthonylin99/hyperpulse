import { NextResponse } from "next/server";
import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

const transport = new HttpTransport({ isTestnet: false });
const info = new InfoClient({ transport });

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const coin = searchParams.get("coin");

  if (!coin) {
    return NextResponse.json({ error: "Missing coin" }, { status: 400 });
  }

  try {
    const data = await info.l2Book({ coin });
    if (!data) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    const bids = data.levels[0].map((level) => ({
      px: parseFloat(level.px),
      sz: parseFloat(level.sz),
      n: level.n,
    }));
    const asks = data.levels[1].map((level) => ({
      px: parseFloat(level.px),
      sz: parseFloat(level.sz),
      n: level.n,
    }));

    const bestBid = bids.length > 0 ? bids[0].px : null;
    const bestAsk = asks.length > 0 ? asks[0].px : null;
    const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;
    const spreadBps =
      spread != null && bestAsk != null && bestBid != null
        ? (spread / ((bestAsk + bestBid) / 2)) * 10_000
        : null;

    return NextResponse.json({
      coin: data.coin,
      time: data.time,
      bestBid,
      bestAsk,
      spread,
      spreadBps,
      bids: bids.slice(0, 8),
      asks: asks.slice(0, 8),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch order book" },
      { status: 500 }
    );
  }
}
