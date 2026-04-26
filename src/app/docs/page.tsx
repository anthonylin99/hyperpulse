import DocsPage from "@/components/docs/DocsPage";
import { buildRouteMetadata } from "@/lib/site";

export const metadata = buildRouteMetadata({
  title: "Docs — HyperPulse",
  description:
    "Read the methodology, public demo posture, and implementation notes behind HyperPulse markets and portfolio analytics.",
  path: "/docs",
});

export default function DocsRoutePage() {
  return <DocsPage />;
}
