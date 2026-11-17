import { cn } from "@/lib/utils";

export function KeystoneMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path fill="currentColor" d="M2 1.5h12L12.1 14.5H3.9z" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="grid size-7 place-items-center rounded-md bg-surface-2 text-fg shadow-border">
        <KeystoneMark className="size-3.5" />
      </span>
      <span className="text-sm font-medium tracking-tight text-fg">Keystone</span>
    </div>
  );
}
