import StrategyMemoPage from "@/components/docs/StrategyMemoPage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Strategy Lab — HyperPulse",
  description: "A shadow-only HyperPulse strategy lab for the high-funding short reversal quant memo.",
  path: "/docs/strategy",
});

export default function DocsStrategyRoutePage() {
  return <StrategyMemoPage />;
}
