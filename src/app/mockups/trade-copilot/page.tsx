import TradeCopilotMockupPage from "@/components/mockups/TradeCopilotMockupPage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Trade Copilot Mockup - HyperPulse",
  description:
    "A static concept mockup for a HyperPulse trade copilot that turns market intelligence into watchable setups with TP, SL, and invalidation.",
  path: "/mockups/trade-copilot",
});

export default function TradeCopilotMockupRoute() {
  return <TradeCopilotMockupPage />;
}
