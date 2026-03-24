"use client";

import { Activity } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import ActivityFeedItem from "./ActivityFeedItem";

export default function ActivityFeed() {
  const { activityFeed } = useMarket();

  const hasActivity = activityFeed.length > 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 flex-shrink-0">
        <div
          className="live-dot"
          style={{
            width: 6,
            height: 6,
            background: hasActivity ? "#22c55e" : "#71717a",
          }}
        />
        <span className="text-xs uppercase tracking-wider text-zinc-500 font-sans">
          Activity Feed
        </span>
        {activityFeed.length > 0 && (
          <span className="text-[10px] font-mono text-zinc-600">
            ({activityFeed.length})
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {activityFeed.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-4 h-full">
            <div className="text-center">
              <Activity className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-600 font-sans">
                Monitoring for whale trades, liquidations, and OI spikes...
              </p>
            </div>
          </div>
        ) : (
          activityFeed.map((entry) => (
            <ActivityFeedItem key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}
