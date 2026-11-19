import { newEntityId } from "./ids.ts";
import { resolveStudioRole } from "./quota.ts";
import type {
  ImageBlobStore,
  ImageHideAction,
  ImageHideAuditRecord,
  ImageHideAuditStore,
  RoleStore,
} from "./stores.ts";
import type { ImageBlobRecord, ImageJobErrorCode } from "./types.ts";

export const HIDE_REASON_MAX = 200;
export const REVIEW_IMAGE_LIMIT = 48;

export type ReviewImage = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  projectId: string;
  createdAt: number;
  hidden: boolean;
  contentType: string;
  reason: string | null;
};

export type ImageHideDeps = {
  blobs: Pick<ImageBlobStore, "get" | "setHidden">;
  audit: ImageHideAuditStore;
  roles: RoleStore;
  now?: () => number;
  newId?: (prefix: string) => string;
};

export type ImageHideResult =
  | { ok: true }
  | { ok: false; code: Extract<ImageJobErrorCode, "forbidden" | "not_found" | "unauthorized"> };

export async function hideImage(
  deps: ImageHideDeps,
  input: { actorId: string; imageId: string; reason?: string | null },
): Promise<ImageHideResult> {
  return changeImageHidden(deps, input, "hide");
}

export async function unhideImage(
  deps: ImageHideDeps,
  input: { actorId: string; imageId: string; reason?: string | null },
): Promise<ImageHideResult> {
  return changeImageHidden(deps, input, "unhide");
}

export async function listReviewImages(
  deps: ImageHideDeps & { blobs: Pick<ImageBlobStore, "listGenerated"> },
  input: { actorId: string; userQuery?: string | null },
): Promise<
  { ok: true; images: ReviewImage[] } | { ok: false; code: "forbidden" | "unauthorized" }
> {
  if (!input.actorId) return { ok: false, code: "unauthorized" };
  if ((await resolveStudioRole(deps.roles, input.actorId)) !== "admin") {
    return { ok: false, code: "forbidden" };
  }
  const rows = await deps.blobs.listGenerated({
    query: input.userQuery?.trim() ?? "",
    limit: REVIEW_IMAGE_LIMIT,
  });
  const images: ReviewImage[] = [];
  for (const row of rows) {
    images.push({ ...row, reason: row.hidden ? await latestHideReason(deps.audit, row.id) : null });
  }
  return { ok: true, images };
}

async function latestHideReason(
  audit: Pick<ImageHideAuditStore, "listByImage">,
  imageId: string,
): Promise<string | null> {
  const rows = await audit.listByImage(imageId);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.action === "hide") return row.reason;
  }
  return null;
}

/** Admin review may see another user's bytes, but a hidden image still returns nothing. */
export async function readReviewImage(
  deps: { blobs: Pick<ImageBlobStore, "get">; roles: RoleStore },
  input: { actorId: string; imageId: string },
): Promise<ImageBlobRecord | null> {
  if (!input.actorId) return null;
  if ((await resolveStudioRole(deps.roles, input.actorId)) !== "admin") return null;
  const imageId = input.imageId.trim();
  if (!imageId) return null;
  const blob = await deps.blobs.get(imageId);
  if (!blob || blob.hidden) return null;
  return blob;
}

export async function listHiddenImageIds(
  blobs: Pick<ImageBlobStore, "listHiddenIds">,
  userId: string,
): Promise<string[]> {
  if (!userId) return [];
  return blobs.listHiddenIds(userId);
}

export async function listImageHideAudit(
  deps: { audit: Pick<ImageHideAuditStore, "listByImage"> },
  imageId: string,
): Promise<ImageHideAuditRecord[]> {
  return deps.audit.listByImage(imageId);
}

export function normalizeHideReason(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const reason = raw.trim();
  if (!reason) return null;
  if (reason.length > HIDE_REASON_MAX) throw new Error(`原因最多 ${HIDE_REASON_MAX} 字`);
  return reason;
}

async function changeImageHidden(
  deps: ImageHideDeps,
  input: { actorId: string; imageId: string; reason?: string | null },
  action: ImageHideAction,
): Promise<ImageHideResult> {
  if (!input.actorId) return { ok: false, code: "unauthorized" };
  if ((await resolveStudioRole(deps.roles, input.actorId)) !== "admin") {
    return { ok: false, code: "forbidden" };
  }
  const imageId = input.imageId.trim();
  if (!imageId) return { ok: false, code: "not_found" };
  const reason = normalizeHideReason(input.reason);
  const existing = await deps.blobs.get(imageId);
  if (!existing) return { ok: false, code: "not_found" };
  const updated = await deps.blobs.setHidden(imageId, action === "hide");
  if (!updated) return { ok: false, code: "not_found" };
  const now = deps.now?.() ?? Date.now();
  await deps.audit.append({
    id: (deps.newId ?? newEntityId)("hia"),
    imageId,
    action,
    adminId: input.actorId,
    at: now,
    reason,
  });
  return { ok: true };
}
