"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { renameProjectFn } from "@/app/actions/studio";
import { getProjectSync } from "@/components/project-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IMAGE_JOB_USER_MESSAGES } from "@/lib/image-jobs/errors";
import { PROJECT_NAME_MAX, parseProjectName } from "@/lib/project/schema";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

type ProjectRenameControlProps = {
  projectId: string;
  name: string;
  /** Title puts the name in a heading; row is the compact list and studio control. */
  appearance?: "row" | "title";
  onRenamed?: (name: string) => void;
};

export function ProjectRenameControl({
  projectId,
  name,
  appearance = "row",
  onRenamed,
}: ProjectRenameControlProps) {
  const renameLocal = useStudio((s) => s.renameProject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [editing, name]);

  async function save() {
    const parsed = parseProjectName(draft);
    if (!parsed.ok) {
      toast.error(draft.trim() ? `名称最多 ${PROJECT_NAME_MAX} 字` : "名称不能为空");
      return;
    }
    if (parsed.name === name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const sync = getProjectSync();
      await sync?.flush(projectId);
      const result = await renameProjectFn({ data: { projectId, name: parsed.name } });
      if (!result.ok) {
        toast.error(IMAGE_JOB_USER_MESSAGES[result.code]);
        return;
      }
      if (useStudio.getState().projects.some((project) => project.id === projectId)) {
        renameLocal(projectId, result.value.name);
        getProjectSync()?.noteSaved(projectId, result.value.version);
      }
      onRenamed?.(result.value.name);
      toast.success("项目已改名");
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-2",
          appearance === "row" && "w-full sm:w-auto",
        )}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void save();
        }}
      >
        <label className="sr-only" htmlFor={`rename-${projectId}`}>
          项目名称
        </label>
        <Input
          id={`rename-${projectId}`}
          value={draft}
          maxLength={PROJECT_NAME_MAX}
          disabled={busy}
          autoFocus
          placeholder="项目名称"
          className={cn("min-w-0", appearance === "title" ? "max-w-md" : "w-full sm:w-52")}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" className="min-h-11" disabled={busy}>
          {busy ? "保存中…" : "保存"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            setDraft(name);
            setEditing(false);
          }}
        >
          取消
        </Button>
      </form>
    );
  }

  if (appearance === "title") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 font-display text-4xl leading-none tracking-tight md:text-5xl">
          {name}
        </h1>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-fg"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-3.5" />
          改名
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center gap-1 px-2 text-sm text-muted hover:text-fg"
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
    >
      <Pencil className="size-3.5" />
      改名
    </button>
  );
}
