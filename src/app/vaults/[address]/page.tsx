import VaultDetailPage from "@/components/vaults/VaultDetailPage";
import { buildRouteMetadata } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return buildRouteMetadata({
    title: `Vault ${short} — HyperPulse`,
    description:
      "Hyperliquid vault detail — equity curve, drawdown, strategy fingerprint, and operator track record.",
    path: `/vaults/${address}`,
  });
}

export default async function VaultDetailRoute({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <VaultDetailPage address={address} />;
}
