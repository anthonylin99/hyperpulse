export type AppTabKey = "home" | "markets" | "alerts" | "agent" | "factors" | "portfolio" | "vaults" | "docs";

export const APP_TABS: Array<{ key: AppTabKey; label: string; href: string; match: string[] }> = [
  { key: "home", label: "Home", href: "/", match: ["/"] },
  { key: "markets", label: "Markets", href: "/markets", match: ["/markets"] },
  { key: "alerts", label: "Alerts", href: "/alerts", match: ["/alerts"] },
  { key: "agent", label: "Agent", href: "/agent", match: ["/agent"] },
  { key: "factors", label: "Factors", href: "/factors", match: ["/factors"] },
  { key: "portfolio", label: "Portfolio", href: "/portfolio", match: ["/portfolio"] },
  { key: "vaults", label: "Vaults", href: "/vaults", match: ["/vaults"] },
  { key: "docs", label: "Docs", href: "/docs", match: ["/docs"] },
];
