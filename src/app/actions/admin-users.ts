"use server";

import { requireActionUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { beijingCalendarDay } from "@/lib/image-jobs/beijing-day";
import { requireCatalogAdmin } from "@/lib/image-jobs/catalog-admin";
import { ImageJobError } from "@/lib/image-jobs/errors";
import { createSqlQuotaStore, createSqlRoleStore } from "@/lib/image-jobs/quota-sql";
import {
  clearUserDailyCap,
  grantUserBoost,
  listUserBoostLedger,
  normalizeBoostGrant,
  normalizeBoostNote,
  normalizeDailyCap,
  resolveStudioRole,
  setUserDailyCap,
} from "@/lib/image-jobs/quota";
import { listAdminUserQuotas } from "@/lib/image-jobs/user-admin";
import type { AdminUserQuota, BoostLedgerEntry, StudioRole } from "@/lib/image-jobs/types";

export type AdminUserList = {
  role: StudioRole;
  globalCap: number;
  beijingDay: string;
  users: AdminUserQuota[];
};

async function adminQuotaDeps() {
  const sql = await getSql();
  return {
    sql,
    quota: createSqlQuotaStore(sql),
    roles: createSqlRoleStore(sql),
  };
}

export async function listAdminUsersFn(input: { data: { query?: string } }): Promise<AdminUserList> {
  const { userId } = await requireActionUser();
  const deps = await adminQuotaDeps();
  const now = Date.now();
  const role = await resolveStudioRole(deps.roles, userId);
  const globalCap = await deps.quota.getCap();
  if (role !== "admin") {
    return { role, globalCap, beijingDay: beijingCalendarDay(now), users: [] };
  }
  const users = await listAdminUserQuotas(deps.sql, {
    query: input.data.query ?? "",
    now,
    globalCap,
  });
  return { role, globalCap, beijingDay: beijingCalendarDay(now), users };
}

async function writeUserCap(
  actorId: string,
  targetId: string,
  write: (deps: Awaited<ReturnType<typeof adminQuotaDeps>>) => Promise<void>,
): Promise<AdminUserQuota> {
  const userId = targetId.trim();
  if (!userId) throw new ImageJobError("not_found");
  const deps = await adminQuotaDeps();
  await requireCatalogAdmin(deps.roles, actorId);
  const now = Date.now();
  const globalCap = await deps.quota.getCap();
  const existing = await listAdminUserQuotas(deps.sql, {
    query: "",
    now,
    globalCap,
    userId,
  });
  if (!existing[0]) throw new ImageJobError("not_found");
  await write(deps);
  const next = await listAdminUserQuotas(deps.sql, {
    query: "",
    now,
    globalCap,
    userId,
  });
  const row = next[0];
  if (!row) throw new ImageJobError("not_found");
  return row;
}

export async function setUserDailyCapFn(input: {
  data: { userId: string; cap: number };
}): Promise<AdminUserQuota> {
  const { userId: actorId } = await requireActionUser();
  const cap = normalizeDailyCap(input.data.cap);
  if (cap === null) throw new Error("额度须为 0–9999 的整数");
  return writeUserCap(actorId, input.data.userId, async (deps) => {
    const result = await setUserDailyCap(deps.roles, deps.quota, {
      actorId,
      userId: input.data.userId,
      cap,
    });
    if (!result.ok) throw new ImageJobError(result.code);
  });
}

export async function clearUserDailyCapFn(input: {
  data: { userId: string };
}): Promise<AdminUserQuota> {
  const { userId: actorId } = await requireActionUser();
  return writeUserCap(actorId, input.data.userId, async (deps) => {
    const result = await clearUserDailyCap(deps.roles, deps.quota, {
      actorId,
      userId: input.data.userId,
    });
    if (!result.ok) throw new ImageJobError(result.code);
  });
}

export async function listUserBoostLedgerFn(input: {
  data: { userId: string };
}): Promise<BoostLedgerEntry[]> {
  const { userId: actorId } = await requireActionUser();
  const userId = input.data.userId.trim();
  if (!userId) throw new ImageJobError("not_found");
  const deps = await adminQuotaDeps();
  const result = await listUserBoostLedger(deps.roles, deps.quota, { actorId, userId });
  if (!result.ok) throw new ImageJobError(result.code);
  return result.entries;
}

export async function grantUserBoostFn(input: {
  data: { userId: string; amount: number; note: string };
}): Promise<AdminUserQuota> {
  const { userId: actorId } = await requireActionUser();
  const amount = normalizeBoostGrant(input.data.amount);
  if (amount === null) throw new Error("加量包数量须为 1–9999 的整数");
  const note = normalizeBoostNote(input.data.note ?? "");
  if (note === null) throw new Error("请填写备注，最多 200 字");
  return writeUserCap(actorId, input.data.userId, async (deps) => {
    const result = await grantUserBoost(deps.roles, deps.quota, {
      actorId,
      userId: input.data.userId,
      amount,
      note,
    });
    if (!result.ok) throw new ImageJobError(result.code);
  });
}
