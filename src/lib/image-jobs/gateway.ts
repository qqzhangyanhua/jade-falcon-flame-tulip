import { projectDocumentSchema, type CustomSlot } from "../project/schema.ts";
import { catalogAspect, DEFAULT_ENABLED_SLOT_IDS, DIRECTION_ASPECT } from "../project/slots.ts";
import { persistDurableCopies, resolveUpstreamImageUrl } from "./durable.ts";
import { newEntityId } from "./ids.ts";
import { evaluateImageAction } from "./availability.ts";
import { resolveJobSlot } from "./concurrency.ts";
import { ImageJobError } from "./errors.ts";
import type { ImageJobGatewayDeps } from "./stores.ts";
import type {
  ImageJobErrorCode,
  ImageJobRecord,
  ImageRevRecord,
  ImageUpstreamResult,
  RunImageJobInput,
  RunImageJobResult,
} from "./types.ts";

function fail(code: ImageJobErrorCode, job?: ImageJobRecord): RunImageJobResult {
  return job ? { ok: false, code, job } : { ok: false, code };
}

type ProjectSlots = {
  enabled: readonly string[];
  customSlots: readonly CustomSlot[];
};

/** Enabled ids and custom definitions, or the original three when there is no document. */
async function projectSlotsFor(
  deps: ImageJobGatewayDeps,
  projectId: string,
): Promise<ProjectSlots> {
  const snapshot = await deps.projects.getDocument(projectId);
  if (!snapshot?.document) return { enabled: DEFAULT_ENABLED_SLOT_IDS, customSlots: [] };
  const parsed = projectDocumentSchema.safeParse(snapshot.document);
  if (!parsed.success) return { enabled: DEFAULT_ENABLED_SLOT_IDS, customSlots: [] };
  return { enabled: parsed.data.enabledSlotIds, customSlots: parsed.data.customSlots };
}

/** Built-in catalog aspect, else the custom definition. Never a 16:9 fallback. */
function aspectForSlot(slot: string, customSlots: readonly CustomSlot[]): string | null {
  const builtin = catalogAspect(slot);
  if (builtin) return builtin;
  return customSlots.find((item) => item.id === slot)?.aspect ?? null;
}

export async function runImageJob(
  deps: ImageJobGatewayDeps,
  input: RunImageJobInput,
): Promise<RunImageJobResult> {
  if (!input.userId) return fail("unauthorized");

  const project = await deps.projects.get(input.projectId);
  if (!project) return fail("not_found");
  if (project.userId !== input.userId) return fail("forbidden");
  if (project.deletedAt !== null) return fail("project_deleted");

  const models = await deps.catalog.list();
  const current = project.currentImageModelId
    ? await deps.catalog.get(project.currentImageModelId)
    : null;
  const verdict = evaluateImageAction({
    models,
    current,
    action: input.action,
  });
  if (!verdict.ok) return fail(verdict.code);

  let imageUrl = input.imageUrl;
  if (imageUrl) {
    const resolved = await resolveUpstreamImageUrl(deps, input.userId, imageUrl);
    if (!resolved) return fail("not_found");
    imageUrl = resolved;
  }

  const slot = resolveJobSlot(input.action, input.slot);
  let jobAspect = DIRECTION_ASPECT;
  if (input.action !== "direction") {
    const projectSlots = await projectSlotsFor(deps, input.projectId);
    if (!slot || !projectSlots.enabled.includes(slot)) return fail("unknown_slot");
    const aspect = aspectForSlot(slot, projectSlots.customSlots);
    if (!aspect) return fail("unknown_slot");
    jobAspect = aspect;
  }

  const now = deps.now?.() ?? Date.now();
  const newId = deps.newId ?? newEntityId;
  const reserved = await deps.jobs.insertReserved({
    id: newId("job"),
    userId: input.userId,
    projectId: input.projectId,
    action: input.action,
    slot,
    catalogModelId: verdict.model.id,
    upstreamModelId: verdict.model.upstreamId,
    displayNameSnapshot: verdict.model.displayName,
    status: "running",
    errorCode: null,
    createdAt: now,
    finishedAt: null,
  });
  if (!reserved.ok) return fail(reserved.code);
  const job = reserved.job;

  let upstreamResult: ImageUpstreamResult;
  try {
    upstreamResult = await deps.upstream.run({
      action: input.action,
      upstreamModelId: verdict.model.upstreamId,
      prompt: input.prompt,
      aspect: jobAspect,
      n: input.n ?? 1,
      imageUrl,
    });
  } catch {
    upstreamResult = { ok: false };
  }

  const finishedAt = deps.now?.() ?? Date.now();
  if (!upstreamResult.ok || upstreamResult.urls.length === 0) {
    const failed =
      (await deps.jobs.finish(job.id, "failed", "upstream_failed", finishedAt)) ??
      { ...job, status: "failed" as const, errorCode: "upstream_failed" as const, finishedAt };
    return fail("upstream_failed", failed);
  }

  const still = await deps.projects.get(input.projectId);
  if (still?.deletedAt !== null) {
    const succeeded =
      (await deps.jobs.finish(job.id, "succeeded", null, finishedAt)) ??
      { ...job, status: "succeeded" as const, finishedAt };
    return { ok: true, job: succeeded, revs: [] };
  }

  let revs: ImageRevRecord[] | null;
  try {
    revs = await persistDurableCopies(deps, {
      jobId: job.id,
      projectId: input.projectId,
      userId: input.userId,
      action: input.action,
      sourceUrls: upstreamResult.urls,
      createdAt: finishedAt,
    });
  } catch {
    revs = null;
  }
  if (!revs || revs.length === 0) {
    const failed =
      (await deps.jobs.finish(job.id, "failed", "upstream_failed", finishedAt)) ??
      { ...job, status: "failed" as const, errorCode: "upstream_failed" as const, finishedAt };
    return fail("upstream_failed", failed);
  }

  const succeeded =
    (await deps.jobs.finish(job.id, "succeeded", null, finishedAt)) ??
    { ...job, status: "succeeded" as const, finishedAt };
  return { ok: true, job: succeeded, revs };
}

export function unwrapImageJob(result: RunImageJobResult): {
  job: ImageJobRecord;
  revs: ImageRevRecord[];
} {
  if (!result.ok) throw new ImageJobError(result.code);
  return { job: result.job, revs: result.revs };
}
