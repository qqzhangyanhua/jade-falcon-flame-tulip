import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDurableImageId, resolveUpstreamImageUrl } from "./durable.ts";
import { runImageJob } from "./gateway.ts";
import { createMemoryGatewayWorld } from "./memory.ts";
import { deleteStudioProject } from "./projects.ts";
import { MAX_WIREFRAME_BYTES, uploadWireframe } from "./upload.ts";

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function dataUrl(bytes: Uint8Array, type = "image/png"): string {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

function pngBytes(length = 64): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set(PNG_HEAD);
  return bytes;
}

describe("wireframe upload", () => {
  it("stores the image as an upload blob and returns its /api/images url", async () => {
    const world = createMemoryGatewayWorld();
    const result = await uploadWireframe(world, {
      userId: world.userId,
      projectId: world.projectId,
      dataUrl: dataUrl(pngBytes()),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.url, /^\/api\/images\/.+/);
    assert.ok(!result.url.startsWith("data:"));

    const id = parseDurableImageId(result.url);
    assert.ok(id);
    const blob = await world.blobs.get(id);
    assert.equal(blob?.kind, "upload");
    assert.equal(blob?.jobId, null);
    assert.equal(blob?.userId, world.userId);
    assert.equal(blob?.projectId, world.projectId);
    assert.equal(blob?.contentType, "image/png");
    assert.equal(blob?.bytes.byteLength, 64);
  });

  it("lets the owner use the uploaded wireframe as a structure reference", async () => {
    const world = createMemoryGatewayWorld();
    const result = await uploadWireframe(world, {
      userId: world.userId,
      projectId: world.projectId,
      dataUrl: dataUrl(pngBytes()),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const own = await resolveUpstreamImageUrl(world, world.userId, result.url);
    assert.match(own ?? "", /^data:image\/png;base64,/);
    assert.equal(await resolveUpstreamImageUrl(world, "someone-else", result.url), null);
  });

  it("sends the uploaded wireframe to the image upstream as the structure reference", async () => {
    const world = createMemoryGatewayWorld();
    const uploaded = await uploadWireframe(world, {
      userId: world.userId,
      projectId: world.projectId,
      dataUrl: dataUrl(pngBytes()),
    });
    assert.equal(uploaded.ok, true);
    if (!uploaded.ok) return;

    const run = await runImageJob(world, {
      userId: world.userId,
      projectId: world.projectId,
      action: "generate",
      slot: "ui_hero",
      prompt: "flagship screen",
      aspect: "16:9",
      n: 1,
      imageUrl: uploaded.url,
    });
    assert.equal(run.ok, true);
    assert.match(world.calls.at(-1)?.imageUrl ?? "", /^data:image\/png;base64,/);
  });

  it("rejects a project owned by another user", async () => {
    const world = createMemoryGatewayWorld();
    const result = await uploadWireframe(world, {
      userId: "intruder",
      projectId: world.projectId,
      dataUrl: dataUrl(pngBytes()),
    });
    assert.deepEqual(result, { ok: false, code: "forbidden" });
  });

  it("rejects anonymous callers, unknown projects and deleted projects", async () => {
    const world = createMemoryGatewayWorld();
    const input = { projectId: world.projectId, dataUrl: dataUrl(pngBytes()) };
    assert.deepEqual(await uploadWireframe(world, { ...input, userId: "" }), {
      ok: false,
      code: "unauthorized",
    });
    assert.deepEqual(
      await uploadWireframe(world, { ...input, userId: world.userId, projectId: "prj_missing" }),
      { ok: false, code: "not_found" },
    );
    await deleteStudioProject(world, { userId: world.userId, projectId: world.projectId });
    assert.deepEqual(await uploadWireframe(world, { ...input, userId: world.userId }), {
      ok: false,
      code: "project_deleted",
    });
  });

  it("rejects images over the size limit and stores nothing", async () => {
    const world = createMemoryGatewayWorld();
    const result = await uploadWireframe(world, {
      userId: world.userId,
      projectId: world.projectId,
      dataUrl: dataUrl(pngBytes(MAX_WIREFRAME_BYTES + 1)),
    });
    assert.deepEqual(result, { ok: false, code: "image_too_large" });

    const atLimit = await uploadWireframe(world, {
      userId: world.userId,
      projectId: world.projectId,
      dataUrl: dataUrl(pngBytes(MAX_WIREFRAME_BYTES)),
    });
    assert.equal(atLimit.ok, true);
  });

  it("rejects non-image payloads, disallowed types and a lying content type", async () => {
    const world = createMemoryGatewayWorld();
    const base = { userId: world.userId, projectId: world.projectId };
    const text = new TextEncoder().encode("<svg onload=alert(1)></svg>");
    for (const url of [
      "not a data url",
      "https://example.com/a.png",
      dataUrl(text, "image/svg+xml"),
      dataUrl(text, "image/png"),
      dataUrl(new Uint8Array(), "image/png"),
      dataUrl(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), "image/gif"),
    ]) {
      assert.deepEqual(await uploadWireframe(world, { ...base, dataUrl: url }), {
        ok: false,
        code: "invalid_image",
      });
    }
  });

  it("deletes the project's uploaded images together with the project", async () => {
    const world = createMemoryGatewayWorld();
    const result = await uploadWireframe(world, {
      userId: world.userId,
      projectId: world.projectId,
      dataUrl: dataUrl(pngBytes()),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const id = parseDurableImageId(result.url);
    assert.ok(id);
    assert.ok(await world.blobs.get(id));

    const deleted = await deleteStudioProject(world, {
      userId: world.userId,
      projectId: world.projectId,
    });
    assert.equal(deleted.ok, true);
    assert.equal(await world.blobs.get(id), null);
  });
});
