import AgentDevPage from "@/components/agent/AgentDevPage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Agent Dev — HyperPulse",
  description:
    "Dev-only HyperPulse agent workspace for alert-to-trade recommendations and paper tracking.",
  path: "/agent",
});

export default function AgentPage() {
  return <AgentDevPage />;
}
