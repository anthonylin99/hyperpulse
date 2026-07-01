import TradeCopilotMockupPage from "@/components/mockups/TradeCopilotMockupPage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Setup Desk Mockup - HyperPulse",
  description:
    "A HyperPulse setup desk mockup with ranked trades, hard triggers, stops, targets, and invalidation.",
  path: "/mockups/trade-copilot",
});

export default function TradeCopilotMockupRoute() {
  return <TradeCopilotMockupPage />;
}
