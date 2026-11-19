"use server";

import { requireActionUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { IMAGE_JOB_USER_MESSAGES } from "@/lib/image-jobs/errors";
import { listHiddenImageIds } from "@/lib/image-jobs/image-hide";
import { loadOwnedProject } from "@/lib/image-jobs/projects";
import { createSqlBlobStore, createSqlProjectStore } from "@/lib/image-jobs/sql";
import { exportManifest, type ExportManifest } from "@/lib/project/manifest";
import { styleBranchSchema } from "@/lib/project/schema";
import type { SlotPromptMeta } from "@/lib/project/slots";

export type ExportManifestActionResult =
  | { ok: true; manifest: ExportManifest }
  | { ok: false; message: string };

/**
 * Manifest for a zip or prompt pack. Hidden image ids are loaded for the project
 * owner. An exclude list on the request is ignored.
 */
export async function loadExportManifestFn(input: {
  data: {
    projectId: string;
    styleLine: unknown;
    enabledSlotIds?: readonly string[];
    customSlots?: readonly SlotPromptMeta[];
    product?: string;
  };
}): Promise<ExportManifestActionResult> {
  let userId: string;
  try {
    userId = (await requireActionUser()).userId;
  } catch {
    return { ok: false, message: IMAGE_JOB_USER_MESSAGES.unauthorized };
  }

  const projectId = input.data.projectId.trim();
  if (!projectId) return { ok: false, message: IMAGE_JOB_USER_MESSAGES.not_found };

  const sql = await getSql();
  const owned = await loadOwnedProject(createSqlProjectStore(sql), { userId, projectId });
  if (!owned.ok) return { ok: false, message: IMAGE_JOB_USER_MESSAGES[owned.code] };

  const parsed = styleBranchSchema.safeParse(input.data.styleLine);
  if (!parsed.success) return { ok: false, message: IMAGE_JOB_USER_MESSAGES.invalid_document };

  const excludeImageIds = await listHiddenImageIds(createSqlBlobStore(sql), owned.value.userId);
  const manifest = exportManifest(parsed.data, {
    enabledSlotIds: input.data.enabledSlotIds,
    customSlots: input.data.customSlots,
    product: input.data.product,
    excludeImageIds,
  });
  if (manifest.images.length === 0) return { ok: false, message: "没有可导出的图片" };
  return { ok: true, manifest };
}
