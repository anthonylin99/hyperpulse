import type { MetadataRoute } from "next";
import { getPublicAppRoutes, getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();

  return getPublicAppRoutes().map((route) => ({
    url: new URL(route.path, siteUrl).toString(),
    lastModified: now,
    changeFrequency: route.path === "/" ? "weekly" : "daily",
    priority: route.path === "/" ? 1 : 0.8,
  }));
}
