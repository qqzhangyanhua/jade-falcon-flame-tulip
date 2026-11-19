import type { Sql } from "../db.ts";
import { beijingCalendarDay } from "./beijing-day.ts";
import { effectiveDailyCap } from "./quota.ts";
import type { AdminUserQuota } from "./types.ts";

type UserQuotaRow = {
  id: string;
  name: string;
  email: string;
  used: number | string;
  user_cap: number | string | null;
  boost: number | string | null;
  last_active_ms: number | string | null;
};

function finiteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function likeContains(raw: string): string | null {
  const trimmed = raw.trim().slice(0, 80);
  if (!trimmed) return null;
  return `%${trimmed.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function toAdminUser(row: UserQuotaRow, globalCap: number): AdminUserQuota {
  const userCap = finiteNumber(row.user_cap);
  const lastActiveAt = finiteNumber(row.last_active_ms);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    used: finiteNumber(row.used) ?? 0,
    cap: effectiveDailyCap(globalCap, userCap),
    userCap,
    boost: finiteNumber(row.boost) ?? 0,
    lastActiveAt: lastActiveAt === null ? null : Math.round(lastActiveAt),
  };
}

export async function listAdminUserQuotas(
  sql: Sql,
  input: { query: string; now: number; globalCap: number; userId?: string | null },
): Promise<AdminUserQuota[]> {
  const day = beijingCalendarDay(input.now);
  const pattern = likeContains(input.query);
  const userId = input.userId ?? null;
  const rows = await sql<UserQuotaRow>`
    select
      u."id" as id,
      u."name" as name,
      u."email" as email,
      (coalesce(q.used, 0) + coalesce(boost_today.spent, 0))::int as used,
      c.cap as user_cap,
      coalesce(b.balance, 0)::int as boost,
      case
        when j.last_ms is null and s.last_ms is null then null
        else greatest(coalesce(j.last_ms, 0), coalesce(s.last_ms, 0))
      end as last_active_ms
    from "user" u
    left join user_daily_caps c on c.user_id = u."id"
    left join user_boost_balances b on b.user_id = u."id"
    left join image_quota_days q
      on q.user_id = u."id" and q.beijing_day = ${day}::date
    left join lateral (
      select coalesce(sum(amount), 0) as spent
      from user_boost_ledger
      where user_id = u."id"
        and kind = 'debit'
        and (created_at at time zone 'Asia/Shanghai')::date = ${day}::date
    ) boost_today on true
    left join lateral (
      select (extract(epoch from max(created_at)) * 1000) as last_ms
      from image_jobs
      where user_id = u."id"
    ) j on true
    left join lateral (
      select (extract(epoch from max("updatedAt")) * 1000) as last_ms
      from "session"
      where "userId" = u."id"
    ) s on true
    where (${userId}::text is null or u."id" = ${userId})
      and (
        ${pattern}::text is null
        or u."name" ilike ${pattern} escape '\\'
        or u."email" ilike ${pattern} escape '\\'
      )
    order by u."name" asc, u."email" asc
  `;
  return rows.map((row) => toAdminUser(row, input.globalCap));
}
