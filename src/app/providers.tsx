"use client";

import { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { Toaster } from "react-hot-toast";
import { MarketProvider } from "@/context/MarketContext";
import { FactorProvider } from "@/context/FactorContext";
import { WalletProvider } from "@/context/WalletContext";
import { PortfolioProvider } from "@/context/PortfolioContext";

export default function Providers({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const allowEmbeddedWallets =
    process.env.NEXT_PUBLIC_PRIVY_ALLOW_EMBEDDED === "true";

  const content = (
    <MarketProvider>
      <FactorProvider>
        <WalletProvider>
          <PortfolioProvider>
            {children}
          </PortfolioProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#18181b",
                color: "#fafafa",
                border: "1px solid #27272a",
                fontSize: "13px",
              },
            }}
          />
        </WalletProvider>
      </FactorProvider>
    </MarketProvider>
  );

  if (!appId) {
    return content;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email"],
        appearance: {
          walletChainType: "ethereum-only",
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: allowEmbeddedWallets
              ? "users-without-wallets"
              : "off",
          },
        },
      }}
    >
      {content}
    </PrivyProvider>
  );
}
