import { newEntityId } from "./ids.ts";
import { evaluateImageAction } from "./availability.ts";
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

export async function runImageJob(
  deps: ImageJobGatewayDeps,
  input: RunImageJobInput,
): Promise<RunImageJobResult> {
  if (!input.userId) return fail("unauthorized");

  const project = await deps.projects.get(input.projectId);
  if (!project) return fail("not_found");
  if (project.userId !== input.userId) return fail("forbidden");

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

  const now = deps.now?.() ?? Date.now();
  const newId = deps.newId ?? newEntityId;
  const job = await deps.jobs.insert({
    id: newId("job"),
    userId: input.userId,
    projectId: input.projectId,
    action: input.action,
    catalogModelId: verdict.model.id,
    upstreamModelId: verdict.model.upstreamId,
    displayNameSnapshot: verdict.model.displayName,
    status: "running",
    errorCode: null,
    createdAt: now,
    finishedAt: null,
  });

  let upstreamResult: ImageUpstreamResult;
  try {
    upstreamResult = await deps.upstream.run({
      action: input.action,
      upstreamModelId: verdict.model.upstreamId,
      prompt: input.prompt,
      aspect: input.aspect ?? "16:9",
      n: input.n ?? 1,
      imageUrl: input.imageUrl,
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

  const revs: ImageRevRecord[] = [];
  for (const url of upstreamResult.urls) {
    revs.push(
      await deps.revs.append({
        id: newId("img"),
        jobId: job.id,
        projectId: input.projectId,
        userId: input.userId,
        url,
        action: input.action,
        createdAt: finishedAt,
      }),
    );
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
