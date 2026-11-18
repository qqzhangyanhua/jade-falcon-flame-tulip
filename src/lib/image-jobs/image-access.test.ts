import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readImageForUser, readImageForUserByUrl } from "./image-access.ts";
import { createMemoryGatewayWorld } from "./memory.ts";
import { uploadWireframe } from "./upload.ts";

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
