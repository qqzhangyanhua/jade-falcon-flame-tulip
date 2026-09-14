import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-border bg-bg px-3 text-base text-fg outline-none placeholder:text-subtle focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}
