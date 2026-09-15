import { persistDurableCopies, resolveUpstreamImageUrl } from "./durable";
import { newEntityId } from "./ids";
import { evaluateImageAction } from "./availability";
import { resolveJobSlot } from "./concurrency";
import { ImageJobError } from "./errors";
import type { ImageJobGatewayDeps } from "./stores";
import type {
  ImageJobErrorCode,
  ImageJobRecord,
  ImageRevRecord,
  ImageUpstreamResult,
  RunImageJobInput,
  RunImageJobResult,
} from "./types";

function fail(code: ImageJobErrorCode, job?: ImageJobRecord): RunImageJobResult {
  return job ? { ok: false, code, job } : { ok: false, code };
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

  const now = deps.now?.() ?? Date.now();
  const newId = deps.newId ?? newEntityId;
  const reserved = await deps.jobs.insertReserved({
    id: newId("job"),
    userId: input.userId,
    projectId: input.projectId,
    action: input.action,
    slot: resolveJobSlot(input.action, input.slot),
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
      aspect: input.aspect ?? "16:9",
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
