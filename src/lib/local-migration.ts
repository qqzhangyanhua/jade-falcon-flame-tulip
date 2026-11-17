import type { ImageJobErrorCode, ProjectDocumentSnapshot } from "./image-jobs/types.ts";
import type { ProjectDocument, Project } from "./project/schema.ts";
import { toDocument } from "./project-sync.ts";

type ApiResult<T> = { ok: true; value: T } | { ok: false; code: ImageJobErrorCode };

export type MigrationApi = {
  load: (projectId: string) => Promise<ApiResult<ProjectDocumentSnapshot>>;
  /** Create the project row with this id for the signed-in user (no-op if it is already theirs). */
  ensureRow: (projectId: string) => Promise<{ ok: true } | { ok: false; code: ImageJobErrorCode }>;
  /** Resolves to the stored image address; rejects when the upload fails. */
  uploadWireframe: (projectId: string, dataUrl: string) => Promise<string>;
  importProject: (
    projectId: string,
    document: ProjectDocument,
  ) => Promise<ApiResult<{ status: "imported" | "already_synced"; version: number }>>;
};

export type MigrationHost = {
  currentId: () => string | null;
  /** Pull the server copy into the local store (the sync engine's `open`). */
  adopt: (projectId: string) => Promise<unknown>;
};

export type PendingReason = "unmatched" | "unavailable" | "wireframe_failed" | "upload_failed";

export type PendingProject = { id: string; name: string; reason: PendingReason };

export type UploadFailure = "wireframe_failed" | "upload_failed" | "unavailable";

const isInlineImage = (url: string | null): url is string =>
  Boolean(url && url.toLowerCase().startsWith("data:"));

/** Everything that goes up for one project; inline wireframes are uploaded first and replaced by their address. */
async function uploadDocument(
  api: MigrationApi,
  host: MigrationHost,
  project: Project,
): Promise<{ ok: true } | { ok: false; reason: UploadFailure }> {
  const document = toDocument(project);
  if (isInlineImage(project.prototypeDataUrl)) {
    try {
      document.prototypeDataUrl = await api.uploadWireframe(project.id, project.prototypeDataUrl);
    } catch {
      return { ok: false, reason: "wireframe_failed" };
    }
  }

  let imported: Awaited<ReturnType<MigrationApi["importProject"]>>;
  try {
    imported = await api.importProject(project.id, document);
  } catch {
    return { ok: false, reason: "upload_failed" };
  }
  if (!imported.ok) {
    const gone = imported.code === "forbidden" || imported.code === "project_deleted";
    return { ok: false, reason: gone ? "unavailable" : "upload_failed" };
  }
  await host.adopt(project.id).catch(() => undefined);
  return { ok: true };
}

/** The user chose to keep a project that has no server row yet: create the row, then upload. */
export async function uploadLocalProject(
  api: MigrationApi,
  host: MigrationHost,
  project: Project,
): Promise<{ ok: true } | { ok: false; reason: UploadFailure }> {
  let row: Awaited<ReturnType<MigrationApi["ensureRow"]>>;
  try {
    row = await api.ensureRow(project.id);
  } catch {
    return { ok: false, reason: "upload_failed" };
  }
  if (!row.ok) {
    const gone = row.code === "forbidden" || row.code === "project_deleted";
    return { ok: false, reason: gone ? "unavailable" : "upload_failed" };
  }
  return uploadDocument(api, host, project);
}

/**
 * Walk the projects found in this browser's old storage. Ones that map to a
 * server row of the user are uploaded without asking; the rest are returned for
 * the user to decide on. Nothing is removed here.
 */
export async function migrateLocalProjects(
  api: MigrationApi,
  host: MigrationHost & { projects: () => Project[] },
): Promise<{ pending: PendingProject[] }> {
  const pending: PendingProject[] = [];
  for (const project of host.projects()) {
    let loaded: Awaited<ReturnType<MigrationApi["load"]>>;
    try {
      loaded = await api.load(project.id);
    } catch {
      // Unreachable server: nothing is learned about this project, so the next load tries again.
      continue;
    }

    if (!loaded.ok) {
      if (loaded.code === "unauthorized") break;
      if (loaded.code === "not_found") {
        pending.push({ id: project.id, name: project.name, reason: "unmatched" });
      } else if (loaded.code === "forbidden" || loaded.code === "project_deleted") {
        pending.push({ id: project.id, name: project.name, reason: "unavailable" });
      }
      continue;
    }
    if (loaded.value.document) continue;

    // The sync engine already uploads the open project on its own; racing it would look like a conflict.
    if (project.id === host.currentId() && !isInlineImage(project.prototypeDataUrl)) {
      await host.adopt(project.id).catch(() => undefined);
      continue;
    }

    const uploaded = await uploadDocument(api, host, project);
    if (!uploaded.ok) pending.push({ id: project.id, name: project.name, reason: uploaded.reason });
  }
  return { pending };
}
