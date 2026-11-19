import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hideImage,
  listImageHideAudit,
  listReviewImages,
  readReviewImage,
  unhideImage,
} from "./image-hide.ts";
import { readImageForUser } from "./image-access.ts";
import { createMemoryGatewayWorld } from "./memory.ts";
import type { ImageBlobRecord } from "./types.ts";
import { uploadWireframe } from "./upload.ts";

const PNG = new Uint8Array(64);
PNG.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function uploaded() {
  const world = createMemoryGatewayWorld();
  await world.roles.setRole("admin-1", "admin");
  const result = await uploadWireframe(world, {
    userId: world.userId,
    projectId: world.projectId,
    dataUrl: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("upload failed");
  return { world, id: result.id };
}

describe("image hide audit", () => {
  it("records the admin, time, and reason for a hide and the later unhide", async () => {
    const { world, id } = await uploaded();
    const hidden = await hideImage(world, {
      actorId: "admin-1",
      imageId: id,
      reason: "  不当内容  ",
    });
    assert.equal(hidden.ok, true);
    const cleared = await unhideImage(world, { actorId: "admin-1", imageId: id, reason: "   " });
    assert.equal(cleared.ok, true);

    const audit = await listImageHideAudit(world, id);
    assert.deepEqual(
      audit.map((row) => ({
        imageId: row.imageId,
        action: row.action,
        adminId: row.adminId,
        at: row.at,
        reason: row.reason,
      })),
      [
        {
          imageId: id,
          action: "hide",
          adminId: "admin-1",
          at: 1_700_000_000_000,
          reason: "不当内容",
        },
        {
          imageId: id,
          action: "unhide",
          adminId: "admin-1",
          at: 1_700_000_000_000,
          reason: null,
        },
      ],
    );
  });

  it("rejects a non-admin hide or unhide and writes no audit row", async () => {
    const { world, id } = await uploaded();
    const hidden = await hideImage(world, { actorId: world.userId, imageId: id, reason: "不行" });
    assert.deepEqual(hidden, { ok: false, code: "forbidden" });
    assert.equal((await listImageHideAudit(world, id)).length, 0);
    assert.equal((await readImageForUser(world.blobs, id, world.userId))?.id, id);

    const cleared = await unhideImage(world, { actorId: world.userId, imageId: id });
    assert.deepEqual(cleared, { ok: false, code: "forbidden" });
    assert.equal((await listImageHideAudit(world, id)).length, 0);
  });
});

function blob(
  id: string,
  userId: string,
  createdAt: number,
  kind: ImageBlobRecord["kind"],
): ImageBlobRecord {
  return {
    id,
    userId,
    projectId: "prj_test",
    jobId: kind === "job" ? `job_${id}` : null,
    kind,
    contentType: "image/png",
    bytes: PNG,
    createdAt,
  };
}

describe("review image list", () => {
  it("lists generated images newest first, keeps hidden ones, and filters by user", async () => {
    const world = createMemoryGatewayWorld({ roles: { "admin-1": "admin" } });
    await world.blobs.put(blob("older", "user-a", 10, "job"));
    await world.blobs.put(blob("newer", "user-b", 30, "job"));
    await world.blobs.put(blob("mid", "user-a", 20, "job"));
    await world.blobs.put(blob("wire", "user-a", 40, "upload"));
    assert.equal(
      (await hideImage(world, { actorId: "admin-1", imageId: "mid", reason: "不当内容" })).ok,
      true,
    );

    assert.deepEqual(await listReviewImages(world, { actorId: world.userId, userQuery: "" }), {
      ok: false,
      code: "forbidden",
    });

    const all = await listReviewImages(world, { actorId: "admin-1", userQuery: "  " });
    assert.equal(all.ok, true);
    if (!all.ok) return;
    assert.deepEqual(
      all.images.map((image) => image.id),
      ["newer", "mid", "older"],
    );
    assert.equal(all.images.find((image) => image.id === "mid")?.hidden, true);
    assert.equal(all.images.find((image) => image.id === "mid")?.reason, "不当内容");
    assert.equal(all.images.find((image) => image.id === "newer")?.hidden, false);
    assert.equal(all.images.find((image) => image.id === "newer")?.reason, null);
    const hidden = all.images.find((image) => image.id === "mid");
    assert.deepEqual(hidden?.events, [
      { action: "hide", adminId: "admin-1", at: 1_700_000_000_000, reason: "不当内容" },
    ]);

    const filtered = await listReviewImages(world, { actorId: "admin-1", userQuery: "user-a" });
    assert.equal(filtered.ok, true);
    if (!filtered.ok) return;
    assert.deepEqual(
      filtered.images.map((image) => image.id),
      ["mid", "older"],
    );
  });

  it("returns review bytes only to an admin, and never while the image is hidden", async () => {
    const { world, id } = await uploaded();
    const visible = await readReviewImage(world, { actorId: "admin-1", imageId: id });
    assert.equal(visible?.id, id);
    assert.ok(visible && visible.bytes.byteLength > 0);
    assert.equal(await readReviewImage(world, { actorId: world.userId, imageId: id }), null);

    assert.equal((await hideImage(world, { actorId: "admin-1", imageId: id })).ok, true);
    assert.equal(await readReviewImage(world, { actorId: "admin-1", imageId: id }), null);

    assert.equal((await unhideImage(world, { actorId: "admin-1", imageId: id })).ok, true);
    assert.equal((await readReviewImage(world, { actorId: "admin-1", imageId: id }))?.id, id);
  });

  it("returns images past the first page, including who later revoked a hide", async () => {
    let now = 1_000;
    const world = createMemoryGatewayWorld({
      now: () => now,
      roles: { "admin-1": "admin", "admin-2": "admin" },
    });
    for (let index = 0; index < 49; index += 1) {
      await world.blobs.put(blob(`img_${String(index).padStart(2, "0")}`, "user-a", index, "job"));
    }
    assert.equal(
      (await hideImage(world, { actorId: "admin-1", imageId: "img_00", reason: "不当内容" })).ok,
      true,
    );
    now = 2_000;
    assert.equal(
      (await unhideImage(world, { actorId: "admin-2", imageId: "img_00" })).ok,
      true,
    );

    const first = await listReviewImages(world, { actorId: "admin-1", userQuery: "" });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.images.length, 48);
    assert.equal(first.images[0]?.id, "img_48");
    assert.equal(
      first.images.some((image) => image.id === "img_00"),
      false,
    );

    const second = await listReviewImages(world, {
      actorId: "admin-1",
      userQuery: "",
      offset: 48,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.deepEqual(
      second.images.map((image) => image.id),
      ["img_00"],
    );
    assert.deepEqual(second.images[0]?.events, [
      { action: "hide", adminId: "admin-1", at: 1_000, reason: "不当内容" },
      { action: "unhide", adminId: "admin-2", at: 2_000, reason: null },
    ]);
  });
});
