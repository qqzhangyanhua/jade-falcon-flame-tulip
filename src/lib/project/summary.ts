import type { ProjectDocument, Slot } from "./schema.ts";

export const PROJECT_SUMMARY_LIMIT = 20;

/** The slot whose adopted image is a project's cover; the SQL summary query binds this same value. */
export const COVER_SLOT: Slot = "kv";

/**
 * Cover of a project in the recent list: the current style line's main visual
 * (adopted, else newest), then the locked direction's preview, else nothing.
 * The SQL store extracts the same value with jsonb paths; keep both in step.
 */
export function projectCoverUrl(
  document: Pick<ProjectDocument, "currentStyleId" | "styles">,
): string | null {
  const style = document.styles.find((s) => s.id === document.currentStyleId);
  if (!style) return null;
  const kv = style.assets[COVER_SLOT];
  if (!kv) return style.candidateUrl ?? null;
  const adopted = kv.adoptedId ? kv.revs.find((r) => r.id === kv.adoptedId) : undefined;
  return adopted?.url ?? kv.revs.at(-1)?.url ?? style.candidateUrl ?? null;
}
