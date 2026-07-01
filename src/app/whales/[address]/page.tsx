import Link from "next/link";
import { buildRouteMetadata } from "@/lib/site";
import WhalesRoutePage from "@/components/whales/WhalesRoutePage";

export const metadata = buildRouteMetadata({
  title: "Wallet Detail — HyperPulse",
  description:
    "HyperPulse tracked wallet detail view for public Hyperliquid exposure and PnL context.",
  path: "/whales",
});

export default async function WhaleProfileRoutePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return (
    <div>
      <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-xs text-zinc-400">
        Wallet detail opens from the tracked leaderboard.{" "}
        <Link href="/whales" className="text-teal-300 underline decoration-teal-400/40 underline-offset-4">
          Return to Whales
        </Link>
        .
      </div>
      <WhalesRoutePage initialAddress={address} />
    </div>
  );
}
