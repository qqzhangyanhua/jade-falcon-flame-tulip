import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openJobImage, resolveUpstreamImageUrl } from "./durable.ts";
import { readImageForUser, readImageForUserByUrl, selectReferenceUploadBytes } from "./image-access.ts";
import { hideImage, unhideImage } from "./image-hide.ts";
import { createMemoryGatewayWorld } from "./memory.ts";
import { MAX_REFERENCE_IMAGE_BYTES, uploadWireframe } from "./upload.ts";

const PNG = new Uint8Array(64);
PNG.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function uploaded() {
  const world = createMemoryGatewayWorld();
  const result = await uploadWireframe(world, {
    userId: world.userId,
    projectId: world.projectId,
    dataUrl: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("upload failed");
  return { world, id: result.id };
}

describe("image read access", () => {
  it("returns the blob to its owner", async () => {
    const { world, id } = await uploaded();
    const blob = await readImageForUser(world.blobs, id, world.userId);
    assert.equal(blob?.id, id);
  });

  it("treats another user's image as not found", async () => {
    const { world, id } = await uploaded();
    assert.equal(await readImageForUser(world.blobs, id, "someone-else"), null);
  });

  it("treats an anonymous caller as not found", async () => {
    const { world, id } = await uploaded();
    assert.equal(await readImageForUser(world.blobs, id, null), null);
    assert.equal(await readImageForUser(world.blobs, id, ""), null);
  });

  it("treats a missing image as not found", async () => {
    const { world } = await uploaded();
    assert.equal(await readImageForUser(world.blobs, "img_00000000", world.userId), null);
  });

  it("returns nothing for a hidden image, including to its owner, until the hide is undone", async () => {
    const { world, id } = await uploaded();
    await world.roles.setRole("admin-1", "admin");
    const hidden = await hideImage(world, {
      actorId: "admin-1",
      imageId: id,
      reason: "不当内容",
    });
    assert.equal(hidden.ok, true);
    assert.equal(await readImageForUser(world.blobs, id, world.userId), null);
    assert.equal(await readImageForUser(world.blobs, id, "someone-else"), null);
    assert.equal(await readImageForUser(world.blobs, id, null), null);
    assert.equal(
      await readImageForUserByUrl(world.blobs, `/api/images/${id}`, world.userId),
      null,
    );
    assert.equal((await openJobImage(world, { userId: world.userId, imageId: id })).ok, false);
    assert.equal(
      await resolveUpstreamImageUrl(world, world.userId, `/api/images/${id}`),
      null,
    );

    const restored = await unhideImage(world, { actorId: "admin-1", imageId: id });
    assert.equal(restored.ok, true);
    const blob = await readImageForUser(world.blobs, id, world.userId);
    assert.equal(blob?.id, id);
    assert.ok(blob && blob.bytes.byteLength > 0);
    assert.equal(await readImageForUser(world.blobs, id, "someone-else"), null);
    const opened = await openJobImage(world, { userId: world.userId, imageId: id });
    assert.equal(opened.ok, true);
    if (opened.ok) assert.ok(opened.image.bytes.byteLength > 0);
  });
});

describe("reference image read access", () => {
  it("returns the owner's bytes for a stored image address", async () => {
    const { world, id } = await uploaded();
    const blob = await readImageForUserByUrl(world.blobs, `/api/images/${id}`, world.userId);
    assert.equal(blob?.id, id);
    assert.equal(blob?.userId, world.userId);
    assert.ok(blob && blob.bytes.byteLength > 0);
  });

  it("returns null for someone else's image", async () => {
    const { world, id } = await uploaded();
    assert.equal(
      await readImageForUserByUrl(world.blobs, `/api/images/${id}`, "someone-else"),
      null,
    );
  });

  it("returns null for a missing image", async () => {
    const { world } = await uploaded();
    assert.equal(
      await readImageForUserByUrl(world.blobs, "/api/images/img_00000000", world.userId),
      null,
    );
  });

  it("returns null for an address that is not a stored image", async () => {
    const { world, id } = await uploaded();
    assert.equal(
      await readImageForUserByUrl(world.blobs, `data:image/png;base64,${id}`, world.userId),
      null,
    );
    assert.equal(
      await readImageForUserByUrl(world.blobs, "https://example.com/a.png", world.userId),
      null,
    );
  });
});

function withMagic(size: number, magic: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(magic);
  return bytes;
}

const JPEG = withMagic(32, [0xff, 0xd8, 0xff]);
const GIF = withMagic(16, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = withMagic(16, [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("selectReferenceUploadBytes", () => {
  it("sends only the caller's jpeg or png uploads and skips images that are not theirs", () => {
    const selected = selectReferenceUploadBytes([
      null,
      { kind: "upload", contentType: "image/png", bytes: PNG },
      null,
      { kind: "upload", contentType: "image/jpeg", bytes: JPEG },
    ]);
    assert.deepEqual(selected, { ok: true, images: [PNG, JPEG] });
  });

  it("rejects an owned blob that is not an upload, and does not include it", () => {
    assert.deepEqual(
      selectReferenceUploadBytes([
        { kind: "upload", contentType: "image/png", bytes: PNG },
        { kind: "job", contentType: "image/png", bytes: PNG },
      ]),
      { ok: false, error: "invalid_image" },
    );
  });

  it("rejects a non-jpeg or non-png upload", () => {
    assert.deepEqual(
      selectReferenceUploadBytes([{ kind: "upload", contentType: "image/gif", bytes: GIF }]),
      { ok: false, error: "invalid_image" },
    );
    assert.deepEqual(
      selectReferenceUploadBytes([{ kind: "upload", contentType: "image/webp", bytes: WEBP }]),
      { ok: false, error: "invalid_image" },
    );
    assert.deepEqual(
      selectReferenceUploadBytes([{ kind: "upload", contentType: "image/jpeg", bytes: GIF }]),
      { ok: false, error: "invalid_image" },
    );
  });

  it("rejects an upload larger than 20 MiB and accepts one at the cap", () => {
    const atCap = withMagic(MAX_REFERENCE_IMAGE_BYTES, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const over = withMagic(MAX_REFERENCE_IMAGE_BYTES + 1, [0xff, 0xd8, 0xff]);
    assert.deepEqual(
      selectReferenceUploadBytes([{ kind: "upload", contentType: "image/png", bytes: atCap }]),
      { ok: true, images: [atCap] },
    );
    assert.deepEqual(
      selectReferenceUploadBytes([{ kind: "upload", contentType: "image/jpeg", bytes: over }]),
      { ok: false, error: "invalid_image" },
    );
  });
});
