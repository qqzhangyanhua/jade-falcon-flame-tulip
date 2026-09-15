import { Link } from "@tanstack/react-router";
import { History } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

export function JobHistoryLink({ compact = false }: { compact?: boolean }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || !user) return null;

  return (
    <Link
      to="/history"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md text-sm text-muted hover:bg-surface-2 hover:text-fg",
        compact ? "h-9 px-2" : "h-11 px-2.5",
      )}
    >
      <History className="size-4 shrink-0" />
      <span className="hidden sm:inline">作业历史</span>
    </Link>
  );
}
