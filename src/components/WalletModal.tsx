"use client";

import { useState } from "react";
import { X, Key } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { IS_TESTNET } from "@/lib/hyperliquid";

interface WalletModalProps {
  onClose: () => void;
}

export default function WalletModal({ onClose }: WalletModalProps) {
  const { connect, connectWithBrowserWallet, loading } = useWallet();
  const [apiKey, setApiKey] = useState("");
  const [mainAddress, setMainAddress] = useState("");
  const [error, setError] = useState("");
  const [showManual, setShowManual] = useState(false);

  const trimmedApiKey = apiKey.trim();
  const trimmedMainAddress = mainAddress.trim();

  const handleConnect = async () => {
    if (!trimmedApiKey) {
      setError("Please enter your API wallet private key");
      return;
    }
    if (!trimmedMainAddress) {
      setError("Please enter your main wallet address");
      return;
    }

    const normalizedApiKey = trimmedApiKey.startsWith("0x")
      ? trimmedApiKey
      : `0x${trimmedApiKey}`;
    const addressOk = /^0x[a-fA-F0-9]{40}$/.test(trimmedMainAddress);
    const keyOk = /^0x[a-fA-F0-9]{64}$/.test(normalizedApiKey);

    if (!addressOk) {
      setError("Main wallet address must be a valid 42-character 0x hex");
      return;
    }
    if (!keyOk) {
      setError("API wallet private key must be a valid 64-byte hex string");
      return;
    }

    setError("");
    try {
      await connect(normalizedApiKey, trimmedMainAddress);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Connection failed — check your keys and try again";
      setError(message);
    }
  };

  const handleBrowserWalletConnect = async () => {
    setError("");
    try {
      await connectWithBrowserWallet();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Wallet connect failed. Please try again.";
      setError(message);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[440px] bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">Connect Wallet</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {IS_TESTNET ? "TESTNET" : "MAINNET"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div className="text-xs text-zinc-400 font-sans leading-relaxed space-y-2">
            <p>
              HyperPulse uses a Hyperliquid <strong>agent wallet</strong> for trading.
              It can place orders on your behalf but{" "}
              <strong>cannot withdraw funds</strong>.
            </p>
            <p className="text-zinc-500">
              Recommended: connect your browser wallet and sign one approval.
              HyperPulse will generate an agent key locally and keep it in this tab session.
            </p>
          </div>

          <button
            onClick={handleBrowserWalletConnect}
            disabled={loading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded transition-colors"
          >
            {loading ? "Connecting..." : "Connect Browser Wallet"}
          </button>

          <button
            onClick={() => setShowManual((v) => !v)}
            className="w-full py-2 text-xs text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-800 transition-colors"
          >
            {showManual ? "Hide Manual API Key Mode" : "Use Manual API Key Mode"}
          </button>

          {showManual && (
            <div className="space-y-3 border border-zinc-800 rounded p-3 bg-zinc-950/50">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block">
                  Main Wallet Address
                </label>
                <input
                  type="text"
                  placeholder="0x509292a... (your public address)"
                  value={mainAddress}
                  onChange={(e) => setMainAddress(e.target.value)}
                  className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded text-sm font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block">
                  API Wallet Private Key
                </label>
                <input
                  type="password"
                  placeholder="0x... (API wallet private key)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded text-sm font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <button
                onClick={handleConnect}
                disabled={loading || !trimmedApiKey || !trimmedMainAddress}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded transition-colors"
              >
                {loading ? "Connecting..." : "Connect with API Key"}
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800">
          <p className="text-[10px] text-zinc-600 text-center">
            {IS_TESTNET ? "Testnet only. " : ""}Not available to US persons. Use
            at your own risk.
          </p>
        </div>
      </div>
    </>
  );
}
