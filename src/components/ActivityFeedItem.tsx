"use client";

import type { ActivityEntry } from "@/types";

interface ActivityFeedItemProps {
  entry: ActivityEntry;
}

function relativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TYPE_STYLES: Record<
  ActivityEntry["type"],
  { color: string; bgColor: string }
> = {
  liquidation: { color: "#ef4444", bgColor: "rgba(239, 68, 68, 0.08)" },
  whale: { color: "#f97316", bgColor: "rgba(249, 115, 22, 0.08)" },
  "oi-spike": { color: "#eab308", bgColor: "rgba(234, 179, 8, 0.08)" },
};

export default function ActivityFeedItem({ entry }: ActivityFeedItemProps) {
  const style = TYPE_STYLES[entry.type];

  return (
    <div
      className="px-4 py-2 border-b border-zinc-800/30 animate-fade-in"
      style={{ backgroundColor: style.bgColor }}
    >
      <div className="flex justify-between items-start gap-2">
        <p
          className="text-xs font-mono leading-relaxed flex-1"
          style={{ color: style.color }}
        >
          {entry.message}
        </p>
        <span className="text-[10px] font-mono text-zinc-600 whitespace-nowrap flex-shrink-0">
          {relativeTime(entry.timestamp)}
        </span>
      </div>
    </div>
  );
}
