import { PROJECT_SUMMARY_LIMIT } from "../project/summary.ts";
import { loadProjectDocument, saveProjectDocument } from "./project-document.ts";
import type { ProjectOpResult } from "./projects.ts";
import type { ImageJobGatewayDeps } from "./stores.ts";
import type { ProjectSummary } from "./types.ts";

export { PROJECT_SUMMARY_LIMIT };

type ListDeps = Pick<ImageJobGatewayDeps, "projects">;

export async function listProjectSummaries(
  deps: ListDeps,
  input: { userId: string },
): Promise<ProjectOpResult<ProjectSummary[]>> {
  if (!input.userId) return { ok: false, code: "unauthorized" };
  return {
    ok: true,
    value: await deps.projects.listSummaries(input.userId, PROJECT_SUMMARY_LIMIT),
  };
}

export type ImportLocalResult = { status: "imported" | "already_synced"; version: number };

/**
 * Upload a project that so far lived only in a browser. The id must already map
 * to a live project row of this user: this never creates rows, so a stale or
 * foreign id cannot be turned into server data by importing. A server copy that
 * already exists is left alone.
 */
export async function importLocalProject(
  deps: Pick<ImageJobGatewayDeps, "projects" | "now">,
  input: { userId: string; projectId: string; document: unknown },
): Promise<ProjectOpResult<ImportLocalResult>> {
  const existing = await loadProjectDocument(deps, input);
  if (!existing.ok) return existing;
  if (existing.value.document) {
    return { ok: true, value: { status: "already_synced", version: existing.value.version } };
  }

  const saved = await saveProjectDocument(deps, {
    ...input,
    expectedVersion: existing.value.version,
  });
  if (saved.ok) return { ok: true, value: { status: "imported", version: saved.value.version } };
  // Another device or tab won the race: the server copy stands.
  if (saved.code === "version_conflict" && saved.current?.document) {
    return { ok: true, value: { status: "already_synced", version: saved.current.version } };
  }
  return saved;
}
