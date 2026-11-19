import type { ProjectDocument } from "../project/schema.ts";
import { SLOT_IDS } from "../project/slots.ts";

export const IMAGE_JOB_ACTIONS = [
  "direction",
  "generate",
  "tune",
  "compose",
] as const;

export type ImageJobAction = (typeof IMAGE_JOB_ACTIONS)[number];

/** Built-in slot ids. A job may also store any other non-empty slot string. */
export const IMAGE_JOB_SLOTS = SLOT_IDS;

export type ImageJobSlot = string;

export const IMAGE_JOB_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "unknown_slot",
  "invalid_n",
  "model_disabled",
  "images_unavailable",
  "capability_denied",
  "quota_exceeded",
  "in_flight",
  "upstream_failed",
  "project_deleted",
  "invalid_image",
  "image_too_large",
  "version_conflict",
  "invalid_document",
  "document_too_large",
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

/** The server copy of a Project Document; `document` is null until the first save. */
export type ProjectDocumentSnapshot = {
  document: ProjectDocument | null;
  version: number;
  updatedAt: number | null;
};

/** One row of the recent-projects list; deliberately omits everything else in the document. */
export type ProjectSummary = {
  id: string;
  name: string;
  stage: ProjectDocument["phase"];
  coverUrl: string | null;
  updatedAt: number;
};

export type SaveDocumentOutcome =
  | { status: "saved"; snapshot: ProjectDocumentSnapshot }
  | { status: "conflict"; current: ProjectDocumentSnapshot }
  | { status: "deleted" }
  | { status: "not_found" };

export type StudioProjectRecord = {
  id: string;
  userId: string;
  currentImageModelId: string;
  createdAt: number;
  deletedAt: number | null;
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
  /**
   * Upstream fee in USD ticks (1 USD = 1e10). Null when usage was absent.
   * Stay in ticks until a screen formats dollars.
   */
  costInUsdTicks: bigint | null;
};

export type ImageRevRecord = {
  id: string;
  jobId: string;
  projectId: string;
  userId: string;
  /** Origin path of the durable copy. Never an upstream URL. */
  url: string;
  action: ImageJobAction;
  createdAt: number;
};

export type ImageBlobKind = "job" | "upload";

export type ImageBlobRecord = {
  id: string;
  userId: string;
  projectId: string;
  /** Null for user uploads, which belong to no generation job. */
  jobId: string | null;
  kind: ImageBlobKind;
  contentType: string;
  bytes: Uint8Array;
  createdAt: number;
};

export type DurableImageRef = {
  id: string;
  jobId: string;
  url: string;
  contentType: string;
};

export type OpenedDurableImage = Omit<DurableImageRef, "jobId"> & {
  jobId: string | null;
  bytes: Uint8Array;
};

export type ImageBytes = {
  bytes: Uint8Array;
  contentType: string;
};

export type ImageBytesFetcher = (url: string) => Promise<ImageBytes | null>;

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

/** One row of the admin user list. `cap` is the effective daily cap. */
export type AdminUserQuota = {
  id: string;
  name: string;
  email: string;
  used: number;
  cap: number;
  /** Null when the user follows the global cap. */
  userCap: number | null;
  /** Latest image job or session activity, or null when neither exists. */
  lastActiveAt: number | null;
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
  /** Ignored. Slot jobs use the built-in catalog or the project's custom slot; direction jobs stay 16:9. */
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

export type ImageJobHistoryItem = {
  id: string;
  projectId: string;
  projectAlive: boolean;
  action: ImageJobAction;
  slot: ImageJobSlot | null;
  displayNameSnapshot: string;
  status: ImageJobStatus;
  createdAt: number;
  finishedAt: number | null;
  /** Live catalog `enabled` flag — not a snapshot. */
  modelDisabled: boolean;
  imageUrls: string[];
};

export type ListUserJobsResult =
  | { ok: true; jobs: ImageJobHistoryItem[] }
  | { ok: false; code: "unauthorized" };

export type ImageUpstreamRequest = {
  action: ImageJobAction;
  upstreamModelId: string;
  prompt: string;
  aspect: string;
  n: number;
  imageUrl?: string;
};

export type ImageUpstreamResult =
  | { ok: true; urls: string[]; costInUsdTicks?: bigint | null }
  | { ok: false; costInUsdTicks?: bigint | null };

export type ImageUpstream = {
  run: (request: ImageUpstreamRequest) => Promise<ImageUpstreamResult>;
};
