import { ReactNode, HTMLAttributes } from "react";
import { cn } from "@/lib/format";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  density?: "default" | "compact";
  children?: ReactNode;
};

export function Card({ density = "default", className, children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-lg border border-zinc-800 bg-zinc-900/60",
        density === "compact" ? "p-3" : "p-4",
        className || "",
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("mb-3 flex items-start justify-between gap-2", className || "")}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 {...rest} className={cn("text-heading text-zinc-100", className || "")}>
      {children}
    </h3>
  );
}

export function CardContent({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn(className || "")}>
      {children}
    </div>
  );
}
