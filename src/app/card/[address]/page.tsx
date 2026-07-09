import type { Metadata } from "next";
import Link from "next/link";
import TradeReviewCardView from "@/components/card/TradeReviewCardView";
import { loadTradeReviewCard } from "@/lib/server/tradeReviewData";
import { formatSignedPct } from "@/lib/tradeReviewCard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) {
    return { title: "Trade Review · HyperPulse" };
  }
  let summary = "A Hyperliquid trade review.";
  try {
    const { card } = await loadTradeReviewCard(address);
    if (card) {
      summary = `${formatSignedPct(card.netReturnPct)} net return · ${card.winRatePct.toFixed(0)}% win rate · ${card.totalTrades} trades — “${card.verdict}”`;
    }
  } catch {
    // fall through to the generic summary
  }
  return {
    title: "Trade Review · HyperPulse",
    description: summary,
    twitter: { card: "summary_large_image", title: "Trade Review · HyperPulse", description: summary },
    openGraph: { title: "Trade Review · HyperPulse", description: summary },
  };
}

export default async function TradeReviewPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;

  if (!isAddress(address)) {
    return (
      <Shell>
        <EmptyState
          title="That doesn't look like a wallet"
          body="A trade review needs a valid Hyperliquid wallet address."
        />
      </Shell>
    );
  }

  let card = null;
  let hasTrades = false;
  try {
    const result = await loadTradeReviewCard(address);
    card = result.card;
    hasTrades = result.hasTrades;
  } catch {
    return (
      <Shell>
        <EmptyState
          title="Couldn't load this review"
          body="Hyperliquid didn't respond in time. Refresh in a moment."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      {card ? (
        <TradeReviewCardView card={card} />
      ) : (
        <EmptyState
          title={hasTrades ? "Nothing to review yet" : "No closed trades yet"}
          body="Once this wallet has closed some Hyperliquid perp trades, its review will appear here."
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12">
      {children}
      <Link href="/" className="mt-8 text-xs text-zinc-600 transition-colors hover:text-zinc-400">
        Powered by HyperPulse · hyperpulsehl.com
      </Link>
    </main>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-zinc-800 bg-zinc-950/90 p-8 text-center">
      <div className="mb-3 flex justify-center">
        <span className="h-3 w-3 rounded-full bg-teal-400 shadow-[0_0_16px_rgba(45,212,191,0.6)]" />
      </div>
      <h1 className="text-xl font-bold text-zinc-100">{title}</h1>
      <p className="mt-2 text-sm text-zinc-400">{body}</p>
      <Link
        href="/portfolio"
        className="mt-5 inline-block rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400"
      >
        Build your trade review
      </Link>
    </div>
  );
}
