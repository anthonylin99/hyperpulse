import { ReactNode } from "react";
import { cn } from "@/lib/format";

type State = "neutral" | "success" | "danger" | "warning";

const STATE_TEXT: Record<State, string> = {
  neutral: "text-zinc-100",
  success: "text-emerald-400",
  danger: "text-red-400",
  warning: "text-rose-400",
};

export type StatTileProps = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  state?: State;
  tooltip?: string;
  size?: "default" | "lg";
  className?: string;
};

export function StatTile({
  label,
  value,
  sub,
  state = "neutral",
  tooltip,
  size = "default",
  className,
}: StatTileProps) {
  return (
    <div
      title={tooltip}
      className={cn(
        "rounded-lg border border-zinc-800 bg-zinc-900/60 p-4",
        className || "",
      )}
    >
      <div className="label mb-1">{label}</div>
      <div
        className={cn(
          "tabular-nums",
          size === "lg" ? "text-stat-lg" : "text-stat",
          STATE_TEXT[state],
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}
