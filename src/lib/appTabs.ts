export type AppTabKey =
  | "home"
  | "markets"
  | "signals"
  | "alerts"
  | "agent"
  | "factors"
  | "hype"
  | "portfolio"
  | "whales"
  | "vaults"
  | "docs";

export const APP_TABS: Array<{ key: AppTabKey; label: string; href: string; match: string[] }> = [
  { key: "home", label: "Home", href: "/", match: ["/"] },
  { key: "markets", label: "Markets", href: "/markets", match: ["/markets"] },
  { key: "signals", label: "Intel", href: "/signals", match: ["/signals"] },
  { key: "alerts", label: "Alerts", href: "/alerts", match: ["/alerts"] },
  { key: "agent", label: "Agent", href: "/agent", match: ["/agent"] },
  { key: "factors", label: "Factors", href: "/factors", match: ["/factors"] },
  { key: "hype", label: "HYPE", href: "/hype", match: ["/hype"] },
  { key: "portfolio", label: "Portfolio", href: "/portfolio", match: ["/portfolio"] },
  { key: "whales", label: "Whales", href: "/whales", match: ["/whales"] },
  { key: "vaults", label: "Vaults", href: "/vaults", match: ["/vaults"] },
  { key: "docs", label: "Docs", href: "/docs", match: ["/docs"] },
];
