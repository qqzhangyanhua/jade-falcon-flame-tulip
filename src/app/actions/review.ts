"use server";

import { requireActionUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { ImageJobError } from "@/lib/image-jobs/errors";
import {
  hideImage,
  listHiddenImageIds,
  listReviewImages,
  unhideImage,
  type ReviewImage,
} from "@/lib/image-jobs/image-hide";
import { resolveStudioRole } from "@/lib/image-jobs/quota";
import { createSqlRoleStore } from "@/lib/image-jobs/quota-sql";
import { createSqlBlobStore, createSqlHideAudit } from "@/lib/image-jobs/sql";
import type { StudioRole } from "@/lib/image-jobs/types";

async function reviewDeps() {
  const sql = await getSql();
  return {
    blobs: createSqlBlobStore(sql),
    audit: createSqlHideAudit(sql),
    roles: createSqlRoleStore(sql),
  };
}

export async function listReviewImagesFn(input?: {
  data?: { userQuery?: string };
}): Promise<{ role: StudioRole; images: ReviewImage[] }> {
  const { userId } = await requireActionUser();
  const deps = await reviewDeps();
  const role = await resolveStudioRole(deps.roles, userId);
  if (role !== "admin") return { role, images: [] };
  const result = await listReviewImages(deps, {
    actorId: userId,
    userQuery: input?.data?.userQuery ?? "",
  });
  if (!result.ok) return { role, images: [] };
  return { role, images: result.images };
}

export async function hideReviewImageFn(input: {
  data: { imageId: string; reason?: string };
}): Promise<{ id: string }> {
  const { userId } = await requireActionUser();
  const deps = await reviewDeps();
  const imageId = input.data.imageId.trim();
  const result = await hideImage(deps, {
    actorId: userId,
    imageId,
    reason: input.data.reason,
  });
  if (!result.ok) throw new ImageJobError(result.code);
  return { id: imageId };
}

export async function unhideReviewImageFn(input: {
  data: { imageId: string };
}): Promise<{ id: string }> {
  const { userId } = await requireActionUser();
  const deps = await reviewDeps();
  const imageId = input.data.imageId.trim();
  const result = await unhideImage(deps, { actorId: userId, imageId });
  if (!result.ok) throw new ImageJobError(result.code);
  return { id: imageId };
}

export async function listMyHiddenImageIdsFn(): Promise<string[]> {
  const { userId } = await requireActionUser();
  const sql = await getSql();
  return listHiddenImageIds(createSqlBlobStore(sql), userId);
}
