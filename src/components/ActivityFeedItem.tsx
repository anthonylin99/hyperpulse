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
  const count = entry.count ?? 1;

  return (
    <div
      className="px-3 py-1.5 border-b border-zinc-800/30 animate-fade-in"
      style={{ backgroundColor: style.bgColor }}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <p
            className="text-[11px] font-mono leading-relaxed"
            style={{ color: style.color }}
          >
            {entry.message}
          </p>
          {count > 1 && (
            <span className="mt-0.5 inline-flex items-center rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono text-zinc-400">
              x{count}
            </span>
          )}
        </div>
        <span className="text-[9px] font-mono text-zinc-600 whitespace-nowrap flex-shrink-0">
          {relativeTime(entry.timestamp)}
        </span>
      </div>
    </div>
  );
}
