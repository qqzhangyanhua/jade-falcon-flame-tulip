import { durableImageUrl, sniffImageType } from "./durable.ts";
import { newEntityId } from "./ids.ts";
import { loadOwnedProject } from "./projects.ts";
import type { ImageJobGatewayDeps } from "./stores.ts";
import type { ImageBlobRecord, ImageJobErrorCode } from "./types.ts";

export const MAX_WIREFRAME_BYTES = 4 * 1024 * 1024;
export const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024;

const ALLOWED_WIREFRAME_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];
const ALLOWED_REFERENCE_TYPES: readonly string[] = ["image/png", "image/jpeg"];

export type UploadWireframeResult =
  | { ok: true; id: string; url: string }
  | { ok: false; code: ImageJobErrorCode };

async function uploadProjectImage(
  deps: Pick<ImageJobGatewayDeps, "projects" | "blobs" | "now" | "newId">,
  input: { userId: string; projectId: string; dataUrl: string },
  policy: { maxBytes: number; allowedTypes: readonly string[] },
): Promise<UploadWireframeResult> {
  const loaded = await loadOwnedProject(deps.projects, input);
  if (!loaded.ok) return { ok: false, code: loaded.code };

  const match = /^data:[^;,]+;base64,([A-Za-z0-9+/]*={0,2})$/.exec(input.dataUrl);
  if (!match) return { ok: false, code: "invalid_image" };
  const payload = match[1] ?? "";

  // Reject before decoding so an oversized payload never gets buffered.
  if (Math.floor((payload.length * 3) / 4) > policy.maxBytes + 2) {
    return { ok: false, code: "image_too_large" };
  }
  const bytes = Uint8Array.from(Buffer.from(payload, "base64"));
  if (bytes.byteLength === 0) return { ok: false, code: "invalid_image" };
  if (bytes.byteLength > policy.maxBytes) return { ok: false, code: "image_too_large" };

  // The declared content type is client-controlled; only the magic bytes count.
  const contentType = sniffImageType(bytes);
  if (!contentType || !policy.allowedTypes.includes(contentType)) {
    return { ok: false, code: "invalid_image" };
  }

  const id = (deps.newId ?? newEntityId)("img");
  const record: ImageBlobRecord = {
    id,
    userId: input.userId,
    projectId: loaded.value.id,
    jobId: null,
    kind: "upload",
    contentType,
    bytes,
    createdAt: deps.now?.() ?? Date.now(),
  };
  await deps.blobs.put(record);
  return { ok: true, id, url: durableImageUrl(id) };
}

export async function uploadWireframe(
  deps: Pick<ImageJobGatewayDeps, "projects" | "blobs" | "now" | "newId">,
  input: { userId: string; projectId: string; dataUrl: string },
): Promise<UploadWireframeResult> {
  return uploadProjectImage(deps, input, {
    maxBytes: MAX_WIREFRAME_BYTES,
    allowedTypes: ALLOWED_WIREFRAME_TYPES,
  });
}

/** Same upload row as a wireframe, but jpeg/png only and a 20 MiB cap. Webp stays a wireframe format. */
export async function uploadReferenceImage(
  deps: Pick<ImageJobGatewayDeps, "projects" | "blobs" | "now" | "newId">,
  input: { userId: string; projectId: string; dataUrl: string },
): Promise<UploadWireframeResult> {
  return uploadProjectImage(deps, input, {
    maxBytes: MAX_REFERENCE_IMAGE_BYTES,
    allowedTypes: ALLOWED_REFERENCE_TYPES,
  });
}
