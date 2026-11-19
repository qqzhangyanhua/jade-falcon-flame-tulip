"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { addProjectTagFn, removeProjectTagFn } from "@/app/actions/studio";
import { getProjectSync } from "@/components/project-sync";
import { ProjectTagSuggestInput } from "@/components/project-tag-suggest";
import { IMAGE_JOB_USER_MESSAGES } from "@/lib/image-jobs/errors";
import {
  PROJECT_TAG_MAX_COUNT,
  PROJECT_TAG_MAX_LENGTH,
  parseProjectTag,
} from "@/lib/project/schema";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

type ProjectTagControlProps = {
  projectId: string;
  tags: readonly string[];
  onChange?: (tags: string[]) => void;
};

export function ProjectTagControl({ projectId, tags, onChange }: ProjectTagControlProps) {
  const setProjectTags = useStudio((s) => s.setProjectTags);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const full = tags.length >= PROJECT_TAG_MAX_COUNT;

  async function change(kind: "add" | "remove", raw: string) {
    let tag = raw;
    if (kind === "add") {
      const parsed = parseProjectTag(raw);
      if (!parsed.ok) {
        toast.error(raw.trim() ? `标签最多 ${PROJECT_TAG_MAX_LENGTH} 字` : "标签不能为空");
        return;
      }
      if (tags.includes(parsed.tag)) return;
      if (full) {
        toast.error(`每个项目最多 ${PROJECT_TAG_MAX_COUNT} 个标签`);
        return;
      }
      tag = parsed.tag;
    }

    setBusy(true);
    try {
      await getProjectSync()?.flush(projectId);
      const result =
        kind === "add"
          ? await addProjectTagFn({ data: { projectId, tag } })
          : await removeProjectTagFn({ data: { projectId, tag } });
      if (!result.ok) {
        toast.error(IMAGE_JOB_USER_MESSAGES[result.code]);
        return;
      }
      if (useStudio.getState().projects.some((project) => project.id === projectId)) {
        setProjectTags(projectId, result.value.tags);
        getProjectSync()?.noteSaved(projectId, result.value.version);
      }
      onChange?.(result.value.tags);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-2", menuOpen && "relative z-30")}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1" aria-label="标签">
          {tags.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-1 rounded-md bg-surface-2 px-3 text-sm text-fg hover:bg-bg disabled:opacity-60"
                aria-label={`移除标签 ${tag}`}
                onClick={() => void change("remove", tag)}
              >
                {tag}
                <X className="size-3.5 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ProjectTagSuggestInput
        label="添加标签"
        placeholder={full ? `最多 ${PROJECT_TAG_MAX_COUNT} 个标签` : "添加标签"}
        exclude={tags}
        disabled={busy || full}
        onOpenChange={setMenuOpen}
        onCommit={(tag) => void change("add", tag)}
      />
    </div>
  );
}

type ProjectTagFilterProps = {
  tags: readonly string[];
  onChange: (tags: string[]) => void;
};

export function ProjectTagFilter({ tags, onChange }: ProjectTagFilterProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", menuOpen && "relative z-30")}>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1" aria-label="已选标签">
          {tags.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1 rounded-md bg-surface-2 px-3 text-sm text-fg hover:bg-bg"
                aria-label={`取消筛选 ${tag}`}
                onClick={() => onChange(tags.filter((item) => item !== tag))}
              >
                {tag}
                <X className="size-3.5 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ProjectTagSuggestInput
        label="按标签筛选"
        placeholder="按标签筛选"
        exclude={tags}
        onOpenChange={setMenuOpen}
        onCommit={(tag) => {
          const parsed = parseProjectTag(tag);
          if (!parsed.ok || tags.includes(parsed.tag)) return;
          onChange([...tags, parsed.tag]);
        }}
      />
    </div>
  );
}
