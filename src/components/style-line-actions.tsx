"use client";

import { useState } from "react";
import { Archive, ChevronDown, GitFork, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/store";
import type { StyleBranch } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StyleLineActions({
  styles,
  style,
  disabled,
}: {
  styles: StyleBranch[];
  style: StyleBranch;
  disabled?: boolean;
}) {
  const archiveStyle = useStudio((s) => s.archiveStyle);
  const restoreStyle = useStudio((s) => s.restoreStyle);
  const forkStyle = useStudio((s) => s.forkStyle);
  const [confirming, setConfirming] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const archived = styles.filter((s) => s.status === "archived");
  const lastLive = styles.filter((s) => s.status !== "archived").length <= 1;

  function onArchive() {
    const result = archiveStyle(style.id);
    setConfirming(false);
    if (result.ok) toast.success(`已归档「${style.name}」`);
    else if (result.reason === "last_live_style") toast.error("至少保留一条可用风格线");
  }

  function onFork() {
    forkStyle(style.id);
    toast.success(`已从 rev${style.currentRev} 分叉出新风格线`);
  }

  return (
    <div>
      <p className="mb-3 section-label">风格线操作</p>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={onFork}
          className="flex min-h-11 items-center gap-2 rounded-md px-3 text-left text-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-fg disabled:opacity-40"
        >
          <GitFork className="size-4 shrink-0" />
          从当前版本分叉
        </button>

        {confirming ? (
          <div role="group" aria-label="确认归档" className="rounded-md bg-surface p-3 shadow-border">
            <p className="text-sm leading-relaxed text-fg">归档「{style.name}」？</p>
            <p className="mt-1 text-xs leading-relaxed text-subtle">
              会切到下一条可用风格线，之后可以在“已归档”里恢复。
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="danger" className="flex-1" onClick={onArchive}>
                确认归档
              </Button>
              <Button size="sm" variant="ghost" className="flex-1" onClick={() => setConfirming(false)}>
                取消
              </Button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={disabled || lastLive}
              onClick={() => setConfirming(true)}
              className="flex min-h-11 items-center gap-2 rounded-md px-3 text-left text-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
            >
              <Archive className="size-4 shrink-0" />
              归档这条风格线
            </button>
            {lastLive ? (
              <p className="px-3 text-xs leading-relaxed text-subtle">这是最后一条可用风格线，不能归档。</p>
            ) : null}
          </>
        )}
      </div>

      {archived.length > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-fg"
          >
            <span>已归档 · {archived.length}</span>
            <ChevronDown className={cn("size-4 transition-transform duration-150", showArchived && "rotate-180")} />
          </button>
          {showArchived ? (
            <ul className="mt-1 flex flex-col gap-1">
              {archived.map((s) => (
                <li key={s.id} className="flex min-h-11 items-center gap-2 rounded-md px-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{s.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => {
                      restoreStyle(s.id);
                      toast.success(`已恢复「${s.name}」为备选`);
                    }}
                  >
                    <RotateCcw className="size-3.5" />
                    恢复
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
