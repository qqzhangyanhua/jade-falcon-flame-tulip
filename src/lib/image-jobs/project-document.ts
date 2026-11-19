import { parseProjectName, projectDocumentSchema } from "../project/schema.ts";
import { loadOwnedProject, type ProjectOpResult } from "./projects.ts";
import type { ImageJobGatewayDeps } from "./stores.ts";
import type { ProjectDocumentSnapshot } from "./types.ts";

/** Whole-document saves carry every style rev and image rev, so cap what one row can hold. */
export const MAX_PROJECT_DOCUMENT_BYTES = 2 * 1024 * 1024;

type DocumentDeps = Pick<ImageJobGatewayDeps, "projects" | "now">;

export async function loadProjectDocument(
  deps: DocumentDeps,
  input: { userId: string; projectId: string },
): Promise<ProjectOpResult<ProjectDocumentSnapshot>> {
  const loaded = await loadOwnedProject(deps.projects, input);
  if (!loaded.ok) return loaded;

  const snapshot = await deps.projects.getDocument(loaded.value.id);
  if (!snapshot) return { ok: false, code: "not_found" };
  return { ok: true, value: snapshot };
}

export async function renameProject(
  deps: DocumentDeps,
  input: { userId: string; projectId: string; name: string },
): Promise<ProjectOpResult<{ name: string; version: number; updatedAt: number }>> {
  const loaded = await loadOwnedProject(deps.projects, input);
  if (!loaded.ok) return loaded;

  const snapshot = await deps.projects.getDocument(loaded.value.id);
  if (!snapshot?.document) return { ok: false, code: "not_found" };

  const parsedName = parseProjectName(input.name);
  if (!parsedName.ok) return { ok: false, code: "invalid_document" };
  const name = parsedName.name;
  if (snapshot.document.name === name) {
    return {
      ok: true,
      value: { name, version: snapshot.version, updatedAt: snapshot.updatedAt ?? 0 },
    };
  }
  const saved = await saveProjectDocument(deps, {
    userId: input.userId,
    projectId: loaded.value.id,
    document: { ...snapshot.document, name },
    expectedVersion: snapshot.version,
  });
  if (!saved.ok) return saved;
  return {
    ok: true,
    value: { name, version: saved.value.version, updatedAt: saved.value.updatedAt },
  };
}

export async function saveProjectDocument(
  deps: DocumentDeps,
  input: { userId: string; projectId: string; document: unknown; expectedVersion: number },
): Promise<ProjectOpResult<{ version: number; updatedAt: number }>> {
  const loaded = await loadOwnedProject(deps.projects, input);
  if (!loaded.ok) return loaded;

  const parsed = projectDocumentSchema.safeParse(input.document);
  // A document filed under another project's id would let a later reader open the wrong project.
  if (!parsed.success || parsed.data.id !== loaded.value.id) {
    return { ok: false, code: "invalid_document" };
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    return { ok: false, code: "invalid_document" };
  }

  // Measured on the parsed copy: that is what gets stored (unknown keys such as `mode` are stripped).
  if (Buffer.byteLength(JSON.stringify(parsed.data)) > MAX_PROJECT_DOCUMENT_BYTES) {
    return { ok: false, code: "document_too_large" };
  }

  const outcome = await deps.projects.saveDocument(
    loaded.value.id,
    parsed.data,
    input.expectedVersion,
    deps.now?.() ?? Date.now(),
  );
  switch (outcome.status) {
    case "saved":
      return {
        ok: true,
        value: {
          version: outcome.snapshot.version,
          updatedAt: outcome.snapshot.updatedAt ?? 0,
        },
      };
    case "conflict":
      return { ok: false, code: "version_conflict", current: outcome.current };
    case "deleted":
      return { ok: false, code: "project_deleted" };
    case "not_found":
      return { ok: false, code: "not_found" };
  }
}
