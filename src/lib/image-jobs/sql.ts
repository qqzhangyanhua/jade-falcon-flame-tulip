import type { Sql } from "../db";
import { beijingCalendarDay } from "./beijing-day.ts";
import { MAX_PARALLEL_DIRECTION_JOBS } from "./concurrency.ts";
import { readProjectTags } from "../project/schema.ts";
import { COVER_SLOT } from "../project/summary.ts";
import { DEFAULT_DAILY_IMAGE_CAP } from "./quota.ts";
import { IMAGE_JOB_ACTIONS, type ImageJobAction, type ImageJobSlot } from "./types.ts";
import type {
  CatalogModel,
  ImageBlobRecord,
  ImageJobErrorCode,
  ImageJobRecord,
  ImageJobStatus,
  ImageRevRecord,
  ProjectDocumentSnapshot,
  ProjectSummary,
  StudioProjectRecord,
} from "./types.ts";
import type {
  GeneratedImageRow,
  ImageBlobStore,
  ImageHideAction,
  ImageHideAuditRecord,
  ImageHideAuditStore,
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
  /** Text, never a JS number — int8 past 2^53 would round. */
  cost_in_usd_ticks: string | null;
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
  job_id: string | null;
  kind: string;
  content_type: string;
  bytes: unknown;
  created_at_ms: number;
  hidden: boolean | string | number | null;
};

/** A stored slot is the text that was written. Only null and "" are empty. */
export function parseSlot(raw: string | null): ImageJobSlot | null {
  if (!raw) return null;
  return raw;
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

type DocumentRow = {
  document: unknown;
  version: number | string;
  updated_at_ms: number | string | null;
};

function toSnapshot(row: DocumentRow): ProjectDocumentSnapshot {
  const document = typeof row.document === "string" ? JSON.parse(row.document) : row.document;
  return {
    document: (document ?? null) as ProjectDocumentSnapshot["document"],
    version: Number(row.version),
    updatedAt: row.updated_at_ms === null ? null : Number(row.updated_at_ms),
  };
}

function tagsColumn(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
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

function toCostTicks(value: string | null | undefined): bigint | null {
  if (value == null || value === "") return null;
  if (!/^-?\d+$/.test(value)) return null;
  return BigInt(value);
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
    costInUsdTicks: toCostTicks(row.cost_in_usd_ticks),
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

function asHidden(value: BlobRow["hidden"]): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

type ReviewBlobRow = {
  id: string;
  user_id: string;
  project_id: string;
  content_type: string;
  hidden: BlobRow["hidden"];
  created_at_ms: number;
  user_name: string | null;
  user_email: string | null;
};

function toReviewImage(row: ReviewBlobRow): GeneratedImageRow {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    projectId: row.project_id,
    createdAt: Number(row.created_at_ms),
    hidden: asHidden(row.hidden),
    contentType: row.content_type,
  };
}

function toBlob(row: BlobRow): ImageBlobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    jobId: row.job_id,
    kind: row.kind === "upload" ? "upload" : "job",
    contentType: row.content_type,
    bytes: toBytes(row.bytes),
    createdAt: Number(row.created_at_ms),
    hidden: asHidden(row.hidden),
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
    async getDocument(id) {
      const rows = await sql<DocumentRow>`
        select document, version, case when updated_at is null then null
               else extract(epoch from updated_at) * 1000 end as updated_at_ms
        from studio_projects
        where id = ${id}
      `;
      return rows[0] ? toSnapshot(rows[0]) : null;
    },
    async listSummaries(userId) {
      // Only the few fields the list needs are pulled out of the jsonb; the document is never loaded whole.
      // Paging happens in listProjectSummaries, so this returns every live project of the user.
      const rows = await sql<{
        id: string;
        name: string | null;
        stage: string | null;
        cover_url: string | null;
        updated_at_ms: number | string;
        created_at_ms: number | string | null;
        tags: unknown;
      }>`
        select p.id,
               p.document->>'name' as name,
               p.document->>'phase' as stage,
               coalesce(
                 (select r->>'url'
                    from jsonb_array_elements(cur.style->'assets'->${COVER_SLOT}::text->'revs') r
                   where r->>'id' = cur.style->'assets'->${COVER_SLOT}::text->>'adoptedId'
                   limit 1),
                 cur.style->'assets'->${COVER_SLOT}::text->'revs'->-1->>'url',
                 cur.style->>'candidateUrl'
               ) as cover_url,
               extract(epoch from p.updated_at) * 1000 as updated_at_ms,
               coalesce(
                 case when jsonb_typeof(p.document->'createdAt') = 'number'
                      then (p.document->>'createdAt')::double precision
                      else null end,
                 extract(epoch from p.created_at) * 1000
               ) as created_at_ms,
               case
                 when jsonb_typeof(p.document->'tags') = 'array' then (
                   select coalesce(jsonb_agg(to_jsonb(t.elem) order by t.ord), '[]'::jsonb)
                     from jsonb_array_elements_text(p.document->'tags') with ordinality as t(elem, ord)
                 )
                 else '[]'::jsonb
               end as tags
        from studio_projects p
        left join lateral (
          select s as style
            from jsonb_array_elements(p.document->'styles') s
           where s->>'id' = p.document->>'currentStyleId'
           limit 1
        ) cur on true
        where p.user_id = ${userId}
          and p.deleted_at is null
          and p.document is not null
          and p.updated_at is not null
      `;
      return rows.map((row): ProjectSummary => ({
        id: row.id,
        name: row.name ?? "",
        stage: row.stage === "studio" || row.stage === "direction" ? row.stage : "brief",
        coverUrl: row.cover_url,
        updatedAt: Number(row.updated_at_ms),
        createdAt: Number(row.created_at_ms),
        tags: readProjectTags(tagsColumn(row.tags)),
      }));
    },
    async saveDocument(id, document, expectedVersion, now) {
      // Version and deleted checks live in the WHERE so a concurrent save or delete cannot slip between them.
      const saved = await sql<DocumentRow>`
        update studio_projects
        set document = ${JSON.stringify(document)}::jsonb,
            version = version + 1,
            updated_at = to_timestamp(${now / 1000})
        where id = ${id} and deleted_at is null and version = ${expectedVersion}
        returning document, version, case when updated_at is null then null
               else extract(epoch from updated_at) * 1000 end as updated_at_ms
      `;
      if (saved[0]) return { status: "saved", snapshot: toSnapshot(saved[0]) };

      const rows = await sql<DocumentRow & { deleted: boolean }>`
        select document, version, case when updated_at is null then null
               else extract(epoch from updated_at) * 1000 end as updated_at_ms,
               (deleted_at is not null) as deleted
        from studio_projects
        where id = ${id}
      `;
      const row = rows[0];
      if (!row) return { status: "not_found" };
      if (row.deleted) return { status: "deleted" };
      return { status: "conflict", current: toSnapshot(row) };
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
            -- user_daily_caps overrides the global cap. A stored 0 still overrides.
            select coalesce(
              (
                select cap
                from user_daily_caps
                where user_id = ${record.userId}
              ),
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
          daily as (
            insert into image_quota_days (user_id, beijing_day, used)
            select ${record.userId}, ${beijingDay}::date, 1
            from cap_row
            where cap_row.n > 0
              and (select code from gate) is null
            on conflict (user_id, beijing_day) do update
              set used = image_quota_days.used + 1
              where image_quota_days.used < (select n from cap_row)
                and (select code from gate) is null
            returning user_id
          ),
          -- Daily cap first. The boost update sees daily's RETURNING, so a
          -- full cap falls through in the same statement as the job insert.
          boosted as (
            update user_boost_balances
            set balance = balance - 1
            where user_id = ${record.userId}
              and balance >= 1
              and (select code from gate) is null
              and not exists (select 1 from daily)
            returning user_id
          ),
          debited as (
            insert into user_boost_ledger (
              user_id, kind, amount, created_at, admin_id, note
            )
            select
              ${record.userId},
              'debit',
              1,
              to_timestamp(${record.createdAt / 1000}),
              null,
              ${record.id}
            from boosted
            returning user_id
          ),
          funded as (
            select user_id from daily
            union all
            select user_id from debited
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
            from funded
            returning
              id, user_id, project_id, action, slot,
              catalog_model_id, upstream_model_id, display_name_snapshot,
              status, error_code,
              (extract(epoch from created_at) * 1000) as created_at_ms,
              case when finished_at is null then null
                   else extract(epoch from finished_at) * 1000 end as finished_at_ms,
              cost_in_usd_ticks::text as cost_in_usd_ticks
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
            inserted.finished_at_ms,
            inserted.cost_in_usd_ticks
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
               else extract(epoch from finished_at) * 1000 end as finished_at_ms,
          cost_in_usd_ticks::text as cost_in_usd_ticks
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
               else extract(epoch from finished_at) * 1000 end as finished_at_ms,
          cost_in_usd_ticks::text as cost_in_usd_ticks
        from image_jobs
        where user_id = ${userId}
        order by created_at desc, id desc
      `;
      return rows.map(toJob);
    },
    async finish(id, status, errorCode, finishedAt, costInUsdTicks) {
      const costText = costInUsdTicks === null ? null : costInUsdTicks.toString();
      const rows = await sql<JobRow>`
        update image_jobs
        set
          status = ${status},
          error_code = ${errorCode},
          finished_at = to_timestamp(${finishedAt / 1000}),
          cost_in_usd_ticks = ${costText}::bigint
        where id = ${id}
        returning
          id, user_id, project_id, action, slot,
          catalog_model_id, upstream_model_id, display_name_snapshot,
          status, error_code,
          (extract(epoch from created_at) * 1000) as created_at_ms,
          case when finished_at is null then null
               else extract(epoch from finished_at) * 1000 end as finished_at_ms,
          cost_in_usd_ticks::text as cost_in_usd_ticks
      `;
      return rows[0] ? toJob(rows[0]) : null;
    },
    async listInRange(fromMs, toMs) {
      const rows = await sql<JobRow>`
        select
          id, user_id, project_id, action, slot,
          catalog_model_id, upstream_model_id, display_name_snapshot,
          status, error_code,
          (extract(epoch from created_at) * 1000) as created_at_ms,
          case when finished_at is null then null
               else extract(epoch from finished_at) * 1000 end as finished_at_ms,
          cost_in_usd_ticks::text as cost_in_usd_ticks
        from image_jobs
        where created_at >= to_timestamp(${fromMs / 1000})
          and created_at < to_timestamp(${toMs / 1000})
        order by created_at asc, id asc
      `;
      return rows.map(toJob);
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

type AuditRow = {
  id: string;
  image_id: string;
  action: string;
  admin_id: string;
  reason: string | null;
  created_at_ms: number;
};

function toAudit(row: AuditRow): ImageHideAuditRecord {
  const action: ImageHideAction = row.action === "unhide" ? "unhide" : "hide";
  return {
    id: row.id,
    imageId: row.image_id,
    action,
    adminId: row.admin_id,
    at: Number(row.created_at_ms),
    reason: row.reason,
  };
}

export function createSqlHideAudit(sql: Sql): ImageHideAuditStore {
  return {
    async append(record) {
      await sql`
        insert into image_hide_audit (id, image_id, action, admin_id, reason, created_at)
        values (
          ${record.id},
          ${record.imageId},
          ${record.action},
          ${record.adminId},
          ${record.reason},
          to_timestamp(${record.at / 1000})
        )
      `;
      return record;
    },
    async listByImage(imageId) {
      const rows = await sql<AuditRow>`
        select
          id, image_id, action, admin_id, reason,
          (extract(epoch from created_at) * 1000) as created_at_ms
        from image_hide_audit
        where image_id = ${imageId}
        order by created_at, id
      `;
      return rows.map(toAudit);
    },
  };
}

export function createSqlBlobStore(sql: Sql): ImageBlobStore {
  return {
    async put(record) {
      const payload = Buffer.from(record.bytes);
      const rows = await sql<BlobRow>`
        insert into image_blobs (
          id, user_id, project_id, job_id, kind, content_type, bytes, created_at, hidden
        )
        values (
          ${record.id},
          ${record.userId},
          ${record.projectId},
          ${record.jobId},
          ${record.kind},
          ${record.contentType},
          ${payload},
          to_timestamp(${record.createdAt / 1000}),
          ${record.hidden === true}
        )
        returning
          id, user_id, project_id, job_id, kind, content_type, bytes, hidden,
          (extract(epoch from created_at) * 1000) as created_at_ms
      `;
      return rows[0] ? toBlob(rows[0]) : record;
    },
    async get(id) {
      const rows = await sql<BlobRow>`
        select
          id, user_id, project_id, job_id, kind, content_type, bytes, hidden,
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
    async setHidden(id, hidden) {
      const rows = await sql<{ id: string }>`
        update image_blobs
        set hidden = ${hidden}
        where id = ${id}
        returning id
      `;
      return Boolean(rows[0]);
    },
    async listGenerated({ query, limit }) {
      const trimmed = query.trim();
      const pattern = `%${trimmed.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      const rows = await sql<ReviewBlobRow>`
        select
          b.id,
          b.user_id,
          b.project_id,
          b.content_type,
          b.hidden,
          (extract(epoch from b.created_at) * 1000) as created_at_ms,
          u.name as user_name,
          u.email as user_email
        from image_blobs b
        left join "user" u on u.id = b.user_id
        where b.kind = 'job'
          and (
            ${trimmed} = ''
            or b.user_id ilike ${pattern} escape '\\\\'
            or coalesce(u.name, '') ilike ${pattern} escape '\\\\'
            or coalesce(u.email, '') ilike ${pattern} escape '\\\\'
          )
        order by b.created_at desc, b.id desc
        limit ${limit}
      `;
      return rows.map(toReviewImage);
    },
    async listHiddenIds(userId) {
      const rows = await sql<{ id: string }>`
        select id
        from image_blobs
        where user_id = ${userId} and hidden = true
      `;
      return rows.map((row) => row.id);
    },
  };
}
