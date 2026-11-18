"use client";

import type { ReactNode } from "react";
import Link from "next/link";
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
    <header className={cn("border-b border-border", className)}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 md:px-8">
        {leading ?? (
          <Link href="/studio" className="min-h-11">
            <Wordmark />
          </Link>
        )}
        <div className="flex items-center gap-1 sm:gap-2">
          {extra}
          <JobHistoryLink />
          <AuthSlot />
        </div>
      </div>
    </header>
  );
}
