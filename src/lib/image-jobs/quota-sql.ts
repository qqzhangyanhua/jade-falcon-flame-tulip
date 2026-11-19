import type { Sql } from "../db";
import { beijingCalendarDay } from "./beijing-day";
import {
  DAILY_IMAGE_CAP_SETTING_KEY,
  effectiveDailyCap,
  parseDailyCap,
  quotaFromParts,
} from "./quota";
import type { QuotaStore, RoleStore } from "./stores";
import type { StudioRole } from "./types";

type SettingRow = { value: string };
type UsedRow = { used: number };
type RoleRow = { role: string };

function asRole(value: string | undefined): StudioRole {
  return value === "admin" ? "admin" : "user";
}

export function createSqlQuotaStore(sql: Sql): QuotaStore {
  return {
    async getCap() {
      const rows = await sql<SettingRow>`
        select value from studio_settings where key = ${DAILY_IMAGE_CAP_SETTING_KEY}
      `;
      return parseDailyCap(rows[0]?.value);
    },
    async setCap(cap) {
      const value = String(cap);
      await sql`
        insert into studio_settings (key, value)
        values (${DAILY_IMAGE_CAP_SETTING_KEY}, ${value})
        on conflict (key) do update set value = excluded.value
      `;
      return cap;
    },
    async setUserCap(userId, cap) {
      await sql`
        insert into user_daily_caps (user_id, cap)
        values (${userId}, ${cap})
        on conflict (user_id) do update set cap = excluded.cap
      `;
    },
    async clearUserCap(userId) {
      await sql`delete from user_daily_caps where user_id = ${userId}`;
    },
    async snapshot(userId, atMs) {
      const day = beijingCalendarDay(atMs);
      const capRows = await sql<SettingRow>`
        select value from studio_settings where key = ${DAILY_IMAGE_CAP_SETTING_KEY}
      `;
      const userCapRows = await sql<{ cap: number }>`
        select cap from user_daily_caps where user_id = ${userId}
      `;
      const usedRows = await sql<UsedRow>`
        select used from image_quota_days
        where user_id = ${userId} and beijing_day = ${day}::date
      `;
      const userCap = userCapRows[0] ? Number(userCapRows[0].cap) : null;
      return quotaFromParts(
        effectiveDailyCap(parseDailyCap(capRows[0]?.value), userCap),
        Number(usedRows[0]?.used ?? 0),
        day,
      );
    },
  };
}

export function createSqlRoleStore(sql: Sql): RoleStore {
  return {
    async getRole(userId) {
      const rows = await sql<RoleRow>`
        select role from studio_roles where user_id = ${userId}
      `;
      return asRole(rows[0]?.role);
    },
    async setRole(userId, role) {
      await sql`
        insert into studio_roles (user_id, role)
        values (${userId}, ${role})
        on conflict (user_id) do update set role = excluded.role
      `;
    },
    async hasAdmin() {
      const rows = await sql<{ ok: boolean }>`
        select exists(select 1 from studio_roles where role = 'admin') as ok
      `;
      return Boolean(rows[0]?.ok);
    },
  };
}
