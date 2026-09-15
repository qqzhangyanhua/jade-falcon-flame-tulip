import type { ImageJobGatewayDeps } from "./stores.ts";
import type {
  ImageJobHistoryItem,
  ListUserJobsResult,
} from "./types.ts";

export async function listUserJobs(
  deps: ImageJobGatewayDeps,
  input: { userId: string },
): Promise<ListUserJobsResult> {
  if (!input.userId) return { ok: false, code: "unauthorized" };

  const [jobs, models] = await Promise.all([
    deps.jobs.listByUser(input.userId),
    deps.catalog.list(),
  ]);
  const catalogById = new Map(models.map((model) => [model.id, model]));

  const items: ImageJobHistoryItem[] = [];
  for (const job of jobs) {
    const project = await deps.projects.get(job.projectId);
    const revs = await deps.revs.listByJob(job.id);
    const live = catalogById.get(job.catalogModelId);
    items.push({
      id: job.id,
      projectId: job.projectId,
      projectAlive: Boolean(project),
      action: job.action,
      slot: job.slot,
      displayNameSnapshot: job.displayNameSnapshot,
      status: job.status,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      modelDisabled: live ? !live.enabled : true,
      imageUrls: revs.map((rev) => rev.url),
    });
  }

  return { ok: true, jobs: items };
}
