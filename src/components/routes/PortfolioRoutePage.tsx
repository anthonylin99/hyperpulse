"use client";

import ConnectPrompt from "@/components/portfolio/ConnectPrompt";
import PortfolioWorkspace from "@/components/portfolio/PortfolioWorkspace";
import { useWallet } from "@/context/WalletContext";

export default function PortfolioRoutePage() {
  const { isConnected } = useWallet();

  return isConnected ? <PortfolioWorkspace /> : <ConnectPrompt />;
}
