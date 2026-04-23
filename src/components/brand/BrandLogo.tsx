"use client";

import { cn } from "@/lib/format";

function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id="hyperpulse-brand-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="108" fill="url(#hyperpulse-brand-bg)" />
      <polyline
        points="80,280 160,280 200,280 230,160 270,360 310,200 340,320 370,250 400,280 432,280"
        fill="none"
        stroke="#ffffff"
        strokeWidth="36"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BrandLogo({
  className,
  markClassName,
  textClassName,
  stacked = false,
  compact = false,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  stacked?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center",
        stacked ? "flex-col gap-3" : "gap-3",
        className,
      )}
    >
      <BrandMark className={cn(compact ? "h-8 w-8" : "h-9 w-9", markClassName)} />
      <div
        className={cn(
          "font-geist-sans leading-none tracking-tight",
          stacked ? "text-center" : "",
          compact ? "text-[24px] font-semibold" : "text-[28px] font-semibold",
          textClassName,
        )}
      >
        <span className="text-white">Hyper</span>
        <span className="text-[#66e0cc]">Pulse</span>
      </div>
    </div>
  );
}
