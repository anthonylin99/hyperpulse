"use client";

import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { truncateAddress, formatUSD } from "@/lib/format";
import WalletModal from "./WalletModal";

export default function WalletConnect() {
  const { isConnected, address, accountState, disconnect } = useWallet();
  const [showModal, setShowModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  if (!isConnected) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className="px-2.5 py-1 text-[11px] font-mono rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
        >
          Connect Wallet
        </button>
        {showModal && <WalletModal onClose={() => setShowModal(false)} />}
      </>
    );
  }

  const buyingPower = accountState?.withdrawable ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-colors"
      >
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span>{truncateAddress(address!)}</span>
        <span className="text-zinc-500">|</span>
        <span className="text-green-400">{formatUSD(buyingPower, 0)}</span>
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 top-full mt-1 w-40 bg-zinc-900 border border-zinc-700 rounded shadow-lg z-50">
            <button
              onClick={() => {
                disconnect();
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-zinc-800 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
