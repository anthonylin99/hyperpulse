import AlertsPage from "@/components/alerts/AlertsPage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Alerts — HyperPulse",
  description: "Review timestamped HyperPulse momentum alerts with alert price, current price, and return since signal.",
  path: "/alerts",
});

export default function AlertsRoutePage() {
  return <AlertsPage />;
}
