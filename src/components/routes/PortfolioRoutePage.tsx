"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import ConnectPrompt from "@/components/portfolio/ConnectPrompt";
import PortfolioWorkspace from "@/components/portfolio/PortfolioWorkspace";
import { useWallet } from "@/context/WalletContext";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function PortfolioRouteContent() {
  const searchParams = useSearchParams();
  const { address, connectReadOnly, isConnected, loading } = useWallet();
  const attemptedAddressRef = useRef<string | null>(null);

  useEffect(() => {
    const queryAddress = searchParams.get("address")?.trim();
    if (!queryAddress || !ADDRESS_REGEX.test(queryAddress)) return;
    if (attemptedAddressRef.current?.toLowerCase() === queryAddress.toLowerCase()) return;
    if (address?.toLowerCase() === queryAddress.toLowerCase()) return;

    attemptedAddressRef.current = queryAddress;
    connectReadOnly(queryAddress).catch(() => {
      // WalletContext already surfaces the error toast; keep the route usable.
    });
  }, [address, connectReadOnly, searchParams]);

  if (loading && !isConnected) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-8 text-sm text-zinc-400">
        Loading read-only wallet analytics...
      </div>
    );
  }

  return isConnected ? <PortfolioWorkspace /> : <ConnectPrompt />;
}

export default function PortfolioRoutePage() {
  return (
    <Suspense fallback={<div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-8 text-sm text-zinc-400">Loading portfolio...</div>}>
      <PortfolioRouteContent />
    </Suspense>
  );
}
