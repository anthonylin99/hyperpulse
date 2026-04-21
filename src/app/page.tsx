"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import HomePage from "@/components/HomePage";
import MarketOverviewPanel from "@/components/MarketOverviewPanel";
import ConnectPrompt from "@/components/portfolio/ConnectPrompt";
import PortfolioWorkspace from "@/components/portfolio/PortfolioWorkspace";
import DocsPage from "@/components/docs/DocsPage";
import FactorsPage from "@/components/factors/FactorsPage";
import MarketTable from "@/components/MarketTable";
import TradeDrawer from "@/components/TradeDrawer";
import { useAppConfig } from "@/context/AppConfigContext";
import { useMarket } from "@/context/MarketContext";
import { useWallet } from "@/context/WalletContext";
import { cn } from "@/lib/format";

type Tab = "home" | "portfolio" | "markets" | "factors" | "whales" | "docs";

const APP_TABS: Array<{ key: Tab; label: string }> = [
  { key: "home", label: "Home" },
  { key: "portfolio", label: "Portfolio" },
  { key: "markets", label: "Markets" },
  { key: "factors", label: "Factors" },
  { key: "whales", label: "Whales" },
  { key: "docs", label: "Docs" },
];

function HomeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { tradingEnabled } = useAppConfig();
  const { isConnected } = useWallet();
  const { selectedAsset, setSelectedAsset, error: marketError } = useMarket();
  const requestedTab = useMemo(() => {
    const raw = searchParams.get("tab");
    return APP_TABS.some((tab) => tab.key === raw) ? (raw as Tab) : null;
  }, [searchParams]);
  const requestedAsset = searchParams.get("asset");
  const requestedAddress = searchParams.get("address");
  const [tab, setTab] = useState<Tab>(requestedTab === "whales" ? "home" : requestedTab ?? "home");
  const [tradeDrawer, setTradeDrawer] = useState<{
    coin: string;
    direction: "long" | "short";
  } | null>(null);

  useEffect(() => {
    if (requestedTab && requestedTab !== "whales" && requestedTab !== tab) {
      setTab(requestedTab);
    }
  }, [requestedTab, tab]);

  useEffect(() => {
    if (requestedTab === "whales") {
      router.replace(requestedAddress ? `/whales/${requestedAddress}` : "/whales", {
        scroll: false,
      });
      return;
    }
  }, [requestedAddress, requestedTab, router]);

  useEffect(() => {
    if (!requestedAsset) return;
    setSelectedAsset(requestedAsset.toUpperCase());
  }, [requestedAsset, setSelectedAsset]);

  const handleTabChange = (nextTab: Tab) => {
    if (nextTab === "whales") {
      router.push("/whales");
      return;
    }
    setTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    params.delete("address");
    if (nextTab !== "markets") params.delete("asset");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Nav />

      <div className="border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="inline-flex flex-wrap gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-1.5">
            {APP_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                className={cn(
                  "rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                  tab === t.key
                    ? "bg-teal-500/12 text-zinc-50 shadow-[0_0_0_1px_rgba(45,212,191,0.14)]"
                    : "text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "home" ? (
        <HomePage onSelectTab={handleTabChange} />
      ) : tab === "portfolio" ? (
        !isConnected ? (
          <ConnectPrompt />
        ) : (
          <PortfolioWorkspace />
        )
      ) : tab === "markets" ? (
        <>
          <div className="max-w-7xl mx-auto px-4 py-6 pb-20 space-y-6">
            {marketError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                Failed to fetch market data — retrying...
              </div>
            )}

            <MarketOverviewPanel
              title="Markets"
              description="A unified view of tomorrow bias, factor regime context, and benchmark perps before you scan the full market table."
            />

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/75 overflow-hidden">
              <div className="border-b border-zinc-800 bg-zinc-950/50 px-5 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Market Directory
                </div>
                <div className="mt-2 text-lg font-semibold text-zinc-100">
                  Search, filter, and inspect Hyperliquid perps and HIP-3 spot markets.
                </div>
                <div className="mt-1 text-sm text-zinc-400">
                  The market table below stays interactive, but now sits inside the same app shell as the rest of HyperPulse.
                </div>
              </div>
              <MarketTable
                selectedAsset={selectedAsset}
                onSelectAsset={setSelectedAsset}
                onTrade={(coin, direction) =>
                  tradingEnabled ? setTradeDrawer({ coin, direction }) : null
                }
              />
            </section>
          </div>

          {tradeDrawer && tradingEnabled && (
            <TradeDrawer
              coin={tradeDrawer.coin}
              direction={tradeDrawer.direction}
              onClose={() => setTradeDrawer(null)}
            />
          )}
        </>
      ) : tab === "factors" ? (
        <FactorsPage />
      ) : (
        <DocsPage />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 text-zinc-100" />}>
      <HomeContent />
    </Suspense>
  );
}
