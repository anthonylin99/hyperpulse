import WorldPulsePage from "@/components/world/WorldPulsePage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "World App Beta — HyperPulse",
  description:
    "A mobile-first, read-only Hyperliquid momentum and vault pulse built for World App feedback.",
  path: "/world",
});

export default function WorldPage() {
  return <WorldPulsePage />;
}
