import SentimentReportPage from "@/components/docs/SentimentReportPage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Retail Sentiment Index — HyperPulse",
  description: "A weekly HyperPulse public-flow proxy for inferred long and short sentiment across tracked Hyperliquid perps.",
  path: "/docs/sentiment",
});

export default function DocsSentimentRoutePage() {
  return <SentimentReportPage />;
}
