import LandingPageClient from "@/components/home/LandingPageClient";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "HyperPulse — Hyperliquid Setup Desk",
  description:
    "A Hyperliquid setup desk for live markets, wallet review, hard levels, and trade tracking.",
  path: "/",
});

export default function Home() {
  return <LandingPageClient />;
}
