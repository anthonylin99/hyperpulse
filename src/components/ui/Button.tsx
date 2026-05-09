import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent/15 text-accent ring-1 ring-accent/40 hover:bg-accent/25",
  secondary: "bg-zinc-900/70 text-zinc-200 ring-1 ring-zinc-800 hover:bg-zinc-800/80",
  ghost: "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100",
};

const SIZE: Record<Size, string> = {
  sm: "px-2 py-1 text-xs",
  md: "px-3 py-1.5 text-xs",
  lg: "px-4 py-2 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", size = "md", className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className || "",
      )}
    />
  );
});
