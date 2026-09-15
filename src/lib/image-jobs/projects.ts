import { newEntityId } from "./ids.ts";
import {
  buildStudioImageState,
  listEnabledImagePicker,
  resolveNewProjectModelId,
} from "./availability.ts";
import { ImageJobError } from "./errors.ts";
import type { ModelCatalogStore, QuotaStore, StudioProjectStore } from "./stores.ts";
import type {
  ImageJobErrorCode,
  PickerImageModel,
  StudioImageState,
  StudioProjectRecord,
} from "./types.ts";

export type ProjectOpResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ImageJobErrorCode };

async function requireUser(userId: string): Promise<ImageJobErrorCode | null> {
  return userId ? null : "unauthorized";
}

export async function createStudioProject(
  catalog: ModelCatalogStore,
  projects: StudioProjectStore,
  input: { userId: string; id?: string },
): Promise<ProjectOpResult<StudioProjectRecord>> {
  const authError = await requireUser(input.userId);
  if (authError) return { ok: false, code: authError };

  const id = input.id ?? newEntityId("prj");
  const existing = await projects.get(id);
  if (existing) {
    if (existing.userId !== input.userId) return { ok: false, code: "forbidden" };
    return { ok: true, value: existing };
  }

  const models = await catalog.list();
  const currentImageModelId = resolveNewProjectModelId(models);
  const created = await projects.create({
    id,
    userId: input.userId,
    currentImageModelId,
    createdAt: Date.now(),
  });
  return { ok: true, value: created };
}

export async function ensureStudioProject(
  catalog: ModelCatalogStore,
  projects: StudioProjectStore,
  input: { userId: string; projectId: string },
): Promise<ProjectOpResult<StudioProjectRecord>> {
  return createStudioProject(catalog, projects, {
    userId: input.userId,
    id: input.projectId,
  });
}

export async function pickProjectImageModel(
  catalog: ModelCatalogStore,
  projects: StudioProjectStore,
  input: { userId: string; projectId: string; modelId: string },
): Promise<ProjectOpResult<StudioProjectRecord>> {
  const authError = await requireUser(input.userId);
  if (authError) return { ok: false, code: authError };

  const project = await projects.get(input.projectId);
  if (!project) return { ok: false, code: "not_found" };
  if (project.userId !== input.userId) return { ok: false, code: "forbidden" };

  const picker = listEnabledImagePicker(await catalog.list());
  if (picker.length === 0) return { ok: false, code: "images_unavailable" };

  const chosen = picker.find((model) => model.id === input.modelId);
  if (!chosen) {
    const model = await catalog.get(input.modelId);
    if (model?.kind === "image" && !model.enabled) {
      return { ok: false, code: "model_disabled" };
    }
    return { ok: false, code: "not_found" };
  }

  const updated = await projects.updateCurrentModel(project.id, chosen.id);
  if (!updated) return { ok: false, code: "not_found" };
  return { ok: true, value: updated };
}

export async function listImageModelPicker(
  catalog: ModelCatalogStore,
): Promise<PickerImageModel[]> {
  return listEnabledImagePicker(await catalog.list());
}

export async function getStudioImageState(
  catalog: ModelCatalogStore,
  projects: StudioProjectStore,
  quota: QuotaStore,
  input: { userId: string; projectId: string; now: number },
): Promise<ProjectOpResult<StudioImageState>> {
  const authError = await requireUser(input.userId);
  if (authError) return { ok: false, code: authError };

  const project = await projects.get(input.projectId);
  if (!project) return { ok: false, code: "not_found" };
  if (project.userId !== input.userId) return { ok: false, code: "forbidden" };

  const models = await catalog.list();
  const snapshot = await quota.snapshot(input.userId, input.now);
  return {
    ok: true,
    value: buildStudioImageState({
      models,
      currentImageModelId: project.currentImageModelId,
      quota: snapshot,
    }),
  };
}

export function unwrapProjectOp<T>(result: ProjectOpResult<T>): T {
  if (!result.ok) throw new ImageJobError(result.code);
  return result.value;
}
