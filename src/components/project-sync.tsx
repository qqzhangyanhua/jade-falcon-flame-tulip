"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { loadProjectDocumentFn, saveProjectDocumentFn } from "@/app/actions/studio";
import { IMAGE_JOB_USER_MESSAGES } from "@/lib/image-jobs/errors";
import { createProjectSync, type ProjectSync } from "@/lib/project-sync";
import { useStudio } from "@/lib/store";

const VERSIONS_KEY = "keystone-sync-v1";
const DEBOUNCE_MS = 1000;

function readVersions(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(VERSIONS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeVersions(versions: Record<string, number>): void {
  try {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
  } catch {
    // Storage full or blocked: the version is re-learned from the server on the next save.
  }
}

let activeSync: ProjectSync | null = null;

/** The running sync engine, for features that open or upload a project by id (recent projects, local migration). */
export function getProjectSync(): ProjectSync | null {
  return activeSync;
}

export function ProjectSync() {
  useEffect(() => {
    const sync = createProjectSync(
      {
        load: (projectId) => loadProjectDocumentFn({ data: { projectId } }),
        save: (projectId, document, expectedVersion) =>
          saveProjectDocumentFn({ data: { projectId, document, expectedVersion } }),
      },
      {
        getProject: (id) => useStudio.getState().projects.find((p) => p.id === id),
        applyServerDocument(document) {
          useStudio.setState((s) => {
            const existing = s.projects.find((p) => p.id === document.id);
            const next = {
              ...document,
              referenceImageUrls: document.referenceImageUrls ?? [],
              mode: existing?.mode ?? ("idle" as const),
            };
            return {
              projects: existing
                ? s.projects.map((p) => (p.id === document.id ? next : p))
                : [next, ...s.projects],
            };
          });
        },
        dropProject: (id) => useStudio.getState().removeProject(id),
        notify(event) {
          if (event.type === "conflict") {
            toast.info(IMAGE_JOB_USER_MESSAGES.version_conflict);
          } else if (event.type === "deleted") {
            toast.info("该项目已在别处删除，本地缓存已清除");
          } else {
            toast.error(IMAGE_JOB_USER_MESSAGES[event.code]);
          }
        },
        versions: {
          get: (id) => readVersions()[id],
          set: (id, version) => writeVersions({ ...readVersions(), [id]: version }),
          delete: (id) => {
            const { [id]: _removed, ...rest } = readVersions();
            writeVersions(rest);
          },
        },
        schedule: (fn, ms) => {
          const handle = window.setTimeout(fn, ms);
          return () => window.clearTimeout(handle);
        },
        debounceMs: DEBOUNCE_MS,
      },
    );
    activeSync = sync;

    const unsubscribe = useStudio.subscribe((state, prev) => {
      const before = new Map(prev.projects.map((p) => [p.id, p]));
      const after = new Set<string>();
      for (const project of state.projects) {
        after.add(project.id);
        if (before.get(project.id) !== project) sync.touch(project.id);
      }
      for (const id of before.keys()) if (!after.has(id)) sync.forget(id);
      if (state.currentId && state.currentId !== prev.currentId) void sync.open(state.currentId);
    });

    const initial = useStudio.getState().currentId;
    if (initial) void sync.open(initial);

    const flushOnHide = () => {
      if (document.visibilityState === "hidden") void sync.flushAll();
    };
    document.addEventListener("visibilitychange", flushOnHide);
    window.addEventListener("pagehide", flushOnHide);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", flushOnHide);
      window.removeEventListener("pagehide", flushOnHide);
      void sync.flushAll();
      if (activeSync === sync) activeSync = null;
    };
  }, []);

  return null;
}
