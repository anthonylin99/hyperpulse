"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format";

type ButtonTone = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

const BUTTON_TONE_STYLES: Record<ButtonTone, string> = {
  primary:
    "border-emerald-500/30 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/18 hover:border-emerald-400/40",
  secondary:
    "border-zinc-800 bg-zinc-950/70 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100",
  ghost: "border-transparent bg-transparent text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-100",
};

const BUTTON_SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "rounded-xl px-3 py-2 text-xs",
  md: "rounded-xl px-4 py-2.5 text-sm",
};

export function SurfaceButton({
  children,
  className,
  tone = "secondary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 border font-medium transition-colors disabled:pointer-events-none disabled:opacity-60",
        BUTTON_TONE_STYLES[tone],
        BUTTON_SIZE_STYLES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function FilterChip({
  label,
  active = false,
  onClick,
  className,
}: {
  label: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors",
        active
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700",
        className,
      )}
    >
      {label}
    </button>
  );
}

export function IconActionButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/70 text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SectionEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[11px] uppercase tracking-[0.18em] text-zinc-500", className)}>{children}</div>;
}

export function CompactStat({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: "neutral" | "green" | "amber";
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 px-3 py-3">
      <SectionEyebrow>{label}</SectionEyebrow>
      <div
        className={cn(
          "mt-2 font-mono text-lg",
          tone === "green" && "text-emerald-300",
          tone === "amber" && "text-amber-300",
          tone === "neutral" && "text-zinc-100",
        )}
      >
        {value}
      </div>
      {helper ? <div className="mt-1 text-xs text-zinc-500">{helper}</div> : null}
    </div>
  );
}
