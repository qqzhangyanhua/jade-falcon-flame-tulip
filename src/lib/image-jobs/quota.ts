import { IMAGE_JOB_USER_MESSAGES } from "./errors";
import type {
  ActionAvailability,
  ImageJobAction,
  ImageJobErrorCode,
  StudioImageState,
  StudioQuota,
  StudioRole,
} from "./types";
import { IMAGE_JOB_ACTIONS } from "./types";
import type { QuotaStore, RoleStore } from "./stores";

export const DEFAULT_DAILY_IMAGE_CAP = 30;
export const DAILY_IMAGE_CAP_SETTING_KEY = "daily_image_cap";
export const DAILY_IMAGE_CAP_MAX = 9999;

export function emptyQuota(cap: number, beijingDay: string): StudioQuota {
  const safeCap = Math.max(0, cap);
  return {
    cap: safeCap,
    used: 0,
    remaining: safeCap,
    beijingDay,
  };
}

export function quotaFromParts(cap: number, used: number, beijingDay: string): StudioQuota {
  const safeCap = Math.max(0, cap);
  const safeUsed = Math.max(0, used);
  return {
    cap: safeCap,
    used: safeUsed,
    remaining: Math.max(0, safeCap - safeUsed),
    beijingDay,
  };
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
  if (quota.remaining > 0) return { ...state, quota };
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
