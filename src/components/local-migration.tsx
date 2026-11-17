"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ensureStudioProjectFn,
  importLocalProjectFn,
  loadProjectDocumentFn,
  uploadWireframeFn,
} from "@/app/actions/studio";
import { getProjectSync } from "@/components/project-sync";
import { PROJECTS_CHANGED_EVENT } from "@/components/recent-projects";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  migrateLocalProjects,
  uploadLocalProject,
  type MigrationApi,
  type MigrationHost,
  type PendingProject,
  type PendingReason,
} from "@/lib/local-migration";
import { useStudio } from "@/lib/store";

const api: MigrationApi = {
  load: (projectId) => loadProjectDocumentFn({ data: { projectId } }),
  ensureRow: async (projectId) => {
    try {
      await ensureStudioProjectFn({ data: { projectId } });
      return { ok: true };
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      return { ok: false, code: code === "forbidden" || code === "project_deleted" ? code : "upstream_failed" };
    }
  },
  uploadWireframe: async (projectId, dataUrl) => (await uploadWireframeFn({ data: { projectId, dataUrl } })).url,
  importProject: (projectId, document) => importLocalProjectFn({ data: { projectId, document } }),
};

const host: MigrationHost & { projects: () => ReturnType<typeof useStudio.getState>["projects"] } = {
  projects: () => useStudio.getState().projects,
  currentId: () => useStudio.getState().currentId,
  adopt: async (id) => getProjectSync()?.open(id),
};

const REASON_TEXT: Record<PendingReason, string> = {
  unmatched: "服务端没有这个项目的记录",
  unavailable: "这个项目在服务端已删除，或不属于当前账号",
  wireframe_failed: "线框图上传失败，项目仍保留在本地",
  upload_failed: "上传失败，项目仍保留在本地",
};

export function LocalMigration() {
  const { user, isPending } = useCurrentUserState();
  const [pending, setPending] = useState<PendingProject[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const ranFor = useRef<string | null>(null);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (isPending || !userId || ranFor.current === userId) return;
    ranFor.current = userId;
    void migrateLocalProjects(api, host)
      .then((result) => {
        setPending(result.pending);
        window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
      })
      .catch(() => undefined);
  }, [isPending, userId]);

  if (!userId || pending.length === 0) return null;

  function settle(id: string) {
    setPending((list) => list.filter((p) => p.id !== id));
    window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
  }

  async function upload(id: string) {
    const project = useStudio.getState().projects.find((p) => p.id === id);
    if (!project) return settle(id);
    setBusyId(id);
    try {
      const result = await uploadLocalProject(api, host, project);
      if (result.ok) {
        toast.success("已上传到你的账号");
        settle(id);
      } else {
        toast.error(REASON_TEXT[result.reason]);
        setPending((list) => list.map((p) => (p.id === id ? { ...p, reason: result.reason } : p)));
      }
    } finally {
      setBusyId(null);
    }
  }

  function discard(id: string) {
    useStudio.getState().removeProject(id);
    setConfirmId(null);
    settle(id);
  }

  return (
    <div
      role="dialog"
      aria-label="本地项目"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-h-[70vh] max-w-md overflow-y-auto rounded-xl bg-surface p-4 shadow-border sm:inset-x-auto sm:right-4 sm:mx-0"
    >
      <p className="text-sm font-medium text-fg">发现浏览器里的旧项目</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        这些项目只存在这台设备上。上传后可在任何设备打开；不处理的话，下次打开还会提示，不会被删除。
      </p>
      <ul className="mt-3 space-y-3">
        {pending.map((p) => (
          <li key={p.id} className="rounded-lg border border-border p-3">
            <p className="truncate text-sm text-fg">{p.name || "未命名项目"}</p>
            <p className="mt-0.5 text-xs text-subtle">{REASON_TEXT[p.reason]}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {p.reason !== "unavailable" ? (
                <Button size="sm" disabled={busyId === p.id} onClick={() => void upload(p.id)}>
                  {busyId === p.id ? "上传中…" : p.reason === "unmatched" ? "上传到账号" : "重试上传"}
                </Button>
              ) : null}
              {confirmId === p.id ? (
                <>
                  <Button variant="danger" size="sm" disabled={busyId === p.id} onClick={() => discard(p.id)}>
                    确认丢弃
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                    取消
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" disabled={busyId === p.id} onClick={() => setConfirmId(p.id)}>
                  丢弃
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Button className="mt-3 w-full" variant="ghost" size="sm" onClick={() => setPending([])}>
        稍后再说
      </Button>
    </div>
  );
}
