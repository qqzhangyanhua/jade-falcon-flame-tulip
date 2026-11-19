import { PROJECT_SUMMARY_LIMIT } from "../project/summary.ts";
import { loadProjectDocument, saveProjectDocument } from "./project-document.ts";
import type { ProjectOpResult } from "./projects.ts";
import type { ImageJobGatewayDeps } from "./stores.ts";
import type { ProjectSummary } from "./types.ts";

export { PROJECT_SUMMARY_LIMIT };

export const PROJECT_LIST_SORTS = ["updated", "created", "name"] as const;
export type ProjectListSort = (typeof PROJECT_LIST_SORTS)[number];

export type ProjectListPage = {
  items: ProjectSummary[];
  total: number;
};

type ListDeps = Pick<ImageJobGatewayDeps, "projects">;

function byId(a: ProjectSummary, b: ProjectSummary): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function asSort(sort: string | undefined): ProjectListSort {
  if (sort === "created" || sort === "name" || sort === "updated") return sort;
  return "updated";
}

function pageOffset(offset: number | undefined): number {
  if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0) return 0;
  return offset;
}

function compareSummaries(a: ProjectSummary, b: ProjectSummary, sort: ProjectListSort): number {
  if (sort === "name") {
    return a.name.localeCompare(b.name, "zh", { sensitivity: "base" }) || byId(a, b);
  }
  const delta = sort === "created" ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt;
  return delta || byId(a, b);
}

export async function listProjectSummaries(
  deps: ListDeps,
  input: { userId: string; keyword?: string; sort?: string; offset?: number },
): Promise<ProjectOpResult<ProjectListPage>> {
  if (!input.userId) return { ok: false, code: "unauthorized" };
  const keyword = (input.keyword ?? "").trim().toLocaleLowerCase();
  const sort = asSort(input.sort);
  const offset = pageOffset(input.offset);
  const rows = (await deps.projects.listSummaries(input.userId)).filter((row) =>
    keyword ? row.name.toLocaleLowerCase().includes(keyword) : true,
  );
  rows.sort((a, b) => compareSummaries(a, b, sort));
  return {
    ok: true,
    value: {
      items: rows.slice(offset, offset + PROJECT_SUMMARY_LIMIT),
      total: rows.length,
    },
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
