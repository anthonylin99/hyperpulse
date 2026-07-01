import SignalsPage from "@/components/signals/SignalsPage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Intel — HyperPulse",
  description:
    "A Hyperliquid setup board for daily calls, momentum flags, reaction levels, movers, and wallet watches.",
  path: "/signals",
});

export default function SignalsRoutePage() {
  return <SignalsPage />;
}
