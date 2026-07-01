import WhalesRoutePage from "@/components/whales/WhalesRoutePage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Whales — HyperPulse",
  description:
    "Tracked Hyperliquid wallet leaderboard for public account value, exposure, leverage, directional bias, and PnL windows.",
  path: "/whales",
});

export default function WhalesPage() {
  return <WhalesRoutePage />;
}
