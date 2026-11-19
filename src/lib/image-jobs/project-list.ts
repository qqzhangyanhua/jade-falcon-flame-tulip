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

function selectedTags(tags: readonly string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function hasEveryTag(row: ProjectSummary, tags: readonly string[]): boolean {
  if (tags.length === 0) return true;
  const have = new Set(row.tags);
  return tags.every((tag) => have.has(tag));
}

export async function listProjectSummaries(
  deps: ListDeps,
  input: {
    userId: string;
    keyword?: string;
    sort?: string;
    offset?: number;
    tags?: readonly string[];
  },
): Promise<ProjectOpResult<ProjectListPage>> {
  if (!input.userId) return { ok: false, code: "unauthorized" };
  const keyword = (input.keyword ?? "").trim().toLocaleLowerCase();
  const tags = selectedTags(input.tags);
  const sort = asSort(input.sort);
  const offset = pageOffset(input.offset);
  const rows = (await deps.projects.listSummaries(input.userId)).filter(
    (row) =>
      (keyword ? row.name.toLocaleLowerCase().includes(keyword) : true) && hasEveryTag(row, tags),
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

/** Tags this user has already put on a live project, for the tag field's suggestions. */
export async function listUsedProjectTags(
  deps: ListDeps,
  input: { userId: string; prefix?: string },
): Promise<ProjectOpResult<string[]>> {
  if (!input.userId) return { ok: false, code: "unauthorized" };
  const prefix = (input.prefix ?? "").trim().toLocaleLowerCase();
  const seen = new Set<string>();
  for (const row of await deps.projects.listSummaries(input.userId)) {
    for (const tag of row.tags) {
      if (seen.has(tag)) continue;
      if (prefix && !tag.toLocaleLowerCase().startsWith(prefix)) continue;
      seen.add(tag);
    }
  }
  const tags = [...seen].sort((a, b) => a.localeCompare(b, "zh", { sensitivity: "base" }));
  return { ok: true, value: tags };
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
