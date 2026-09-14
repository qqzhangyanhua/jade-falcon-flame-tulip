import type { Sql } from "../db.ts";
import { IMAGE_JOB_ACTIONS, type ImageJobAction } from "./types.ts";
import type {
  CatalogModel,
  ImageJobErrorCode,
  ImageJobRecord,
  ImageJobStatus,
  ImageRevRecord,
  StudioProjectRecord,
} from "./types.ts";
import type {
  ImageJobStore,
  ImageRevStore,
  ModelCatalogStore,
  StudioProjectStore,
} from "./stores.ts";

type CatalogRow = {
  id: string;
  kind: string;
  display_name: string;
  upstream_id: string;
  enabled: boolean;
  capabilities: string;
  is_admin_default: boolean;
};

type ProjectRow = {
  id: string;
  user_id: string;
  current_image_model_id: string;
  created_at_ms: number;
};

type JobRow = {
  id: string;
  user_id: string;
  project_id: string;
  action: string;
  catalog_model_id: string;
  upstream_model_id: string;
  display_name_snapshot: string;
  status: string;
  error_code: string | null;
  created_at_ms: number;
  finished_at_ms: number | null;
};

type RevRow = {
  id: string;
  job_id: string;
  project_id: string;
  user_id: string;
  url: string;
  action: string;
  created_at_ms: number;
};

function parseCapabilities(raw: string): ImageJobAction[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is ImageJobAction =>
      (IMAGE_JOB_ACTIONS as readonly string[]).includes(part),
    );
}

function toModel(row: CatalogRow): CatalogModel {
  return {
    id: row.id,
    kind: row.kind === "chat" ? "chat" : "image",
    displayName: row.display_name,
    upstreamId: row.upstream_id,
    enabled: Boolean(row.enabled),
    capabilities: parseCapabilities(row.capabilities ?? ""),
    isAdminDefault: Boolean(row.is_admin_default),
  };
}

function toProject(row: ProjectRow): StudioProjectRecord {
  return {
    id: row.id,
    userId: row.user_id,
    currentImageModelId: row.current_image_model_id,
    createdAt: Number(row.created_at_ms),
  };
}

function toJob(row: JobRow): ImageJobRecord {
  const action = (IMAGE_JOB_ACTIONS as readonly string[]).includes(row.action)
    ? (row.action as ImageJobAction)
    : "generate";
  const status: ImageJobStatus =
    row.status === "succeeded" || row.status === "failed" ? row.status : "running";
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    action,
    catalogModelId: row.catalog_model_id,
    upstreamModelId: row.upstream_model_id,
    displayNameSnapshot: row.display_name_snapshot,
    status,
    errorCode: row.error_code as ImageJobErrorCode | null,
    createdAt: Number(row.created_at_ms),
    finishedAt: row.finished_at_ms === null ? null : Number(row.finished_at_ms),
  };
}

function toRev(row: RevRow): ImageRevRecord {
  const action = (IMAGE_JOB_ACTIONS as readonly string[]).includes(row.action)
    ? (row.action as ImageJobAction)
    : "generate";
  return {
    id: row.id,
    jobId: row.job_id,
    projectId: row.project_id,
    userId: row.user_id,
    url: row.url,
    action,
    createdAt: Number(row.created_at_ms),
  };
}

export function createSqlCatalogStore(sql: Sql): ModelCatalogStore {
  return {
    async list() {
      const rows = await sql<CatalogRow>`
        select id, kind, display_name, upstream_id, enabled, capabilities, is_admin_default
        from model_catalog
        order by display_name
      `;
      return rows.map(toModel);
    },
    async get(id) {
      const rows = await sql<CatalogRow>`
        select id, kind, display_name, upstream_id, enabled, capabilities, is_admin_default
        from model_catalog
        where id = ${id}
      `;
      return rows[0] ? toModel(rows[0]) : null;
    },
    async setEnabled(id, enabled) {
      await sql`
        update model_catalog
        set enabled = ${enabled}
        where id = ${id}
      `;
    },
    async setDisplayName(id, displayName) {
      await sql`
        update model_catalog
        set display_name = ${displayName}
        where id = ${id}
      `;
    },
  };
}

export function createSqlProjectStore(sql: Sql): StudioProjectStore {
  return {
    async create(record) {
      const rows = await sql<ProjectRow>`
        insert into studio_projects (id, user_id, current_image_model_id, created_at)
        values (
          ${record.id},
          ${record.userId},
          ${record.currentImageModelId},
          to_timestamp(${record.createdAt / 1000})
        )
        returning
          id,
          user_id,
          current_image_model_id,
          (extract(epoch from created_at) * 1000) as created_at_ms
      `;
      return rows[0] ? toProject(rows[0]) : record;
    },
    async get(id) {
      const rows = await sql<ProjectRow>`
        select
          id,
          user_id,
          current_image_model_id,
          (extract(epoch from created_at) * 1000) as created_at_ms
        from studio_projects
        where id = ${id}
      `;
      return rows[0] ? toProject(rows[0]) : null;
    },
    async updateCurrentModel(id, modelId) {
      const rows = await sql<ProjectRow>`
        update studio_projects
        set current_image_model_id = ${modelId}
        where id = ${id}
        returning
          id,
          user_id,
          current_image_model_id,
          (extract(epoch from created_at) * 1000) as created_at_ms
      `;
      return rows[0] ? toProject(rows[0]) : null;
    },
  };
}

export function createSqlJobStore(sql: Sql): ImageJobStore {
  return {
    async insert(record) {
      const rows = await sql<JobRow>`
        insert into image_jobs (
          id, user_id, project_id, action,
          catalog_model_id, upstream_model_id, display_name_snapshot,
          status, error_code, created_at, finished_at
        )
        values (
          ${record.id},
          ${record.userId},
          ${record.projectId},
          ${record.action},
          ${record.catalogModelId},
          ${record.upstreamModelId},
          ${record.displayNameSnapshot},
          ${record.status},
          ${record.errorCode},
          to_timestamp(${record.createdAt / 1000}),
          null
        )
        returning
          id, user_id, project_id, action,
          catalog_model_id, upstream_model_id, display_name_snapshot,
          status, error_code,
          (extract(epoch from created_at) * 1000) as created_at_ms,
          case when finished_at is null then null
               else extract(epoch from finished_at) * 1000 end as finished_at_ms
      `;
      return rows[0] ? toJob(rows[0]) : record;
    },
    async get(id) {
      const rows = await sql<JobRow>`
        select
          id, user_id, project_id, action,
          catalog_model_id, upstream_model_id, display_name_snapshot,
          status, error_code,
          (extract(epoch from created_at) * 1000) as created_at_ms,
          case when finished_at is null then null
               else extract(epoch from finished_at) * 1000 end as finished_at_ms
        from image_jobs
        where id = ${id}
      `;
      return rows[0] ? toJob(rows[0]) : null;
    },
    async finish(id, status, errorCode, finishedAt) {
      const rows = await sql<JobRow>`
        update image_jobs
        set
          status = ${status},
          error_code = ${errorCode},
          finished_at = to_timestamp(${finishedAt / 1000})
        where id = ${id}
        returning
          id, user_id, project_id, action,
          catalog_model_id, upstream_model_id, display_name_snapshot,
          status, error_code,
          (extract(epoch from created_at) * 1000) as created_at_ms,
          case when finished_at is null then null
               else extract(epoch from finished_at) * 1000 end as finished_at_ms
      `;
      return rows[0] ? toJob(rows[0]) : null;
    },
  };
}

export function createSqlRevStore(sql: Sql): ImageRevStore {
  return {
    async append(record) {
      const rows = await sql<RevRow>`
        insert into image_revs (id, job_id, project_id, user_id, url, action, created_at)
        values (
          ${record.id},
          ${record.jobId},
          ${record.projectId},
          ${record.userId},
          ${record.url},
          ${record.action},
          to_timestamp(${record.createdAt / 1000})
        )
        returning
          id, job_id, project_id, user_id, url, action,
          (extract(epoch from created_at) * 1000) as created_at_ms
      `;
      return rows[0] ? toRev(rows[0]) : record;
    },
    async listByJob(jobId) {
      const rows = await sql<RevRow>`
        select
          id, job_id, project_id, user_id, url, action,
          (extract(epoch from created_at) * 1000) as created_at_ms
        from image_revs
        where job_id = ${jobId}
        order by created_at
      `;
      return rows.map(toRev);
    },
  };
}
