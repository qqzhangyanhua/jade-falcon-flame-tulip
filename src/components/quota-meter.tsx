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
      <p className={cn("text-xs text-subtle", className)}>今日额度加载中</p>
    );
  }
  const depleted = quota.remaining <= 0;
  return (
    <p
      className={cn(
        "text-xs tabular-nums",
        depleted ? "text-danger" : "text-muted",
        className,
      )}
      title={`北京时间 ${quota.beijingDay}`}
    >
      {depleted
        ? "今日额度已用完"
        : `今日剩余 ${quota.remaining}/${quota.cap}`}
    </p>
  );
}
