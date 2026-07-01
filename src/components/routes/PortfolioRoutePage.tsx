"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpenCheck } from "lucide-react";
import DailySetupPanel from "@/components/DailySetupPanel";
import ConnectPrompt from "@/components/portfolio/ConnectPrompt";
import PortfolioWorkspace from "@/components/portfolio/PortfolioWorkspace";
import ShadowBookPanel from "@/components/portfolio/ShadowBookPanel";
import { useWallet } from "@/context/WalletContext";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function StandaloneShadowBook() {
  return (
    <div className="mx-auto max-w-[1240px] space-y-5 px-1 py-2">
      <section className="rounded-lg border border-teal-300/15 bg-[linear-gradient(180deg,rgba(10,18,22,0.98),rgba(7,10,14,0.98))] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-teal-300">
              <BookOpenCheck className="h-4 w-4" />
              Shadow Book
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-[2rem]">
              Paper trades, graded locally.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-zinc-400">
              Stage the idea, mark the trigger, and review the outcome beside your wallet later.
            </p>
          </div>
          <span className="rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1.5 text-xs font-medium text-teal-100">
            Paper only
          </span>
        </div>
      </section>

      <ShadowBookPanel />
    </div>
  );
}

function PortfolioRouteContent() {
  const searchParams = useSearchParams();
  const { address, connectReadOnly, isConnected, loading } = useWallet();
  const attemptedAddressRef = useRef<string | null>(null);
  const isShadowSection = searchParams.get("section") === "shadow";

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

  if (isShadowSection && !isConnected) {
    return <StandaloneShadowBook />;
  }

  if (loading && !isConnected) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-8 text-sm text-zinc-400">
        Loading wallet review...
      </div>
    );
  }

  return isConnected ? (
    <PortfolioWorkspace />
  ) : (
    <div className="space-y-5">
      <DailySetupPanel compact />
      <ConnectPrompt />
    </div>
  );
}

export default function PortfolioRoutePage() {
  return (
    <Suspense fallback={<div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-8 text-sm text-zinc-400">Loading portfolio...</div>}>
      <PortfolioRouteContent />
    </Suspense>
  );
}
