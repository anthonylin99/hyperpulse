import HypeTokenRoutePage from "@/components/hype/HypeTokenRoutePage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "HYPE Token — HyperPulse",
  description:
    "A dedicated HYPE token workspace for Hyperliquid-native levels, funding, open interest, and fundamentals-adjacent exchange usage context.",
  path: "/hype",
});

export default function HypePage() {
  return <HypeTokenRoutePage />;
}
