"use client";

import Image from "next/image";
import { cn } from "@/lib/format";

export default function BrandLogo({
  className,
  markClassName,
  textClassName,
  stacked = false,
  compact = false,
  markOnly = false,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  stacked?: boolean;
  compact?: boolean;
  markOnly?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center",
        stacked ? "flex-col gap-3" : "gap-3",
        className,
      )}
    >
      <Image
        src="/brand/hyperpulse-mark.svg"
        alt="HyperPulse mark"
        width={512}
        height={512}
        className={cn("shrink-0", compact ? "h-8 w-8" : "h-9 w-9", markClassName)}
      />
      {!markOnly ? (
        <Image
          src="/brand/hyperpulse-lockup.svg"
          alt="HyperPulse"
          width={760}
          height={168}
          className={cn(
            "w-auto",
            compact ? "h-6" : "h-7",
            textClassName,
          )}
        />
      ) : null}
    </div>
  );
}
