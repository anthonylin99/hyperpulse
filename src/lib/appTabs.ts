export type AppTabKey = "markets" | "factors" | "whales" | "portfolio" | "docs";

export const APP_TABS: Array<{ key: AppTabKey; label: string; href: string; match: string[] }> = [
  { key: "markets", label: "Markets", href: "/markets", match: ["/markets"] },
  { key: "factors", label: "Factors", href: "/factors", match: ["/factors"] },
  { key: "whales", label: "Whales", href: "/whales", match: ["/whales"] },
  { key: "portfolio", label: "Portfolio", href: "/portfolio", match: ["/portfolio"] },
  { key: "docs", label: "Docs", href: "/docs", match: ["/docs"] },
];
