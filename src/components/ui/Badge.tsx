import { ReactNode } from "react";
import { cn } from "@/lib/format";

type Variant = "accent" | "success" | "danger" | "warning" | "neutral";

const VARIANT: Record<Variant, string> = {
  accent: "bg-accent/10 text-accent ring-accent/30",
  success: "bg-emerald-400/10 text-emerald-400 ring-emerald-400/30",
  danger: "bg-red-400/10 text-red-400 ring-red-400/30",
  warning: "bg-rose-400/10 text-rose-400 ring-rose-400/30",
  neutral: "bg-zinc-800/60 text-zinc-300 ring-zinc-700",
};

type Props = {
  variant?: Variant;
  children: ReactNode;
  className?: string;
};

export function Badge({ variant = "neutral", children, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ring-1 ring-inset",
        VARIANT[variant],
        className || "",
      )}
    >
      {children}
    </span>
  );
}
