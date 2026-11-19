import { beijingCalendarDay } from "./beijing-day.ts";
import { concurrencyBlock } from "./concurrency.ts";
import { newEntityId } from "./ids.ts";
import { cloneModel } from "./availability.ts";
import { DEFAULT_DAILY_IMAGE_CAP, effectiveDailyCap, quotaFromParts } from "./quota.ts";
import { decodeDataUrl } from "./durable.ts";
import { projectCoverUrl } from "../project/summary.ts";
import type {
  BoostLedgerEntry,
  CatalogModel,
  ImageBlobRecord,
  ImageBytes,
  ImageBytesFetcher,
  ImageJobErrorCode,
  ImageJobRecord,
  ImageRevRecord,
  ImageUpstream,
  ImageUpstreamRequest,
  ProjectDocumentSnapshot,
  ProjectSummary,
  StudioProjectRecord,
  StudioRole,
} from "./types.ts";
import type {
  ImageBlobStore,
  ImageHideAuditRecord,
  ImageHideAuditStore,
  ImageJobGatewayDeps,
  ImageJobStore,
  ImageRevStore,
  ModelCatalogStore,
  QuotaStore,
  RoleStore,
  StudioProjectStore,
} from "./stores.ts";

function cloneJob(job: ImageJobRecord): ImageJobRecord {
  return { ...job };
}

function cloneRev(rev: ImageRevRecord): ImageRevRecord {
  return { ...rev };
}

function cloneBlob(blob: ImageBlobRecord): ImageBlobRecord {
  return { ...blob, bytes: new Uint8Array(blob.bytes) };
}

function cloneProject(project: StudioProjectRecord): StudioProjectRecord {
  return { ...project };
}

export function createMemoryCatalog(seed: CatalogModel[]): ModelCatalogStore {
  const models = new Map(seed.map((model) => [model.id, cloneModel(model)]));
  return {
    async list() {
      return [...models.values()].map(cloneModel);
    },
    async get(id) {
      const model = models.get(id);
      return model ? cloneModel(model) : null;
    },
    async setEnabled(id, enabled) {
      const model = models.get(id);
      if (model) model.enabled = enabled;
    },
    async setDisplayName(id, displayName) {
      const model = models.get(id);
      if (model) model.displayName = displayName;
    },
    async setAdminDefault(id) {
      for (const model of models.values()) {
        if (model.kind === "image") model.isAdminDefault = model.id === id;
      }
    },
  };
}

export function createMemoryProjects(seed: StudioProjectRecord[] = []): StudioProjectStore {
  const projects = new Map(seed.map((project) => [project.id, cloneProject(project)]));
  const documents = new Map<string, ProjectDocumentSnapshot>();
  const snapshotOf = (id: string): ProjectDocumentSnapshot => {
    const stored = documents.get(id);
    return stored ? structuredClone(stored) : { document: null, version: 0, updatedAt: null };
  };
  return {
    async create(record) {
      const next = cloneProject({
        ...record,
        deletedAt: record.deletedAt ?? null,
      });
      projects.set(next.id, next);
      return cloneProject(next);
    },
    async get(id) {
      const project = projects.get(id);
      return project ? cloneProject(project) : null;
    },
    async updateCurrentModel(id, modelId) {
      const project = projects.get(id);
      if (!project || project.deletedAt !== null) return null;
      project.currentImageModelId = modelId;
      return cloneProject(project);
    },
    async markDeleted(id, deletedAt) {
      const project = projects.get(id);
      if (!project) return null;
      if (project.deletedAt === null) project.deletedAt = deletedAt;
      return cloneProject(project);
    },
    async getDocument(id) {
      return projects.has(id) ? snapshotOf(id) : null;
    },
    async listSummaries(userId) {
      const rows: ProjectSummary[] = [];
      for (const project of projects.values()) {
        if (project.userId !== userId || project.deletedAt !== null) continue;
        const stored = documents.get(project.id);
        if (!stored?.document || stored.updatedAt === null) continue;
        rows.push({
          id: project.id,
          name: stored.document.name,
          stage: stored.document.phase,
          coverUrl: projectCoverUrl(stored.document),
          updatedAt: stored.updatedAt,
          createdAt: stored.document.createdAt,
        });
      }
      return rows;
    },
    async saveDocument(id, document, expectedVersion, now) {
      const project = projects.get(id);
      if (!project) return { status: "not_found" };
      if (project.deletedAt !== null) return { status: "deleted" };
      const current = snapshotOf(id);
      if (current.version !== expectedVersion) return { status: "conflict", current };
      documents.set(id, {
        document: structuredClone(document),
        version: current.version + 1,
        updatedAt: now,
      });
      return { status: "saved", snapshot: snapshotOf(id) };
    },
  };
}

export function createMemoryQuota(initialCap = DEFAULT_DAILY_IMAGE_CAP): QuotaStore & {
  tryReserve: (record: ImageJobRecord) => boolean;
} {
  let cap = initialCap;
  const used = new Map<string, number>();
  const userCaps = new Map<string, number>();
  const boost = new Map<string, number>();
  const ledger: BoostLedgerEntry[] = [];
  const capFor = (userId: string) =>
    effectiveDailyCap(cap, userCaps.has(userId) ? (userCaps.get(userId) ?? null) : null);
  return {
    async getCap() {
      return cap;
    },
    async setCap(next) {
      cap = next;
      return cap;
    },
    async setUserCap(userId, next) {
      userCaps.set(userId, next);
    },
    async clearUserCap(userId) {
      userCaps.delete(userId);
    },
    async addBoost(input) {
      const next = (boost.get(input.userId) ?? 0) + input.amount;
      boost.set(input.userId, next);
      ledger.push({
        userId: input.userId,
        kind: "grant",
        amount: input.amount,
        at: input.at,
        adminId: input.adminId,
        note: input.note,
      });
      return next;
    },
    async listBoostLedger(userId) {
      return ledger.filter((entry) => entry.userId === userId).map((entry) => ({ ...entry }));
    },
    async snapshot(userId, atMs) {
      const day = beijingCalendarDay(atMs);
      return quotaFromParts(
        capFor(userId),
        used.get(`${userId}:${day}`) ?? 0,
        day,
        boost.get(userId) ?? 0,
      );
    },
    tryReserve(record) {
      const day = beijingCalendarDay(record.createdAt);
      const key = `${record.userId}:${day}`;
      const current = used.get(key) ?? 0;
      if (current < capFor(record.userId)) {
        used.set(key, current + 1);
        return true;
      }
      const balance = boost.get(record.userId) ?? 0;
      if (balance <= 0) return false;
      boost.set(record.userId, balance - 1);
      ledger.push({
        userId: record.userId,
        kind: "debit",
        amount: 1,
        at: record.createdAt,
        adminId: null,
        note: record.id,
      });
      return true;
    },
  };
}

export function createMemoryRoles(seed: Record<string, StudioRole> = {}): RoleStore {
  const roles = new Map<string, StudioRole>(Object.entries(seed));
  return {
    async getRole(userId) {
      return roles.get(userId) ?? "user";
    },
    async setRole(userId, role) {
      roles.set(userId, role);
    },
    async hasAdmin() {
      return [...roles.values()].includes("admin");
    },
  };
}

export function createMemoryJobs(reserve: (record: ImageJobRecord) => boolean): ImageJobStore {
  const jobs = new Map<string, ImageJobRecord>();
  return {
    async insertReserved(record) {
      const running = [...jobs.values()].filter(
        (job) => job.userId === record.userId && job.status === "running",
      );
      const blocked = concurrencyBlock(
        { projectId: record.projectId, slot: record.slot },
        running.map((job) => ({ projectId: job.projectId, slot: job.slot })),
      );
      if (blocked) return { ok: false, code: blocked };
      if (!reserve(record)) return { ok: false, code: "quota_exceeded" };
      const next = cloneJob(record);
      jobs.set(next.id, next);
      return { ok: true, job: cloneJob(next) };
    },
    async get(id) {
      const job = jobs.get(id);
      return job ? cloneJob(job) : null;
    },
    async listByUser(userId) {
      return [...jobs.values()]
        .filter((job) => job.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
        .map(cloneJob);
    },
    async finish(id, status, errorCode, finishedAt, costInUsdTicks) {
      const job = jobs.get(id);
      if (!job) return null;
      job.status = status;
      job.errorCode = errorCode;
      job.finishedAt = finishedAt;
      job.costInUsdTicks = costInUsdTicks;
      return cloneJob(job);
    },
    async listInRange(fromMs, toMs) {
      return [...jobs.values()]
        .filter((job) => job.createdAt >= fromMs && job.createdAt < toMs)
        .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map(cloneJob);
    },
  };
}

export function createMemoryRevs(): ImageRevStore {
  const revs: ImageRevRecord[] = [];
  return {
    async append(record) {
      const next = cloneRev(record);
      revs.push(next);
      return cloneRev(next);
    },
    async listByJob(jobId) {
      return revs.filter((rev) => rev.jobId === jobId).map(cloneRev);
    },
    async deleteByProject(projectId) {
      for (let index = revs.length - 1; index >= 0; index -= 1) {
        if (revs[index]?.projectId === projectId) revs.splice(index, 1);
      }
    },
  };
}

export function createMemoryHideAudit(): ImageHideAuditStore {
  const rows: ImageHideAuditRecord[] = [];
  return {
    async append(record) {
      const next = { ...record };
      rows.push(next);
      return { ...next };
    },
    async listByImage(imageId) {
      return rows.filter((row) => row.imageId === imageId).map((row) => ({ ...row }));
    },
  };
}

export function createMemoryBlobs(): ImageBlobStore {
  const blobs = new Map<string, ImageBlobRecord>();
  return {
    async put(record) {
      const next = cloneBlob(record);
      blobs.set(next.id, next);
      return cloneBlob(next);
    },
    async get(id) {
      const blob = blobs.get(id);
      return blob ? cloneBlob(blob) : null;
    },
    async deleteByProject(projectId) {
      for (const [id, blob] of blobs) {
        if (blob.projectId === projectId) blobs.delete(id);
      }
    },
    async setHidden(id, hidden) {
      const blob = blobs.get(id);
      if (!blob) return false;
      blob.hidden = hidden;
      return true;
    },
    async listGenerated({ query, limit }) {
      const q = query.trim().toLowerCase();
      return [...blobs.values()]
        .filter((blob) => blob.kind === "job")
        .filter((blob) => !q || blob.userId.toLowerCase().includes(q))
        .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
        .slice(0, limit)
        .map((blob) => ({
          id: blob.id,
          userId: blob.userId,
          userName: null,
          userEmail: null,
          projectId: blob.projectId,
          createdAt: blob.createdAt,
          hidden: blob.hidden === true,
          contentType: blob.contentType,
        }));
    },
    async listHiddenIds(userId) {
      return [...blobs.values()]
        .filter((blob) => blob.userId === userId && blob.hidden === true)
        .map((blob) => blob.id);
    },
  };
}

export async function defaultMemoryFetchImage(url: string): Promise<ImageBytes | null> {
  if (url.startsWith("data:")) return decodeDataUrl(url);
  if (!url.startsWith("https://img.example/")) return null;
  return {
    bytes: new TextEncoder().encode(url),
    contentType: "image/png",
  };
}

export const DEFAULT_IMAGE_MODEL_ID = "mdl-imagine-2";
export const DEFAULT_CHAT_MODEL_ID = "mdl-grok-chat";

export function defaultCatalogSeed(): CatalogModel[] {
  return [
    {
      id: DEFAULT_IMAGE_MODEL_ID,
      kind: "image",
      displayName: "Grok Imagine 2.0",
      upstreamId: "grok-imagine-image-2.0",
      enabled: true,
      capabilities: ["direction", "generate", "tune", "compose"],
      isAdminDefault: true,
    },
    {
      id: DEFAULT_CHAT_MODEL_ID,
      kind: "chat",
      displayName: "Grok 4.5",
      upstreamId: "grok-4.5",
      enabled: true,
      capabilities: [],
      isAdminDefault: false,
    },
  ];
}

export function recordingUpstream(impl?: ImageUpstream["run"]): {
  upstream: ImageUpstream;
  calls: ImageUpstreamRequest[];
} {
  const calls: ImageUpstreamRequest[] = [];
  return {
    calls,
    upstream: {
      async run(request) {
        calls.push(request);
        if (impl) return impl(request);
        return { ok: true, urls: ["https://img.example/a.png"] };
      },
    },
  };
}

export function createMemoryGatewayWorld(opts?: {
  models?: CatalogModel[];
  project?: Partial<StudioProjectRecord>;
  userId?: string;
  projectId?: string;
  upstream?: ImageUpstream["run"];
  fetchImage?: ImageBytesFetcher;
  cap?: number;
  now?: () => number;
  roles?: Record<string, StudioRole>;
}): ImageJobGatewayDeps & {
  userId: string;
  projectId: string;
  calls: ImageUpstreamRequest[];
  catalog: ModelCatalogStore;
  projects: StudioProjectStore;
  jobs: ImageJobStore;
  revs: ImageRevStore;
  blobs: ImageBlobStore;
  quota: QuotaStore;
  roles: RoleStore;
} {
  const userId = opts?.userId ?? "user-1";
  const projectId = opts?.projectId ?? "prj_test";
  const { upstream, calls } = recordingUpstream(opts?.upstream);
  const catalog = createMemoryCatalog(opts?.models ?? defaultCatalogSeed());
  const projects = createMemoryProjects([
    {
      id: projectId,
      userId,
      currentImageModelId: DEFAULT_IMAGE_MODEL_ID,
      createdAt: 1,
      deletedAt: null,
      ...opts?.project,
    },
  ]);
  const quota = createMemoryQuota(opts?.cap ?? DEFAULT_DAILY_IMAGE_CAP);
  return {
    catalog,
    projects,
    jobs: createMemoryJobs((record) => quota.tryReserve(record)),
    revs: createMemoryRevs(),
    blobs: createMemoryBlobs(),
    audit: createMemoryHideAudit(),
    fetchImage: opts?.fetchImage ?? defaultMemoryFetchImage,
    quota,
    roles: createMemoryRoles(opts?.roles),
    upstream,
    now: opts?.now ?? (() => 1_700_000_000_000),
    newId: (prefix) => newEntityId(prefix),
    userId,
    projectId,
    calls,
  };
}
