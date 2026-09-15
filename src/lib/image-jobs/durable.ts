import { newEntityId } from "./ids.ts";
import type { ImageJobGatewayDeps } from "./stores.ts";
import type {
  DurableImageRef,
  ImageBlobRecord,
  ImageBytes,
  ImageBytesFetcher,
  ImageJobAction,
  ImageJobErrorCode,
  ImageRevRecord,
  OpenedDurableImage,
} from "./types.ts";

export const DURABLE_IMAGE_PATH_PREFIX = "/api/images/";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const GIF_MAGIC = [0x47, 0x49, 0x46];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];

export function durableImageUrl(id: string): string {
  return `${DURABLE_IMAGE_PATH_PREFIX}${id}`;
}

export function parseDurableImageId(url: string): string | null {
  const path = pathnameOf(url);
  if (!path) return null;
  if (!path.startsWith(DURABLE_IMAGE_PATH_PREFIX)) return null;
  const id = path.slice(DURABLE_IMAGE_PATH_PREFIX.length);
  if (!id || id.includes("/") || id.includes("..")) return null;
  return id;
}

function pathnameOf(url: string): string | null {
  if (url.startsWith("/")) {
    const q = url.indexOf("?");
    return q === -1 ? url : url.slice(0, q);
  }
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

function startsWithBytes(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((value, index) => bytes[index] === value);
}

function sniffImageType(bytes: Uint8Array): string | null {
  if (startsWithBytes(bytes, PNG_MAGIC)) return "image/png";
  if (startsWithBytes(bytes, JPEG_MAGIC)) return "image/jpeg";
  if (startsWithBytes(bytes, GIF_MAGIC)) return "image/gif";
  if (
    startsWithBytes(bytes, WEBP_RIFF) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function normalizeImageType(
  header: string | null,
  bytes: Uint8Array,
): string | null {
  const sniffed = sniffImageType(bytes);
  if (header) {
    const type = header.split(";")[0]?.trim().toLowerCase() ?? "";
    if (type.startsWith("image/")) return type;
  }
  return sniffed;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function bytesToDataUrl(bytes: Uint8Array, contentType: string): string {
  return `data:${contentType};base64,${bytesToBase64(bytes)}`;
}

export function decodeDataUrl(url: string): ImageBytes | null {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(url);
  if (!match) return null;
  const header = match[1] ?? "";
  const payload = match[2] ?? "";
  try {
    const bytes = Uint8Array.from(Buffer.from(payload, "base64"));
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    const contentType = normalizeImageType(header, bytes);
    if (!contentType) return null;
    return { bytes, contentType };
  } catch {
    return null;
  }
}

export async function fetchRemoteImage(url: string): Promise<ImageBytes | null> {
  if (url.startsWith("data:")) return decodeDataUrl(url);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = new Uint8Array(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return null;
    const contentType = normalizeImageType(res.headers.get("content-type"), buffer);
    if (!contentType) return null;
    return { bytes: buffer, contentType };
  } catch {
    return null;
  }
}

export async function loadImageBytes(
  url: string,
  fetchImage: ImageBytesFetcher = fetchRemoteImage,
): Promise<ImageBytes | null> {
  if (url.startsWith("data:")) return decodeDataUrl(url);
  return fetchImage(url);
}

export async function resolveUpstreamImageUrl(
  deps: ImageJobGatewayDeps,
  userId: string,
  imageUrl: string,
): Promise<string | null> {
  const durableId = parseDurableImageId(imageUrl);
  if (!durableId) return imageUrl;
  const blob = await deps.blobs.get(durableId);
  if (!blob || blob.userId !== userId) return null;
  return bytesToDataUrl(blob.bytes, blob.contentType);
}

export async function persistDurableCopies(
  deps: ImageJobGatewayDeps,
  input: {
    jobId: string;
    projectId: string;
    userId: string;
    action: ImageJobAction;
    sourceUrls: string[];
    createdAt: number;
  },
): Promise<ImageRevRecord[] | null> {
  const fetchImage = deps.fetchImage ?? fetchRemoteImage;
  const newId = deps.newId ?? newEntityId;
  const fetched: ImageBytes[] = [];
  for (const sourceUrl of input.sourceUrls) {
    const copy = await loadImageBytes(sourceUrl, fetchImage);
    if (!copy) return null;
    fetched.push(copy);
  }

  const revs: ImageRevRecord[] = [];
  for (const copy of fetched) {
    const id = newId("img");
    const blob: ImageBlobRecord = {
      id,
      userId: input.userId,
      projectId: input.projectId,
      jobId: input.jobId,
      contentType: copy.contentType,
      bytes: new Uint8Array(copy.bytes),
      createdAt: input.createdAt,
    };
    await deps.blobs.put(blob);
    revs.push(
      await deps.revs.append({
        id,
        jobId: input.jobId,
        projectId: input.projectId,
        userId: input.userId,
        url: durableImageUrl(id),
        action: input.action,
        createdAt: input.createdAt,
      }),
    );
  }
  return revs;
}

export type ListJobImagesResult =
  | { ok: true; images: DurableImageRef[] }
  | { ok: false; code: ImageJobErrorCode };

export type OpenJobImageResult =
  | { ok: true; image: OpenedDurableImage }
  | { ok: false; code: ImageJobErrorCode };

export async function listJobImages(
  deps: ImageJobGatewayDeps,
  input: { userId: string; jobId: string },
): Promise<ListJobImagesResult> {
  if (!input.userId) return { ok: false, code: "unauthorized" };
  const job = await deps.jobs.get(input.jobId);
  if (!job) return { ok: false, code: "not_found" };
  if (job.userId !== input.userId) return { ok: false, code: "forbidden" };

  const revs = await deps.revs.listByJob(input.jobId);
  const images: DurableImageRef[] = [];
  for (const rev of revs) {
    const blob = await deps.blobs.get(rev.id);
    if (!blob) continue;
    images.push({
      id: rev.id,
      jobId: rev.jobId,
      url: rev.url,
      contentType: blob.contentType,
    });
  }
  return { ok: true, images };
}

export async function openJobImage(
  deps: ImageJobGatewayDeps,
  input: { userId: string; imageId: string },
): Promise<OpenJobImageResult> {
  if (!input.userId) return { ok: false, code: "unauthorized" };
  const blob = await deps.blobs.get(input.imageId);
  if (!blob) return { ok: false, code: "not_found" };
  if (blob.userId !== input.userId) return { ok: false, code: "forbidden" };
  return {
    ok: true,
    image: {
      id: blob.id,
      jobId: blob.jobId,
      url: durableImageUrl(blob.id),
      contentType: blob.contentType,
      bytes: new Uint8Array(blob.bytes),
    },
  };
}
