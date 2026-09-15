import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AuthSlot } from "@/components/auth-slot";
import { JobHistoryLink } from "@/components/job-history-link";
import { Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

export function AppHeader({
  extra,
  leading,
  className,
}: {
  extra?: ReactNode;
  leading?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-center justify-between px-5 py-3 md:px-8", className)}>
      {leading ?? (
        <Link to="/">
          <Wordmark />
        </Link>
      )}
      <div className="flex items-center gap-2">
        {extra}
        <JobHistoryLink />
        <AuthSlot />
      </div>
    </header>
  );
}
