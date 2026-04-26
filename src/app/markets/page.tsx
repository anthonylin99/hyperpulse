import MarketsRoutePage from "@/components/routes/MarketsRoutePage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Markets — HyperPulse",
  description:
    "Scan Hyperliquid perps with live prices, funding, and a table-first market directory built for public demos and daily trading review.",
  path: "/markets",
});

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const { asset } = await searchParams;
  return <MarketsRoutePage initialAsset={asset ?? null} />;
}
