"use client";

import { useState } from "react";
import { Wallet2 } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { cn, truncateAddress } from "@/lib/format";
import WalletModal from "./WalletModal";

export default function WalletConnect() {
  const { isConnected, address, isReadOnly } = useWallet();
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        aria-haspopup="dialog"
        aria-expanded={showModal}
        className={cn(
          "inline-flex min-w-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm transition-colors",
          isConnected
            ? "border-zinc-800 bg-zinc-900/80 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900"
            : "border-emerald-500/20 bg-emerald-400 text-[#051b16] hover:bg-emerald-300",
        )}
      >
        {isConnected ? <span className="h-2 w-2 rounded-full bg-emerald-400" /> : <Wallet2 className="h-4 w-4" />}
        <span className="truncate font-medium">
          {isConnected && address ? truncateAddress(address) : "Connect Wallet"}
        </span>
        {isConnected ? (
          <span className="text-xs text-zinc-500">
            {isReadOnly ? "Read-only" : "Trading"}
          </span>
        ) : null}
      </button>
      {showModal && <WalletModal onClose={() => setShowModal(false)} />}
    </>
  );
}
