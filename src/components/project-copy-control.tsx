"use client";

import { useState } from "react";
import { CopyPlus } from "lucide-react";
import { toast } from "sonner";
import { copyProjectFn } from "@/app/actions/studio";
import { getProjectSync } from "@/components/project-sync";
import { IMAGE_JOB_USER_MESSAGES } from "@/lib/image-jobs/errors";
import { useStudio } from "@/lib/store";

type ProjectCopyControlProps = {
  projectId: string;
  /** Open the new project after it is created. The list leaves that to the card. */
  openAfter?: boolean;
  onCopied?: (copy: { id: string; name: string }) => void;
};

export function ProjectCopyControl({
  projectId,
  openAfter = false,
  onCopied,
}: ProjectCopyControlProps) {
  const [busy, setBusy] = useState(false);

  async function copy() {
    setBusy(true);
    try {
      const sync = getProjectSync();
      await sync?.flush(projectId);
      const result = await copyProjectFn({ data: { projectId } });
      if (!result.ok) {
        toast.error(IMAGE_JOB_USER_MESSAGES[result.code]);
        return;
      }
      onCopied?.({ id: result.value.id, name: result.value.name });
      toast.success(`已复制为「${result.value.name}」`);
      if (!openAfter) return;
      const opened = await sync?.open(result.value.id);
      if (opened && !opened.ok) {
        toast.error(IMAGE_JOB_USER_MESSAGES[opened.code]);
        return;
      }
      if (!useStudio.getState().projects.some((project) => project.id === result.value.id)) {
        toast.error("项目暂时无法打开，请稍后再试");
        return;
      }
      useStudio.setState({ currentId: result.value.id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center gap-1 px-2 text-sm text-muted hover:text-fg disabled:opacity-60"
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation();
        void copy();
      }}
    >
      <CopyPlus className="size-3.5" />
      {busy ? "复制中…" : "复制"}
    </button>
  );
}
