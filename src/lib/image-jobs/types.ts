export const IMAGE_JOB_ACTIONS = [
  "direction",
  "generate",
  "tune",
  "compose",
] as const;

export type ImageJobAction = (typeof IMAGE_JOB_ACTIONS)[number];

export const IMAGE_JOB_SLOTS = ["ui_hero", "kv", "web_home"] as const;

export type ImageJobSlot = (typeof IMAGE_JOB_SLOTS)[number];

export const IMAGE_JOB_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "model_disabled",
  "images_unavailable",
  "capability_denied",
  "quota_exceeded",
  "in_flight",
  "upstream_failed",
] as const;

export type ImageJobErrorCode = (typeof IMAGE_JOB_ERROR_CODES)[number];

export type ModelKind = "image" | "chat";

export type CatalogModel = {
  id: string;
  kind: ModelKind;
  displayName: string;
  upstreamId: string;
  enabled: boolean;
  capabilities: ImageJobAction[];
  isAdminDefault: boolean;
};

export type StudioProjectRecord = {
  id: string;
  userId: string;
  currentImageModelId: string;
  createdAt: number;
};

export type ImageJobStatus = "running" | "succeeded" | "failed";

export type ImageJobRecord = {
  id: string;
  userId: string;
  projectId: string;
  action: ImageJobAction;
  slot: ImageJobSlot | null;
  catalogModelId: string;
  upstreamModelId: string;
  displayNameSnapshot: string;
  status: ImageJobStatus;
  errorCode: ImageJobErrorCode | null;
  createdAt: number;
  finishedAt: number | null;
};

export type ImageRevRecord = {
  id: string;
  jobId: string;
  projectId: string;
  userId: string;
  url: string;
  action: ImageJobAction;
  createdAt: number;
};

export type PickerImageModel = {
  id: string;
  displayName: string;
};

export type ActionAvailability = {
  enabled: boolean;
  code: ImageJobErrorCode | null;
  reason: string | null;
};

export type StudioQuota = {
  cap: number;
  used: number;
  remaining: number;
  beijingDay: string;
};

export type StudioRole = "user" | "admin";

export type StudioImageState = {
  picker: PickerImageModel[];
  currentImageModelId: string;
  currentDisplayName: string | null;
  imagesUnavailable: boolean;
  modelDisabled: boolean;
  actions: Record<ImageJobAction, ActionAvailability>;
  quota: StudioQuota;
};

export type RunImageJobInput = {
  userId: string;
  projectId: string;
  action: ImageJobAction;
  /** Named material slot; direction candidates always persist as null. */
  slot?: ImageJobSlot | null;
  prompt: string;
  aspect?: string;
  n?: number;
  imageUrl?: string;
  /** Ignored — jobs always use the project's current model. */
  clientModelId?: string;
};

export type RunImageJobSuccess = {
  ok: true;
  job: ImageJobRecord;
  revs: ImageRevRecord[];
};

export type RunImageJobFailure = {
  ok: false;
  code: ImageJobErrorCode;
  job?: ImageJobRecord;
};

export type RunImageJobResult = RunImageJobSuccess | RunImageJobFailure;

export type ImageUpstreamRequest = {
  action: ImageJobAction;
  upstreamModelId: string;
  prompt: string;
  aspect: string;
  n: number;
  imageUrl?: string;
};

export type ImageUpstreamResult =
  | { ok: true; urls: string[] }
  | { ok: false };

export type ImageUpstream = {
  run: (request: ImageUpstreamRequest) => Promise<ImageUpstreamResult>;
};
