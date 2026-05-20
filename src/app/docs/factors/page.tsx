import FactorReportPage from "@/components/docs/FactorReportPage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Market Pulse Share Card — HyperPulse",
  description: "A share-ready HyperPulse market pulse card for tracked Hyperliquid perps, with winners, losers, themes, relative strength, and volume confirmation.",
  path: "/docs/factors",
});

export default function DocsFactorReportRoute() {
  return <FactorReportPage />;
}
