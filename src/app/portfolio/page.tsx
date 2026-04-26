import PortfolioRoutePage from "@/components/routes/PortfolioRoutePage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Portfolio — HyperPulse",
  description:
    "Review a Hyperliquid wallet in read-only mode with performance charts, open positions, and a cleaner trade journal.",
  path: "/portfolio",
});

export default function PortfolioPage() {
  return <PortfolioRoutePage />;
}
