import type { Sql } from "../db";
import { beijingCalendarDay } from "./beijing-day";
import {
  DAILY_IMAGE_CAP_SETTING_KEY,
  effectiveDailyCap,
  parseDailyCap,
  quotaFromParts,
} from "./quota";
import type { QuotaStore, RoleStore } from "./stores";
import type { BoostLedgerEntry, BoostLedgerKind, StudioRole } from "./types";

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
    async addBoost(input) {
      const rows = await sql<{ balance: number }>`
        with added as (
          insert into user_boost_balances (user_id, balance)
          values (${input.userId}, ${input.amount})
          on conflict (user_id) do update
            set balance = user_boost_balances.balance + excluded.balance
          returning balance
        ),
        noted as (
          -- Column note holds the grant remark. A debit row stores the job id there instead.
          insert into user_boost_ledger (user_id, kind, amount, created_at, admin_id, note)
          select ${input.userId}, 'grant', ${input.amount}, to_timestamp(${input.at / 1000}), ${input.adminId}, ${input.note}
          returning id
        )
        select added.balance
        from added
        cross join (select count(*)::int as n from noted) ledger_rows
      `;
      return Number(rows[0]?.balance ?? 0);
    },
    async listDailyUsed(userId, fromDay, toDay) {
      const rows = await sql<{ day: string; used: number }>`
        select to_char(beijing_day, 'YYYY-MM-DD') as day, used
        from image_quota_days
        where user_id = ${userId}
          and beijing_day >= ${fromDay}::date
          and beijing_day <= ${toDay}::date
      `;
      return rows.map((row) => ({ day: row.day, used: Number(row.used) }));
    },
    async listBoostLedger(userId) {
      const rows = await sql<{
        kind: string;
        amount: number;
        created_at_ms: number;
        admin_id: string | null;
        note: string;
      }>`
        select
          kind,
          amount,
          (extract(epoch from created_at) * 1000) as created_at_ms,
          admin_id,
          note
        from user_boost_ledger
        where user_id = ${userId}
        order by created_at asc, id asc
      `;
      return rows.map((row): BoostLedgerEntry => {
        const kind = asBoostKind(row.kind);
        return {
          userId,
          kind,
          amount: Number(row.amount),
          at: Math.round(Number(row.created_at_ms)),
          adminId: row.admin_id,
          remark: kind === "grant" ? row.note : null,
          jobId: kind === "debit" ? row.note : null,
        };
      });
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
      const boostRows = await sql<{ balance: number }>`
        select balance from user_boost_balances where user_id = ${userId}
      `;
      const userCap = userCapRows[0] ? Number(userCapRows[0].cap) : null;
      return quotaFromParts(
        effectiveDailyCap(parseDailyCap(capRows[0]?.value), userCap),
        Number(usedRows[0]?.used ?? 0),
        day,
        Number(boostRows[0]?.balance ?? 0),
      );
    },
  };
}

function asBoostKind(value: string): BoostLedgerKind {
  return value === "debit" ? "debit" : "grant";
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
