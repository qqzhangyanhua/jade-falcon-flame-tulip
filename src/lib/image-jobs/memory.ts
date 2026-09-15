import { beijingCalendarDay } from "./beijing-day.ts";
import { concurrencyBlock } from "./concurrency.ts";
import { newEntityId } from "./ids.ts";
import { cloneModel } from "./availability.ts";
import { DEFAULT_DAILY_IMAGE_CAP, quotaFromParts } from "./quota.ts";
import type {
  CatalogModel,
  ImageJobErrorCode,
  ImageJobRecord,
  ImageRevRecord,
  ImageUpstream,
  ImageUpstreamRequest,
  StudioProjectRecord,
  StudioRole,
} from "./types.ts";
import type {
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

function cloneProject(project: StudioProjectRecord): StudioProjectRecord {
  return { ...project };
}

export function createMemoryCatalog(seed: CatalogModel[]): ModelCatalogStore {
  const models = new Map(
    seed.map((model) => [model.id, cloneModel(model)]),
  );
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
  };
}

export function createMemoryProjects(
  seed: StudioProjectRecord[] = [],
): StudioProjectStore {
  const projects = new Map(
    seed.map((project) => [project.id, cloneProject(project)]),
  );
  return {
    async create(record) {
      const next = cloneProject(record);
      projects.set(next.id, next);
      return cloneProject(next);
    },
    async get(id) {
      const project = projects.get(id);
      return project ? cloneProject(project) : null;
    },
    async updateCurrentModel(id, modelId) {
      const project = projects.get(id);
      if (!project) return null;
      project.currentImageModelId = modelId;
      return cloneProject(project);
    },
  };
}

export function createMemoryQuota(initialCap = DEFAULT_DAILY_IMAGE_CAP): QuotaStore & {
  tryReserve: (userId: string, atMs: number) => boolean;
} {
  let cap = initialCap;
  const used = new Map<string, number>();
  return {
    async getCap() {
      return cap;
    },
    async setCap(next) {
      cap = next;
      return cap;
    },
    async snapshot(userId, atMs) {
      const day = beijingCalendarDay(atMs);
      return quotaFromParts(cap, used.get(`${userId}:${day}`) ?? 0, day);
    },
    tryReserve(userId, atMs) {
      const day = beijingCalendarDay(atMs);
      const key = `${userId}:${day}`;
      const current = used.get(key) ?? 0;
      if (current >= cap) return false;
      used.set(key, current + 1);
      return true;
    },
  };
}

export function createMemoryRoles(
  seed: Record<string, StudioRole> = {},
): RoleStore {
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

export function createMemoryJobs(
  reserve: (record: ImageJobRecord) => boolean,
): ImageJobStore {
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
    async finish(id, status, errorCode, finishedAt) {
      const job = jobs.get(id);
      if (!job) return null;
      job.status = status;
      job.errorCode = errorCode;
      job.finishedAt = finishedAt;
      return cloneJob(job);
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

export function recordingUpstream(
  impl?: ImageUpstream["run"],
): { upstream: ImageUpstream; calls: ImageUpstreamRequest[] } {
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
      ...opts?.project,
    },
  ]);
  const quota = createMemoryQuota(opts?.cap ?? DEFAULT_DAILY_IMAGE_CAP);
  return {
    catalog,
    projects,
    jobs: createMemoryJobs((record) => quota.tryReserve(record.userId, record.createdAt)),
    revs: createMemoryRevs(),
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
