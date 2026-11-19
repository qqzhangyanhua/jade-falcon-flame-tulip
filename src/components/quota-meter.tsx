import { quotaExhausted, type StudioQuota } from "@/lib/image-jobs";
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
      <div
        className={cn(
          "inline-flex h-11 items-center rounded-sm border border-border px-3 text-xs text-subtle",
          className,
        )}
      >
        额度…
      </div>
    );
  }

  const exhausted = quotaExhausted(quota);
  const pct = quota.cap > 0 ? Math.max(0, Math.min(100, (quota.remaining / quota.cap) * 100)) : 0;

  return (
    <div
      className={cn(
        "inline-flex h-11 max-w-full items-center gap-2 rounded-sm border border-border px-3",
        className,
      )}
      title={`北京时间 ${quota.beijingDay}`}
    >
      <span className="relative h-1 w-10 shrink-0 overflow-hidden rounded-full bg-surface-2">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            exhausted ? "bg-danger" : "bg-accent",
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      {exhausted ? (
        <span className="truncate text-xs text-danger">今日额度已用完</span>
      ) : (
        <>
          <span className="truncate text-xs tabular-nums text-muted">
            今日 {quota.remaining}/{quota.cap}
          </span>
          <span className="truncate text-xs tabular-nums text-fg">加量包 {quota.boost}</span>
        </>
      )}
    </div>
  );
}
