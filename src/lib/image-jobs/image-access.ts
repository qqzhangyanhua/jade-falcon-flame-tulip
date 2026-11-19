import { parseDurableImageId, sniffImageType } from "./durable.ts";
import type { ImageBlobStore } from "./stores.ts";
import type { ImageBlobRecord } from "./types.ts";
import { MAX_REFERENCE_IMAGE_BYTES } from "./upload.ts";

const REFERENCE_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

/**
 * Every image_blobs row has a non-null user_id, so ownership is the whole rule.
 * A hidden image answers null for the owner too: the route must not send those bytes.
 * Foreign, anonymous, hidden and missing all answer null so the route can reply 404
 * for each and never confirm that someone else's id exists.
 */
export async function readImageForUser(
  blobs: Pick<ImageBlobStore, "get">,
  imageId: string,
  userId: string | null,
): Promise<ImageBlobRecord | null> {
  if (!userId) return null;
  const blob = await blobs.get(imageId);
  if (!blob || blob.hidden || blob.userId !== userId) return null;
  return blob;
}

function declaredImageType(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * An owned row may be sent only when it is an upload, jpeg or png by both
 * the stored type and the magic bytes, and at most 20 MiB.
 */
export function referenceUploadMayBeSent(
  blob: Pick<ImageBlobRecord, "kind" | "contentType" | "bytes">,
): boolean {
  if (blob.kind !== "upload") return false;
  if (blob.bytes.byteLength < 1 || blob.bytes.byteLength > MAX_REFERENCE_IMAGE_BYTES) return false;
  const sniffed = sniffImageType(blob.bytes);
  if (!sniffed || !REFERENCE_IMAGE_TYPES.has(sniffed)) return false;
  return declaredImageType(blob.contentType) === sniffed;
}

export type ReferenceUploadBytes =
  | { ok: true; images: Uint8Array[] }
  | { ok: false; error: "invalid_image" };

/**
 * Bytes for reference direction. Null stays out: that row is not the caller's.
 * Any owned row that fails the upload rule rejects the call, so those bytes
 * are not sent and no direction candidate is added.
 */
export function selectReferenceUploadBytes(
  blobs: readonly (Pick<ImageBlobRecord, "kind" | "contentType" | "bytes"> | null)[],
): ReferenceUploadBytes {
  const images: Uint8Array[] = [];
  for (const blob of blobs) {
    if (!blob) continue;
    if (!referenceUploadMayBeSent(blob)) return { ok: false, error: "invalid_image" };
    images.push(blob.bytes);
  }
  return { ok: true, images };
}

/** Reference direction reads by stored address. Another user, a missing row, or a non-address is null. */
export async function readImageForUserByUrl(
  blobs: Pick<ImageBlobStore, "get">,
  imageUrl: string,
  userId: string | null,
): Promise<ImageBlobRecord | null> {
  const imageId = parseDurableImageId(imageUrl);
  if (!imageId) return null;
  return readImageForUser(blobs, imageId, userId);
}
