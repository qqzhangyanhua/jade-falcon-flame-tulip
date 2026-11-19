import { IMAGE_JOB_USER_MESSAGES } from "./errors.ts";
import type {
  ActionAvailability,
  ImageJobAction,
  ImageJobErrorCode,
  StudioImageState,
  StudioQuota,
  StudioRole,
} from "./types.ts";
import { IMAGE_JOB_ACTIONS } from "./types.ts";
import type { QuotaStore, RoleStore } from "./stores.ts";

export const DEFAULT_DAILY_IMAGE_CAP = 30;
export const DAILY_IMAGE_CAP_SETTING_KEY = "daily_image_cap";
export const DAILY_IMAGE_CAP_MAX = 9999;

export function emptyQuota(cap: number, beijingDay: string, boost = 0): StudioQuota {
  const safeCap = Math.max(0, cap);
  return {
    cap: safeCap,
    used: 0,
    remaining: safeCap,
    boost: Math.max(0, boost),
    beijingDay,
  };
}

export function quotaFromParts(
  cap: number,
  used: number,
  beijingDay: string,
  boost = 0,
): StudioQuota {
  const safeCap = Math.max(0, cap);
  const safeUsed = Math.max(0, used);
  return {
    cap: safeCap,
    used: safeUsed,
    remaining: Math.max(0, safeCap - safeUsed),
    boost: Math.max(0, boost),
    beijingDay,
  };
}

/** Today's remaining plus the non-expiring 加量包. */
export function quotaSpendable(quota: Pick<StudioQuota, "remaining" | "boost">): number {
  return Math.max(0, quota.remaining) + Math.max(0, quota.boost);
}

export function quotaExhausted(quota: Pick<StudioQuota, "remaining" | "boost">): boolean {
  return quotaSpendable(quota) <= 0;
}

function overlayQuota(
  current: ActionAvailability,
  blocked: ActionAvailability,
): ActionAvailability {
  if (!current.enabled) return current;
  return blocked;
}

export function applyQuotaToStudioState(
  state: StudioImageState,
  quota: StudioQuota,
): StudioImageState {
  if (!quotaExhausted(quota)) return { ...state, quota };
  const blocked: ActionAvailability = {
    enabled: false,
    code: "quota_exceeded",
    reason: IMAGE_JOB_USER_MESSAGES.quota_exceeded,
  };
  const actions = Object.fromEntries(
    IMAGE_JOB_ACTIONS.map((action: ImageJobAction) => [
      action,
      overlayQuota(state.actions[action], blocked),
    ]),
  ) as Record<ImageJobAction, ActionAvailability>;
  return { ...state, quota, actions };
}

/** A set user cap wins, including 0. Null means there is no override. */
export function effectiveDailyCap(globalCap: number, userCap: number | null): number {
  if (userCap === null) return Math.max(0, globalCap);
  return Math.max(0, userCap);
}

export function parseDailyCap(raw: string | null | undefined): number {
  if (raw === undefined || raw === null) return DEFAULT_DAILY_IMAGE_CAP;
  const trimmed = raw.trim();
  if (!/^[0-9]+$/.test(trimmed)) return DEFAULT_DAILY_IMAGE_CAP;
  return Number(trimmed);
}

export function normalizeDailyCap(value: number): number | null {
  if (!Number.isInteger(value) || value < 0 || value > DAILY_IMAGE_CAP_MAX) return null;
  return value;
}

export async function resolveStudioRole(
  roles: RoleStore,
  userId: string,
): Promise<StudioRole> {
  if (!userId) return "user";
  const existing = await roles.getRole(userId);
  if (existing === "admin") return existing;
  if (await roles.hasAdmin()) return existing;
  await roles.setRole(userId, "admin");
  return "admin";
}

export async function setGlobalDailyCap(
  roles: RoleStore,
  quota: QuotaStore,
  input: { userId: string; cap: number },
): Promise<{ ok: true; cap: number } | { ok: false; code: ImageJobErrorCode }> {
  if (!input.userId) return { ok: false, code: "unauthorized" };
  if ((await roles.getRole(input.userId)) !== "admin") {
    return { ok: false, code: "forbidden" };
  }
  const cap = normalizeDailyCap(input.cap);
  if (cap === null) return { ok: false, code: "forbidden" };
  return { ok: true, cap: await quota.setCap(cap) };
}

async function requireCapAdmin(
  roles: RoleStore,
  actorId: string,
): Promise<{ ok: true } | { ok: false; code: ImageJobErrorCode }> {
  if (!actorId) return { ok: false, code: "unauthorized" };
  const role = await resolveStudioRole(roles, actorId);
  if (role !== "admin") return { ok: false, code: "forbidden" };
  return { ok: true };
}

export async function setUserDailyCap(
  roles: RoleStore,
  quota: QuotaStore,
  input: { actorId: string; userId: string; cap: number },
): Promise<{ ok: true; cap: number } | { ok: false; code: ImageJobErrorCode }> {
  const admin = await requireCapAdmin(roles, input.actorId);
  if (!admin.ok) return admin;
  const userId = input.userId.trim();
  if (!userId) return { ok: false, code: "not_found" };
  const cap = normalizeDailyCap(input.cap);
  if (cap === null) return { ok: false, code: "forbidden" };
  await quota.setUserCap(userId, cap);
  return { ok: true, cap };
}

export async function clearUserDailyCap(
  roles: RoleStore,
  quota: QuotaStore,
  input: { actorId: string; userId: string },
): Promise<{ ok: true } | { ok: false; code: ImageJobErrorCode }> {
  const admin = await requireCapAdmin(roles, input.actorId);
  if (!admin.ok) return admin;
  const userId = input.userId.trim();
  if (!userId) return { ok: false, code: "not_found" };
  await quota.clearUserCap(userId);
  return { ok: true };
}

export const BOOST_GRANT_MAX = DAILY_IMAGE_CAP_MAX;
export const BOOST_NOTE_MAX = 200;

export function normalizeBoostGrant(value: number): number | null {
  if (!Number.isInteger(value) || value < 1 || value > BOOST_GRANT_MAX) return null;
  return value;
}

export function normalizeBoostNote(note: string): string | null {
  const trimmed = note.trim();
  if (!trimmed || trimmed.length > BOOST_NOTE_MAX) return null;
  return trimmed;
}

export async function grantUserBoost(
  roles: RoleStore,
  quota: QuotaStore,
  input: { actorId: string; userId: string; amount: number; note: string; at?: number },
): Promise<{ ok: true; balance: number } | { ok: false; code: ImageJobErrorCode }> {
  const admin = await requireCapAdmin(roles, input.actorId);
  if (!admin.ok) return admin;
  const userId = input.userId.trim();
  if (!userId) return { ok: false, code: "not_found" };
  const amount = normalizeBoostGrant(input.amount);
  if (amount === null) return { ok: false, code: "forbidden" };
  const note = normalizeBoostNote(input.note);
  if (note === null) return { ok: false, code: "forbidden" };
  const balance = await quota.addBoost({
    userId,
    amount,
    adminId: input.actorId,
    note,
    at: input.at ?? Date.now(),
  });
  return { ok: true, balance };
}
