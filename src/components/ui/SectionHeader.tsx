import { ReactNode } from "react";
import { cn } from "@/lib/format";

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, subtitle, action, className }: Props) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className || "")}>
      <div>
        <h3 className="text-heading text-zinc-100">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
