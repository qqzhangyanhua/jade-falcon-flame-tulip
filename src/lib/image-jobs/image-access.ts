import { parseDurableImageId } from "./durable.ts";
import type { ImageBlobStore } from "./stores.ts";
import type { ImageBlobRecord } from "./types.ts";

/**
 * Every image_blobs row has a non-null user_id, so ownership is the whole rule.
 * Foreign, anonymous and missing all answer null so the route can reply 404 for each
 * and never confirm that someone else's id exists.
 */
export async function readImageForUser(
  blobs: Pick<ImageBlobStore, "get">,
  imageId: string,
  userId: string | null,
): Promise<ImageBlobRecord | null> {
  if (!userId) return null;
  const blob = await blobs.get(imageId);
  if (!blob || blob.userId !== userId) return null;
  return blob;
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
