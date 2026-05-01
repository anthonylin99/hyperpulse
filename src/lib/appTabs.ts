export type AppTabKey = "home" | "markets" | "whales" | "portfolio" | "docs";

export const APP_TABS: Array<{ key: AppTabKey; label: string; href: string; match: string[] }> = [
  { key: "home", label: "Home", href: "/", match: ["/"] },
  { key: "markets", label: "Markets", href: "/markets", match: ["/markets"] },
  { key: "whales", label: "Whales", href: "/whales", match: ["/whales"] },
  { key: "portfolio", label: "Portfolio", href: "/portfolio", match: ["/portfolio"] },
  { key: "docs", label: "Docs", href: "/docs", match: ["/docs"] },
];
