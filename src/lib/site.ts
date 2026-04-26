import type { Metadata } from "next";
import { isFactorsEnabled, isTradingEnabled, isWhalesEnabled } from "@/lib/appConfig";

const DEFAULT_SITE_URL = "https://hyperpulse-gold.vercel.app";
const DEFAULT_OG_IMAGE = "/opengraph-image";
const DEFAULT_TWITTER_IMAGE = "/twitter-image";

function normalizeUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
}

export function getSiteUrl() {
  const direct =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;

  return normalizeUrl(direct || DEFAULT_SITE_URL);
}

export function getPublicAppRoutes() {
  const routes = [
    { path: "/", label: "Home" },
    { path: "/markets", label: "Markets" },
    { path: "/portfolio", label: "Portfolio" },
    { path: "/docs", label: "Docs" },
  ];

  if (isFactorsEnabled()) {
    routes.push({ path: "/factors", label: "Factors" });
  }

  if (isWhalesEnabled()) {
    routes.push({ path: "/whales", label: "Whales" });
  }

  return routes;
}

export function getBuildStamp() {
  return (
    process.env.NEXT_PUBLIC_BUILD_ID ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    null
  );
}

export function getDeploymentLabel() {
  return isTradingEnabled() ? "Trading enabled" : "Read-only demo";
}

export function buildRouteMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const siteUrl = getSiteUrl();
  const url = new URL(path, siteUrl).toString();

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "HyperPulse",
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_TWITTER_IMAGE],
    },
  };
}
