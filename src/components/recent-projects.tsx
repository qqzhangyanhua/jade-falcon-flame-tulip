"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { listProjectSummariesFn } from "@/app/actions/studio";
import { DeleteProjectControl } from "@/components/delete-project-control";
import { getProjectSync } from "@/components/project-sync";
import { ProjectRenameControl } from "@/components/project-rename-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { IMAGE_JOB_USER_MESSAGES } from "@/lib/image-jobs/errors";
import type { ProjectListSort } from "@/lib/image-jobs/project-list";
import type { ProjectSummary } from "@/lib/image-jobs/types";
import { useStudio } from "@/lib/store";

export const PROJECTS_CHANGED_EVENT = "keystone:projects-changed";

const STAGE_LABELS: Record<ProjectSummary["stage"], string> = {
  studio: "工作台",
  direction: "选方向",
  brief: "草稿",
};

const SORTS: { value: ProjectListSort; label: string }[] = [
  { value: "updated", label: "最近更新" },
  { value: "created", label: "创建时间" },
  { value: "name", label: "名称" },
];

function isSort(value: string): value is ProjectListSort {
  return SORTS.some((item) => item.value === value);
}

export function RecentProjects() {
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [sort, setSort] = useState<ProjectListSort>("updated");
  const [opening, setOpening] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const handle = window.setTimeout(() => setAppliedKeyword(keyword), 300);
    return () => window.clearTimeout(handle);
  }, [keyword]);

  const refresh = useCallback(() => {
    const id = ++requestId.current;
    void listProjectSummariesFn({ data: { keyword: appliedKeyword, sort, offset: 0 } })
      .then((page) => {
        if (requestId.current !== id) return;
        setItems(page.items);
        setTotal(page.total);
      })
      .catch(() => {
        if (requestId.current !== id) return;
        setItems((prev) => prev ?? []);
      });
  }, [appliedKeyword, sort]);

  useEffect(() => {
    refresh();
    window.addEventListener(PROJECTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, refresh);
  }, [refresh]);

  async function loadMore() {
    if (!items || loadingMore || items.length >= total) return;
    const id = requestId.current;
    const offset = items.length;
    setLoadingMore(true);
    try {
      const page = await listProjectSummariesFn({
        data: { keyword: appliedKeyword, sort, offset },
      });
      if (requestId.current !== id) return;
      setTotal(page.total);
      setItems((prev) => {
        const seen = new Set((prev ?? []).map((item) => item.id));
        return [...(prev ?? []), ...page.items.filter((item) => !seen.has(item.id))];
      });
    } catch {
      toast.error("没能加载更多项目");
    } finally {
      setLoadingMore(false);
    }
  }

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

  const searching = keyword.trim().length > 0 || appliedKeyword.trim().length > 0;
  if (!items) return null;
  if (items.length === 0 && total === 0 && !searching) return null;

  return (
    <section className="mt-16" aria-label="项目">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="section-label">项目</p>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="search"
            value={keyword}
            placeholder="搜索项目名称"
            aria-label="搜索项目名称"
            className="sm:w-64"
            onChange={(event) => setKeyword(event.target.value)}
          />
          <SelectField
            label="排序"
            className="sm:w-36"
            value={sort}
            items={SORTS}
            onValueChange={(value) => {
              if (isSort(value)) setSort(value);
            }}
          />
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">没有匹配的项目</p>
      ) : (
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
                    <img src={p.coverUrl} alt="" className="frame size-full object-cover" />
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
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2 py-1">
                <ProjectRenameControl
                  projectId={p.id}
                  name={p.name}
                  onRenamed={(next) => {
                    setItems(
                      (prev) =>
                        prev?.map((item) => (item.id === p.id ? { ...item, name: next } : item)) ??
                        prev,
                    );
                    window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
                  }}
                />
                <DeleteProjectControl
                  projectId={p.id}
                  compact
                  onDeleted={() => {
                    setItems((prev) => prev?.filter((item) => item.id !== p.id) ?? prev);
                    setTotal((count) => Math.max(0, count - 1));
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length < total ? (
        <Button
          type="button"
          variant="outline"
          className="mt-4 min-h-11 w-full sm:w-auto"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "加载中…" : "加载更多"}
        </Button>
      ) : null}
    </section>
  );
}
