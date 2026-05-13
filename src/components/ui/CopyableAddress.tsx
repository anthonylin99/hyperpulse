"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { cn, truncateAddress } from "@/lib/format";

export function CopyableAddress({
  address,
  className,
  showFull = false,
}: {
  address: string;
  className?: string;
  showFull?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success("Address copied");
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs text-zinc-300", className)}>
      <span>{showFull ? address : truncateAddress(address)}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="rounded p-0.5 text-zinc-500 transition hover:text-zinc-200"
        aria-label="Copy address"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}
