import FactorReportPage from "@/components/docs/FactorReportPage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Biweekly Market Brief — HyperPulse",
  description: "HyperPulse market brief for tracked Hyperliquid perps, with theme rankings, catalyst notes, and direct asset links.",
  path: "/docs/factors",
});

export default function DocsFactorReportRoute() {
  return <FactorReportPage />;
}
