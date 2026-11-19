import type { ProjectDocument } from "../project/schema.ts";
import type {
  CatalogModel,
  ImageBlobRecord,
  ImageBytesFetcher,
  ImageJobErrorCode,
  ImageJobRecord,
  ImageRevRecord,
  ProjectDocumentSnapshot,
  ProjectSummary,
  SaveDocumentOutcome,
  StudioProjectRecord,
  StudioQuota,
  StudioRole,
} from "./types.ts";

export type ModelCatalogStore = {
  list: () => Promise<CatalogModel[]>;
  get: (id: string) => Promise<CatalogModel | null>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  setDisplayName: (id: string, displayName: string) => Promise<void>;
  setAdminDefault: (id: string) => Promise<void>;
};

export type StudioProjectStore = {
  create: (record: StudioProjectRecord) => Promise<StudioProjectRecord>;
  get: (id: string) => Promise<StudioProjectRecord | null>;
  updateCurrentModel: (id: string, modelId: string) => Promise<StudioProjectRecord | null>;
  markDeleted: (id: string, deletedAt: number) => Promise<StudioProjectRecord | null>;
  getDocument: (id: string) => Promise<ProjectDocumentSnapshot | null>;
  /**
   * Every live project of this user that has a document. The caller searches,
   * sorts and pages. Never loads a whole document into the caller.
   */
  listSummaries: (userId: string) => Promise<ProjectSummary[]>;
  /**
   * Replace the document only if the stored version still equals
   * `expectedVersion` and the project is not deleted; both checks and the write
   * are one atomic step.
   */
  saveDocument: (
    id: string,
    document: ProjectDocument,
    expectedVersion: number,
    now: number,
  ) => Promise<SaveDocumentOutcome>;
};

export type ReservedJobInsert =
  { ok: true; job: ImageJobRecord } | { ok: false; code: "quota_exceeded" | "in_flight" };

export type ImageJobStore = {
  /** Insert a running job and reserve today's cap in one atomic step. */
  insertReserved: (record: ImageJobRecord) => Promise<ReservedJobInsert>;
  get: (id: string) => Promise<ImageJobRecord | null>;
  /** Current user's jobs only, newest first. */
  listByUser: (userId: string) => Promise<ImageJobRecord[]>;
  finish: (
    id: string,
    status: "succeeded" | "failed",
    errorCode: ImageJobErrorCode | null,
    finishedAt: number,
    costInUsdTicks: bigint | null,
  ) => Promise<ImageJobRecord | null>;
  /** Jobs created in [fromMs, toMs), oldest first. */
  listInRange: (fromMs: number, toMs: number) => Promise<ImageJobRecord[]>;
};

export type QuotaStore = {
  getCap: () => Promise<number>;
  setCap: (cap: number) => Promise<number>;
  snapshot: (userId: string, atMs: number) => Promise<StudioQuota>;
  /** Persist a per-user daily cap. It overrides the global cap, including 0. */
  setUserCap: (userId: string, cap: number) => Promise<void>;
  /** Drop the per-user cap so the user follows the global cap again. */
  clearUserCap: (userId: string) => Promise<void>;
};

export type RoleStore = {
  getRole: (userId: string) => Promise<StudioRole>;
  setRole: (userId: string, role: StudioRole) => Promise<void>;
  hasAdmin: () => Promise<boolean>;
};

export type ImageRevStore = {
  append: (record: ImageRevRecord) => Promise<ImageRevRecord>;
  listByJob: (jobId: string) => Promise<ImageRevRecord[]>;
  deleteByProject: (projectId: string) => Promise<void>;
};

export type ImageBlobStore = {
  put: (record: ImageBlobRecord) => Promise<ImageBlobRecord>;
  get: (id: string) => Promise<ImageBlobRecord | null>;
  deleteByProject: (projectId: string) => Promise<void>;
  /** False when the image id does not exist. Does not remove the bytes. */
  setHidden: (id: string, hidden: boolean) => Promise<boolean>;
  /**
   * Generated images only (`kind = job`), newest first.
   * `query` matches user id, and in SQL also name or email. Empty query lists everyone.
   */
  listGenerated: (input: { query: string; limit: number }) => Promise<GeneratedImageRow[]>;
  /** Hidden image ids owned by this user. No bytes. */
  listHiddenIds: (userId: string) => Promise<string[]>;
};

export type GeneratedImageRow = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  projectId: string;
  createdAt: number;
  hidden: boolean;
  contentType: string;
};

export type ImageHideAction = "hide" | "unhide";

export type ImageHideAuditRecord = {
  id: string;
  imageId: string;
  action: ImageHideAction;
  adminId: string;
  at: number;
  reason: string | null;
};

export type ImageHideAuditStore = {
  append: (record: ImageHideAuditRecord) => Promise<ImageHideAuditRecord>;
  /** Oldest first. */
  listByImage: (imageId: string) => Promise<ImageHideAuditRecord[]>;
};

export type ImageJobGatewayDeps = {
  catalog: ModelCatalogStore;
  projects: StudioProjectStore;
  jobs: ImageJobStore;
  revs: ImageRevStore;
  blobs: ImageBlobStore;
  audit: ImageHideAuditStore;
  quota: QuotaStore;
  roles: RoleStore;
  upstream: ImageUpstreamLike;
  fetchImage?: ImageBytesFetcher;
  now?: () => number;
  newId?: (prefix: string) => string;
};

export type ImageUpstreamLike = {
  run: (
    request: import("./types.ts").ImageUpstreamRequest,
  ) => Promise<import("./types.ts").ImageUpstreamResult>;
};
