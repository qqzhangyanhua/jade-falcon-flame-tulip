import type { Sql } from "../db";
import { beijingCalendarDay } from "./beijing-day";
import { MAX_PARALLEL_DIRECTION_JOBS } from "./concurrency";
import { DEFAULT_DAILY_IMAGE_CAP } from "./quota";
import {
  IMAGE_JOB_ACTIONS,
  IMAGE_JOB_SLOTS,
  type ImageJobAction,
  type ImageJobSlot,
} from "./types";
import type {
  CatalogModel,
  ImageBlobRecord,
  ImageJobErrorCode,
  ImageJobRecord,
  ImageJobStatus,
  ImageRevRecord,
  StudioProjectRecord,
} from "./types";
import type {
  ImageBlobStore,
  ImageJobStore,
  ImageRevStore,
  ModelCatalogStore,
  StudioProjectStore,
} from "./stores";

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
  deleted_at_ms: number | null;
};

type JobRow = {
  id: string;
  user_id: string;
  project_id: string;
  action: string;
  slot: string | null;
  catalog_model_id: string;
  upstream_model_id: string;
  display_name_snapshot: string;
  status: string;
  error_code: string | null;
  created_at_ms: number;
  finished_at_ms: number | null;
};

type ReserveRow = JobRow & {
  reject_code: string | null;
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

type BlobRow = {
  id: string;
  user_id: string;
  project_id: string;
  job_id: string;
  content_type: string;
  bytes: unknown;
  created_at_ms: number;
};

function parseSlot(raw: string | null): ImageJobSlot | null {
  if (raw && (IMAGE_JOB_SLOTS as readonly string[]).includes(raw)) {
    return raw as ImageJobSlot;
  }
  return null;
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = "code" in err ? err.code : undefined;
  return code === "23505";
}

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
    deletedAt: row.deleted_at_ms === null ? null : Number(row.deleted_at_ms),
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
    slot: parseSlot(row.slot),
    catalogModelId: row.catalog_model_id,
    upstreamModelId: row.upstream_model_id,
    displayNameSnapshot: row.display_name_snapshot,
    status,
    errorCode: row.error_code as ImageJobErrorCode | null,
    createdAt: Number(row.created_at_ms),
    finishedAt: row.finished_at_ms === null ? null : Number(row.finished_at_ms),
  };
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "string") {
    return Uint8Array.from(Buffer.from(value, "base64"));
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "length" in value &&
    typeof (value as { length: unknown }).length === "number"
  ) {
    return Uint8Array.from(value as ArrayLike<number>);
  }
  return new Uint8Array();
}

function toBlob(row: BlobRow): ImageBlobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    jobId: row.job_id,
    contentType: row.content_type,
    bytes: toBytes(row.bytes),
    createdAt: Number(row.created_at_ms),
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
    async setAdminDefault(id) {
      await sql`
        update model_catalog
        set is_admin_default = (id = ${id})
        where kind = 'image'
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
          (extract(epoch from created_at) * 1000) as created_at_ms,
          case when deleted_at is null then null
               else extract(epoch from deleted_at) * 1000 end as deleted_at_ms
      `;
      return rows[0] ? toProject(rows[0]) : record;
    },
    async get(id) {
      const rows = await sql<ProjectRow>`
        select
          id,
          user_id,
          current_image_model_id,
          (extract(epoch from created_at) * 1000) as created_at_ms,
          case when deleted_at is null then null
               else extract(epoch from deleted_at) * 1000 end as deleted_at_ms
        from studio_projects
        where id = ${id}
      `;
      return rows[0] ? toProject(rows[0]) : null;
    },
    async updateCurrentModel(id, modelId) {
      const rows = await sql<ProjectRow>`
        update studio_projects
        set current_image_model_id = ${modelId}
        where id = ${id} and deleted_at is null
        returning
          id,
          user_id,
          current_image_model_id,
          (extract(epoch from created_at) * 1000) as created_at_ms,
          case when deleted_at is null then null
               else extract(epoch from deleted_at) * 1000 end as deleted_at_ms
      `;
      return rows[0] ? toProject(rows[0]) : null;
    },
    async markDeleted(id, deletedAt) {
      const rows = await sql<ProjectRow>`
        update studio_projects
        set deleted_at = coalesce(deleted_at, to_timestamp(${deletedAt / 1000}))
        where id = ${id}
        returning
          id,
          user_id,
          current_image_model_id,
          (extract(epoch from created_at) * 1000) as created_at_ms,
          case when deleted_at is null then null
               else extract(epoch from deleted_at) * 1000 end as deleted_at_ms
      `;
      return rows[0] ? toProject(rows[0]) : null;
    },
  };
}

export function createSqlJobStore(sql: Sql): ImageJobStore {
  return {
    async insertReserved(record) {
      const beijingDay = beijingCalendarDay(record.createdAt);
      try {
        const rows = await sql<ReserveRow>`
          with gate as (
            select
              case
                when exists (
                  select 1 from image_jobs
                  where user_id = ${record.userId}
                    and status = 'running'
                    and project_id <> ${record.projectId}
                ) then 'in_flight'
                when ${record.slot}::text is not null and exists (
                  select 1 from image_jobs
                  where user_id = ${record.userId}
                    and status = 'running'
                    and project_id = ${record.projectId}
                    and slot is not distinct from ${record.slot}
                ) then 'in_flight'
                when ${record.slot}::text is null and (
                  select count(*)::int from image_jobs
                  where user_id = ${record.userId}
                    and status = 'running'
                    and project_id = ${record.projectId}
                    and slot is null
                ) >= ${MAX_PARALLEL_DIRECTION_JOBS} then 'in_flight'
                else null
              end as code
          ),
          cap_row as (
            select coalesce(
              (
                select case
                  when value ~ '^[0-9]+$' then value::int
                  else ${DEFAULT_DAILY_IMAGE_CAP}
                end
                from studio_settings
                where key = 'daily_image_cap'
              ),
              ${DEFAULT_DAILY_IMAGE_CAP}
            ) as n
          ),
          reserved as (
            insert into image_quota_days (user_id, beijing_day, used)
            select ${record.userId}, ${beijingDay}::date, 1
            from cap_row
            where cap_row.n > 0
              and (select code from gate) is null
            on conflict (user_id, beijing_day) do update
              set used = image_quota_days.used + 1
              where image_quota_days.used < (select n from cap_row)
                and (select code from gate) is null
            returning used
          ),
          inserted as (
            insert into image_jobs (
              id, user_id, project_id, action, slot,
              catalog_model_id, upstream_model_id, display_name_snapshot,
              status, error_code, created_at, finished_at
            )
            select
              ${record.id},
              ${record.userId},
              ${record.projectId},
              ${record.action},
              ${record.slot},
              ${record.catalogModelId},
              ${record.upstreamModelId},
              ${record.displayNameSnapshot},
              ${record.status},
              ${record.errorCode},
              to_timestamp(${record.createdAt / 1000}),
              null
            from reserved
            returning
              id, user_id, project_id, action, slot,
              catalog_model_id, upstream_model_id, display_name_snapshot,
              status, error_code,
              (extract(epoch from created_at) * 1000) as created_at_ms,
              case when finished_at is null then null
                   else extract(epoch from finished_at) * 1000 end as finished_at_ms
          )
          select
            gate.code as reject_code,
            inserted.id,
            inserted.user_id,
            inserted.project_id,
            inserted.action,
            inserted.slot,
            inserted.catalog_model_id,
            inserted.upstream_model_id,
            inserted.display_name_snapshot,
            inserted.status,
            inserted.error_code,
            inserted.created_at_ms,
            inserted.finished_at_ms
          from gate
          left join inserted on true
        `;
        const row = rows[0];
        if (!row) return { ok: false, code: "quota_exceeded" };
        if (row.reject_code === "in_flight") return { ok: false, code: "in_flight" };
        if (!row.id) return { ok: false, code: "quota_exceeded" };
        return { ok: true, job: toJob(row) };
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, code: "in_flight" };
        throw err;
      }
    },
    async get(id) {
      const rows = await sql<JobRow>`
        select
          id, user_id, project_id, action, slot,
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
    async listByUser(userId) {
      const rows = await sql<JobRow>`
        select
          id, user_id, project_id, action, slot,
          catalog_model_id, upstream_model_id, display_name_snapshot,
          status, error_code,
          (extract(epoch from created_at) * 1000) as created_at_ms,
          case when finished_at is null then null
               else extract(epoch from finished_at) * 1000 end as finished_at_ms
        from image_jobs
        where user_id = ${userId}
        order by created_at desc, id desc
      `;
      return rows.map(toJob);
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
          id, user_id, project_id, action, slot,
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
    async deleteByProject(projectId) {
      await sql`
        delete from image_revs
        where project_id = ${projectId}
      `;
    },
  };
}

export function createSqlBlobStore(sql: Sql): ImageBlobStore {
  return {
    async put(record) {
      const payload = Buffer.from(record.bytes);
      const rows = await sql<BlobRow>`
        insert into image_blobs (
          id, user_id, project_id, job_id, content_type, bytes, created_at
        )
        values (
          ${record.id},
          ${record.userId},
          ${record.projectId},
          ${record.jobId},
          ${record.contentType},
          ${payload},
          to_timestamp(${record.createdAt / 1000})
        )
        returning
          id, user_id, project_id, job_id, content_type, bytes,
          (extract(epoch from created_at) * 1000) as created_at_ms
      `;
      return rows[0] ? toBlob(rows[0]) : record;
    },
    async get(id) {
      const rows = await sql<BlobRow>`
        select
          id, user_id, project_id, job_id, content_type, bytes,
          (extract(epoch from created_at) * 1000) as created_at_ms
        from image_blobs
        where id = ${id}
      `;
      const row = rows[0];
      if (!row) return null;
      const blob = toBlob(row);
      if (blob.bytes.byteLength === 0) return null;
      return blob;
    },
    async deleteByProject(projectId) {
      await sql`
        delete from image_blobs
        where project_id = ${projectId}
      `;
    },
  };
}
