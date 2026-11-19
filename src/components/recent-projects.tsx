"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DeleteProjectControl } from "@/components/delete-project-control";
import { OwnedImage } from "@/components/owned-image";
import { getProjectSync } from "@/components/project-sync";
import { listProjectSummariesFn } from "@/app/actions/studio";
import { IMAGE_JOB_USER_MESSAGES } from "@/lib/image-jobs/errors";
import type { ProjectSummary } from "@/lib/image-jobs/types";
import { useStudio } from "@/lib/store";

export const PROJECTS_CHANGED_EVENT = "keystone:projects-changed";

const STAGE_LABELS: Record<ProjectSummary["stage"], string> = {
  studio: "工作台",
  direction: "选方向",
  brief: "草稿",
};

export function RecentProjects() {
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listProjectSummariesFn()
      .then(setItems)
      .catch(() => setItems((prev) => prev ?? []));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(PROJECTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, refresh);
  }, [refresh]);

  async function open(id: string) {
    setOpening(id);
    try {
      const opened = await getProjectSync()?.open(id);
      if (opened && !opened.ok) {
        toast.error(IMAGE_JOB_USER_MESSAGES[opened.code]);
        refresh();
        return;
      }
      if (!useStudio.getState().projects.some((p) => p.id === id)) {
        toast.error("项目暂时无法打开，请稍后再试");
        return;
      }
      useStudio.setState({ currentId: id });
    } finally {
      setOpening(null);
    }
  }

  if (!items || items.length === 0) return null;

  return (
    <section className="mt-16" aria-label="最近项目">
      <p className="mb-4 section-label">最近项目</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <li key={p.id} className="overflow-hidden rounded-lg bg-surface shadow-border">
            <button
              type="button"
              className="block w-full text-left disabled:opacity-60"
              disabled={opening === p.id}
              onClick={() => void open(p.id)}
            >
              <div className="aspect-video bg-surface-2">
                {p.coverUrl ? (
                  <OwnedImage
                    src={p.coverUrl}
                    alt=""
                    className="frame size-full object-cover"
                    placeholderClassName="size-full"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-subtle">
                    尚未出图
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-fg">{p.name}</span>
                  <span className="text-xs text-subtle">
                    {opening === p.id ? "打开中…" : STAGE_LABELS[p.stage]}
                  </span>
                </span>
              </div>
            </button>
            <div className="flex justify-end border-t border-border px-2 py-1">
              <DeleteProjectControl
                projectId={p.id}
                compact
                onDeleted={() => setItems((prev) => prev?.filter((x) => x.id !== p.id) ?? prev)}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
