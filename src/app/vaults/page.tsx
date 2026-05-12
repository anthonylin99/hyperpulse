import VaultsRoutePage from "@/components/vaults/VaultsRoutePage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Vaults — HyperPulse",
  description:
    "Ranked Hyperliquid vault analytics — risk-adjusted returns, drawdowns, strategy fingerprints, and operator track records.",
  path: "/vaults",
});

export default function VaultsPage() {
  return <VaultsRoutePage />;
}
