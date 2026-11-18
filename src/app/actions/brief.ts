"use server";

import { requireActionUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { readImageForUserByUrl } from "@/lib/image-jobs/image-access";
import { createSqlBlobStore } from "@/lib/image-jobs/sql";
import { MAX_REFERENCE_IMAGES } from "@/lib/project/schema";
import {
  parseBrief as parseBriefWithModel,
  referenceDirection as referenceDirectionWithModel,
  tailorDirections as tailorDirectionsWithModel,
  type ReferenceDirectionResult,
  type TailoredDirection,
} from "@/lib/style-ai";
import { briefIntentInputSchema } from "@/lib/style-ai/shared";
import type { BriefIntent } from "@/lib/types";

const BRIEF_MAX_CHARS = 2000;

export async function parseBrief(input: { data: { brief: string } }): Promise<BriefIntent> {
  await requireActionUser();
  const brief = typeof input.data.brief === "string" ? input.data.brief.slice(0, BRIEF_MAX_CHARS) : "";
  return parseBriefWithModel(brief);
}

export async function tailorDirections(input: {
  data: { intent: BriefIntent };
}): Promise<TailoredDirection[]> {
  await requireActionUser();
  const intent = briefIntentInputSchema.safeParse(input.data.intent);
  // Nothing is spent on a malformed intent; the caller's catch falls back to preset directions.
  if (!intent.success) throw new Error("invalid_intent");
  return tailorDirectionsWithModel(intent.data);
}

/** Chat only. Bytes come from the caller's own image rows. The preview is a separate direction job. */
export async function referenceDirectionFn(input: {
  data: { intent: BriefIntent; imageUrls: string[] };
}): Promise<ReferenceDirectionResult> {
  const { userId } = await requireActionUser();
  const intent = briefIntentInputSchema.safeParse(input.data.intent);
  if (!intent.success) return { ok: false, error: "unparseable" };
  const urls = Array.isArray(input.data.imageUrls)
    ? input.data.imageUrls
        .filter((url): url is string => typeof url === "string")
        .slice(0, MAX_REFERENCE_IMAGES)
    : [];
  const blobs = createSqlBlobStore(await getSql());
  const images: Uint8Array[] = [];
  for (const url of urls) {
    const blob = await readImageForUserByUrl(blobs, url, userId);
    if (blob) images.push(blob.bytes);
  }
  return referenceDirectionWithModel(images, intent.data);
}
