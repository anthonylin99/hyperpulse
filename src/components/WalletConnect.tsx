"use client";

import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { truncateAddress, formatUSD } from "@/lib/format";
import WalletModal from "./WalletModal";

export default function WalletConnect() {
  const { isConnected, address, accountState, isReadOnly } = useWallet();
  const [showModal, setShowModal] = useState(false);
  const buyingPower = accountState?.withdrawable ?? 0;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        aria-haspopup="dialog"
        aria-expanded={showModal}
        className="flex min-w-0 items-center gap-2 rounded-full border border-[#24786d]/60 bg-[#0f1a1e]/55 px-3 py-1.5 text-[11px] font-mono text-[#b8d8d2] transition-colors hover:border-[#7dd4c4]/70 hover:bg-[#7dd4c4]/10 hover:text-white"
      >
        <div
          className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-400" : "bg-zinc-500"}`}
        />
        <span className="text-[#d7efe9]">
          {isConnected && address ? truncateAddress(address) : "Wallet"}
        </span>
        <span className="text-zinc-500">
          {isConnected ? (isReadOnly ? "Read-only" : formatUSD(buyingPower, 0)) : "Connect"}
        </span>
      </button>
      {showModal && <WalletModal onClose={() => setShowModal(false)} />}
    </>
  );
}
