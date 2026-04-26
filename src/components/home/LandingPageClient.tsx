"use client";

import { Suspense, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import HomePage from "@/components/HomePage";
import { useAppConfig } from "@/context/AppConfigContext";

function LandingContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { whalesEnabled, factorsEnabled } = useAppConfig();

  const redirectHref = useMemo(() => {
    const tab = searchParams.get("tab");
    if (!tab) return null;

    const asset = searchParams.get("asset");
    const address = searchParams.get("address");

    switch (tab) {
      case "home":
        return "/";
      case "markets":
        return asset ? `/markets?asset=${encodeURIComponent(asset)}` : "/markets";
      case "portfolio":
        return "/portfolio";
      case "factors":
        if (!factorsEnabled) return "/markets";
        return "/factors";
      case "docs":
        return "/docs";
      case "whales":
        if (!whalesEnabled) return "/markets";
        return address ? `/whales/${address}` : "/whales";
      default:
        return null;
    }
  }, [factorsEnabled, searchParams, whalesEnabled]);

  useEffect(() => {
    if (!redirectHref) return;
    router.replace(redirectHref, { scroll: false });
  }, [redirectHref, router]);

  useEffect(() => {
    if (pathname !== "/") return;
    if (searchParams.toString() === "") return;
    if (redirectHref) return;
    router.replace("/", { scroll: false });
  }, [pathname, redirectHref, router, searchParams]);

  if (redirectHref) {
    return <div className="min-h-[60vh] bg-zinc-950" />;
  }

  return <HomePage />;
}

export default function LandingPageClient() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 text-zinc-100" />}>
      <LandingContent />
    </Suspense>
  );
}
