import SignalsPage from "@/components/signals/SignalsPage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Intel — HyperPulse",
  description:
    "A unified Hyperliquid-native intelligence feed for market radar, momentum alerts, Reaction Map context, top movers, and vault operator watches.",
  path: "/signals",
});

export default function SignalsRoutePage() {
  return <SignalsPage />;
}
