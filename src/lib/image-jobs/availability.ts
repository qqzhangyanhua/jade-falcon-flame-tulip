import { CAPABILITY_DENIED_REASONS, IMAGE_JOB_USER_MESSAGES } from "./errors.ts";
import { applyQuotaToStudioState, emptyQuota } from "./quota.ts";
import type {
  ActionAvailability,
  CatalogModel,
  ImageJobAction,
  ImageJobErrorCode,
  PickerImageModel,
  StudioImageState,
  StudioQuota,
} from "./types.ts";
import { IMAGE_JOB_ACTIONS } from "./types.ts";

export function cloneModel(model: CatalogModel): CatalogModel {
  return {
    ...model,
    capabilities: [...model.capabilities],
  };
}

export function listEnabledImagePicker(models: CatalogModel[]): PickerImageModel[] {
  return models
    .filter((model) => model.kind === "image" && model.enabled)
    .map((model) => ({ id: model.id, displayName: model.displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "zh"));
}

export function resolveNewProjectModelId(models: CatalogModel[]): string {
  const images = models.filter((model) => model.kind === "image");
  const adminDefault = images.find((model) => model.isAdminDefault);
  return adminDefault?.id ?? images[0]?.id ?? "";
}

export type ActionVerdict =
  | { ok: true; model: CatalogModel }
  | { ok: false; code: ImageJobErrorCode; reason: string };

export function evaluateImageAction(opts: {
  models: CatalogModel[];
  current: CatalogModel | null;
  action: ImageJobAction;
}): ActionVerdict {
  const enabledImages = opts.models.filter(
    (model) => model.kind === "image" && model.enabled,
  );
  if (enabledImages.length === 0) {
    return {
      ok: false,
      code: "images_unavailable",
      reason: IMAGE_JOB_USER_MESSAGES.images_unavailable,
    };
  }
  if (!opts.current || opts.current.kind !== "image" || !opts.current.enabled) {
    return {
      ok: false,
      code: "model_disabled",
      reason: IMAGE_JOB_USER_MESSAGES.model_disabled,
    };
  }
  if (!opts.current.capabilities.includes(opts.action)) {
    return {
      ok: false,
      code: "capability_denied",
      reason: CAPABILITY_DENIED_REASONS[opts.action],
    };
  }
  return { ok: true, model: opts.current };
}

function availabilityFromVerdict(verdict: ActionVerdict): ActionAvailability {
  if (verdict.ok) {
    return { enabled: true, code: null, reason: null };
  }
  return { enabled: false, code: verdict.code, reason: verdict.reason };
}

export function buildStudioImageState(opts: {
  models: CatalogModel[];
  currentImageModelId: string;
  quota?: StudioQuota;
}): StudioImageState {
  const picker = listEnabledImagePicker(opts.models);
  const current =
    opts.models.find((model) => model.id === opts.currentImageModelId) ?? null;
  const actions = Object.fromEntries(
    IMAGE_JOB_ACTIONS.map((action) => [
      action,
      availabilityFromVerdict(
        evaluateImageAction({ models: opts.models, current, action }),
      ),
    ]),
  ) as Record<ImageJobAction, ActionAvailability>;
  const sample = evaluateImageAction({
    models: opts.models,
    current,
    action: "generate",
  });
  const base: StudioImageState = {
    picker,
    currentImageModelId: opts.currentImageModelId,
    currentDisplayName: current?.displayName ?? null,
    imagesUnavailable: picker.length === 0,
    modelDisabled: !sample.ok && sample.code === "model_disabled",
    actions,
    quota: opts.quota ?? emptyQuota(0, ""),
  };
  return opts.quota ? applyQuotaToStudioState(base, opts.quota) : base;
}
