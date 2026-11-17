"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteStudioProjectFn } from "@/app/actions/studio";
import { messageForImageJobError } from "@/lib/image-jobs";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

type DeleteProjectControlProps = {
  projectId: string;
  compact?: boolean;
  className?: string;
  onDeleted?: () => void;
};

export function DeleteProjectControl({
  projectId,
  compact = false,
  className,
  onDeleted,
}: DeleteProjectControlProps) {
  const removeProject = useStudio((s) => s.removeProject);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    setBusy(true);
    try {
      await deleteStudioProjectFn({ data: { projectId } });
      removeProject(projectId);
      onDeleted?.();
      toast.success("项目已删除。作业记录还在，今日额度不退。");
    } catch (err) {
      toast.error(messageForImageJobError(err));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            void onConfirm();
          }}
        >
          {busy ? "删除中…" : "确认删除"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            setConfirming(false);
          }}
        >
          取消
        </Button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-danger",
        compact && "min-h-11 min-w-11 justify-center px-2",
        className,
      )}
      title="删除项目"
      aria-label="删除项目"
      onClick={(event) => {
        event.stopPropagation();
        setConfirming(true);
      }}
    >
      <Trash2 className="size-3.5" />
      {compact ? null : "删除项目"}
    </button>
  );
}
