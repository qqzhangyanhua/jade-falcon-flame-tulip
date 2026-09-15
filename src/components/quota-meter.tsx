import type { StudioQuota } from "@/lib/image-jobs";
import { cn } from "@/lib/utils";

export function QuotaMeter({
  quota,
  className,
}: {
  quota: StudioQuota | null | undefined;
  className?: string;
}) {
  if (!quota) {
    return (
      <div className={cn("inline-flex h-11 items-center rounded-full border border-border px-3 text-xs text-subtle", className)}>
        额度…
      </div>
    );
  }

  const depleted = quota.remaining <= 0;
  const pct = quota.cap > 0 ? Math.max(0, Math.min(100, (quota.remaining / quota.cap) * 100)) : 0;

  return (
    <div
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border border-border px-3",
        className,
      )}
      title={`北京时间 ${quota.beijingDay}`}
    >
      <span className="relative h-1 w-10 overflow-hidden rounded-full bg-surface-2">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", depleted ? "bg-danger" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className={cn("text-xs tabular-nums", depleted ? "text-danger" : "text-muted")}>
        {depleted ? "额度用尽" : `${quota.remaining}/${quota.cap}`}
      </span>
    </div>
  );
}
