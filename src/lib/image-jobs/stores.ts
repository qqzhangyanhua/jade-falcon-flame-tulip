import type {
  CatalogModel,
  ImageJobErrorCode,
  ImageJobRecord,
  ImageRevRecord,
  StudioProjectRecord,
} from "./types.ts";

export type ModelCatalogStore = {
  list: () => Promise<CatalogModel[]>;
  get: (id: string) => Promise<CatalogModel | null>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  setDisplayName: (id: string, displayName: string) => Promise<void>;
};

export type StudioProjectStore = {
  create: (record: StudioProjectRecord) => Promise<StudioProjectRecord>;
  get: (id: string) => Promise<StudioProjectRecord | null>;
  updateCurrentModel: (id: string, modelId: string) => Promise<StudioProjectRecord | null>;
};

export type ImageJobStore = {
  insert: (record: ImageJobRecord) => Promise<ImageJobRecord>;
  get: (id: string) => Promise<ImageJobRecord | null>;
  finish: (
    id: string,
    status: "succeeded" | "failed",
    errorCode: ImageJobErrorCode | null,
    finishedAt: number,
  ) => Promise<ImageJobRecord | null>;
};

export type ImageRevStore = {
  append: (record: ImageRevRecord) => Promise<ImageRevRecord>;
  listByJob: (jobId: string) => Promise<ImageRevRecord[]>;
};

export type ImageJobGatewayDeps = {
  catalog: ModelCatalogStore;
  projects: StudioProjectStore;
  jobs: ImageJobStore;
  revs: ImageRevStore;
  upstream: ImageUpstreamLike;
  now?: () => number;
  newId?: (prefix: string) => string;
};

export type ImageUpstreamLike = {
  run: (request: import("./types.ts").ImageUpstreamRequest) => Promise<
    import("./types.ts").ImageUpstreamResult
  >;
};
