import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary: "btn btn-ink",
  ghost: "bg-transparent text-fg hover:bg-surface-2 disabled:opacity-40",
  outline:
    "border border-fg/25 bg-transparent text-fg hover:border-fg hover:bg-surface disabled:opacity-40",
  danger: "bg-danger text-bg hover:opacity-90 disabled:opacity-40",
};

const sizes = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
  icon: "size-11 p-0",
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
        "inline-flex items-center justify-center gap-2 rounded-xs font-medium tracking-wide transition-[color,background-color,border-color,opacity] duration-150 ease-smooth enabled:active:translate-y-px",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
