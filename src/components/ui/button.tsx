import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary:
    "bg-accent text-accent-fg hover:opacity-90 disabled:opacity-40",
  ghost:
    "bg-transparent text-fg hover:bg-surface-2 disabled:opacity-40",
  outline:
    "border border-border bg-transparent text-fg hover:bg-surface-2 disabled:opacity-40",
  danger:
    "bg-danger text-fg hover:opacity-90 disabled:opacity-40",
};

const sizes = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium tracking-tight transition-opacity duration-150 active:scale-[0.98]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
