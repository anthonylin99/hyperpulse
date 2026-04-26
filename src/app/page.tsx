import LandingPageClient from "@/components/home/LandingPageClient";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "HyperPulse — Hyperliquid-Native Market Intelligence",
  description:
    "A read-only Hyperliquid intelligence workspace for live markets, portfolio review, and shareable trading context.",
  path: "/",
});

export default function Home() {
  return <LandingPageClient />;
}
