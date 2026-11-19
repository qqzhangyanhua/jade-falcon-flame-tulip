import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryGatewayWorld } from "./memory.ts";
import { deleteStudioProject } from "./projects.ts";
import {
  MAX_PROJECT_DOCUMENT_BYTES,
  loadProjectDocument,
  renameProject,
  saveProjectDocument,
} from "./project-document.ts";
import { sampleProject } from "../project/fixtures.ts";

function documentFor(projectId: string, patch: Record<string, unknown> = {}) {
  const { mode: _mode, ...rest } = sampleProject({ id: projectId });
  return { ...rest, ...patch };
}

function setup(now = 1_700_000_000_000) {
  const world = createMemoryGatewayWorld({ now: () => now });
  return {
    world,
    save: (
      document: unknown,
      expectedVersion: number,
      userId = world.userId,
      projectId = world.projectId,
    ) => saveProjectDocument(world, { userId, projectId, document, expectedVersion }),
    load: (userId = world.userId, projectId = world.projectId) =>
      loadProjectDocument(world, { userId, projectId }),
  };
}

describe("project document: load", () => {
  it("returns an empty snapshot at version 0 for a project with no document yet", async () => {
    const { load } = setup();
    const result = await load();
    assert.deepEqual(result, { ok: true, value: { document: null, version: 0, updatedAt: null } });
  });

  it("returns what was saved, with the new version and timestamp", async () => {
    const { save, load, world } = setup(5_000);
    const saved = await save(documentFor(world.projectId), 0);
    assert.equal(saved.ok, true);
    const loaded = await load();
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.equal(loaded.value.version, 1);
    assert.equal(loaded.value.updatedAt, 5_000);
    assert.equal(loaded.value.document?.name, "示例");
  });

  it("rejects an anonymous caller", async () => {
    const { load } = setup();
    assert.deepEqual(await load(""), { ok: false, code: "unauthorized" });
  });

  it("hides another user's project", async () => {
    const { load } = setup();
    assert.deepEqual(await load("someone-else"), { ok: false, code: "forbidden" });
  });

  it("reports a missing project", async () => {
    const { load } = setup();
    assert.deepEqual(await load(undefined, "prj_nope"), { ok: false, code: "not_found" });
  });

  it("refuses to read a deleted project", async () => {
    const { load, world, save } = setup();
    await save(documentFor(world.projectId), 0);
    await deleteStudioProject(world, { userId: world.userId, projectId: world.projectId });
    assert.deepEqual(await load(), { ok: false, code: "project_deleted" });
  });
});

describe("project document: rename", () => {
  it("changes the name in the document and leaves the rest alone", async () => {
    const { world, save, load } = setup(5_000);
    const saved = await save(documentFor(world.projectId, { name: "旧名" }), 0);
    assert.equal(saved.ok, true);
    const renamed = await renameProject(world, {
      userId: world.userId,
      projectId: world.projectId,
      name: "  新名字  ",
    });
    assert.deepEqual(renamed, {
      ok: true,
      value: { name: "新名字", version: 2, updatedAt: 5_000 },
    });
    const loaded = await load();
    assert.equal(loaded.ok, true);
    if (!loaded.ok || !loaded.value.document) return;
    assert.equal(loaded.value.document.name, "新名字");
    assert.equal(loaded.value.document.brief, "一个示例项目");
    assert.equal(loaded.value.version, 2);
  });

  it("rejects an empty name and keeps the old one", async () => {
    const { world, save, load } = setup();
    await save(documentFor(world.projectId, { name: "旧名" }), 0);
    assert.deepEqual(
      await renameProject(world, { userId: world.userId, projectId: world.projectId, name: "   " }),
      { ok: false, code: "invalid_document" },
    );
    const loaded = await load();
    assert.equal(loaded.ok && loaded.value.document?.name, "旧名");
    assert.equal(loaded.ok && loaded.value.version, 1);
  });

  it("rejects a name over 40 characters and accepts one of exactly 40", async () => {
    const { world, save, load } = setup();
    await save(documentFor(world.projectId, { name: "旧名" }), 0);
    const tooLong = "名".repeat(41);
    assert.deepEqual(
      await renameProject(world, {
        userId: world.userId,
        projectId: world.projectId,
        name: tooLong,
      }),
      { ok: false, code: "invalid_document" },
    );
    const kept = await load();
    assert.equal(kept.ok && kept.value.document?.name, "旧名");

    const exact = "名".repeat(40);
    const renamed = await renameProject(world, {
      userId: world.userId,
      projectId: world.projectId,
      name: exact,
    });
    assert.equal(renamed.ok, true);
    if (!renamed.ok) return;
    assert.equal(renamed.value.name, exact);
    const loaded = await load();
    assert.equal(loaded.ok && loaded.value.document?.name, exact);
  });

  it("rejects an anonymous caller", async () => {
    const { world, save } = setup();
    await save(documentFor(world.projectId), 0);
    assert.deepEqual(
      await renameProject(world, { userId: "", projectId: world.projectId, name: "新名字" }),
      { ok: false, code: "unauthorized" },
    );
  });

  it("rejects another user's project even when the name is empty, and keeps the old name", async () => {
    const { world, save, load } = setup();
    await save(documentFor(world.projectId, { name: "旧名" }), 0);
    assert.deepEqual(
      await renameProject(world, {
        userId: "someone-else",
        projectId: world.projectId,
        name: "   ",
      }),
      { ok: false, code: "forbidden" },
    );
    const loaded = await load();
    assert.equal(loaded.ok && loaded.value.document?.name, "旧名");
  });

  it("rejects a deleted project", async () => {
    const { world, save } = setup();
    await save(documentFor(world.projectId), 0);
    await deleteStudioProject(world, { userId: world.userId, projectId: world.projectId });
    assert.deepEqual(
      await renameProject(world, {
        userId: world.userId,
        projectId: world.projectId,
        name: "新名字",
      }),
      { ok: false, code: "project_deleted" },
    );
  });

  it("rejects a project that has no document yet", async () => {
    const { world } = setup();
    assert.deepEqual(
      await renameProject(world, {
        userId: world.userId,
        projectId: world.projectId,
        name: "新名字",
      }),
      { ok: false, code: "not_found" },
    );
  });
});

describe("project document: save", () => {
  it("bumps the version on every accepted save", async () => {
    const { save, world } = setup();
    const first = await save(documentFor(world.projectId), 0);
    const second = await save(documentFor(world.projectId, { name: "改名" }), 1);
    assert.equal(first.ok && first.value.version, 1);
    assert.equal(second.ok && second.value.version, 2);
  });

  it("does not store UI state such as mode", async () => {
    const { save, load, world } = setup();
    const result = await save({ ...documentFor(world.projectId), mode: "generating" }, 0);
    assert.equal(result.ok, true);
    const loaded = await load();
    assert.ok(loaded.ok);
    if (!loaded.ok) return;
    assert.equal("mode" in (loaded.value.document ?? {}), false);
  });

  it("rejects an anonymous caller", async () => {
    const { save, world } = setup();
    assert.deepEqual(await save(documentFor(world.projectId), 0, ""), {
      ok: false,
      code: "unauthorized",
    });
  });

  it("rejects saving into another user's project without changing it", async () => {
    const { save, load, world } = setup();
    const result = await save(documentFor(world.projectId), 0, "someone-else");
    assert.deepEqual(result, { ok: false, code: "forbidden" });
    const loaded = await load();
    assert.ok(loaded.ok);
    if (loaded.ok) assert.equal(loaded.value.version, 0);
  });

  it("reports not_found for a project that has no row", async () => {
    const { save } = setup();
    const result = await save(documentFor("prj_nope"), 0, undefined, "prj_nope");
    assert.deepEqual(result, { ok: false, code: "not_found" });
  });

  it("returns project_deleted when saving into a deleted project", async () => {
    const { save, world } = setup();
    await save(documentFor(world.projectId), 0);
    await deleteStudioProject(world, { userId: world.userId, projectId: world.projectId });
    assert.deepEqual(await save(documentFor(world.projectId), 1), {
      ok: false,
      code: "project_deleted",
    });
  });

  it("checks ownership before looking at the document", async () => {
    const { save } = setup();
    const result = await save({ nonsense: true }, 0, "someone-else");
    assert.deepEqual(result, { ok: false, code: "forbidden" });
  });

  it("returns version_conflict with the server copy when the expected version is stale", async () => {
    const { save, world } = setup();
    await save(documentFor(world.projectId, { name: "设备 A" }), 0);
    const stale = await save(documentFor(world.projectId, { name: "设备 B" }), 0);
    assert.equal(stale.ok, false);
    if (stale.ok) return;
    assert.equal(stale.code, "version_conflict");
    assert.equal(stale.current?.version, 1);
    assert.equal(stale.current?.document?.name, "设备 A");
  });

  it("does not overwrite the server copy on a conflict", async () => {
    const { save, load, world } = setup();
    await save(documentFor(world.projectId, { name: "设备 A" }), 0);
    await save(documentFor(world.projectId, { name: "设备 B" }), 0);
    const loaded = await load();
    assert.ok(loaded.ok);
    if (loaded.ok) {
      assert.equal(loaded.value.document?.name, "设备 A");
      assert.equal(loaded.value.version, 1);
    }
  });

  it("rejects an expected version ahead of the server", async () => {
    const { save, world } = setup();
    const result = await save(documentFor(world.projectId), 4);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "version_conflict");
  });

  it("rejects a document that does not match the schema", async () => {
    const { save, world } = setup();
    const result = await save(documentFor(world.projectId, { phase: "nowhere" }), 0);
    assert.deepEqual(result, { ok: false, code: "invalid_document" });
  });

  it("rejects a document with an inline data: wireframe", async () => {
    const { save, world } = setup();
    const result = await save(
      documentFor(world.projectId, { prototypeDataUrl: "data:image/png;base64,AAAA" }),
      0,
    );
    assert.deepEqual(result, { ok: false, code: "invalid_document" });
  });

  it("rejects a document whose id belongs to another project", async () => {
    const { save } = setup();
    const result = await save(documentFor("prj_other"), 0);
    assert.deepEqual(result, { ok: false, code: "invalid_document" });
  });

  it("rejects a document over the size cap and keeps the old copy", async () => {
    const { save, load, world } = setup();
    await save(documentFor(world.projectId), 0);
    const huge = documentFor(world.projectId, {
      brief: "x".repeat(MAX_PROJECT_DOCUMENT_BYTES + 1),
    });
    assert.deepEqual(await save(huge, 1), { ok: false, code: "document_too_large" });
    const loaded = await load();
    assert.ok(loaded.ok);
    if (loaded.ok) assert.equal(loaded.value.version, 1);
  });

  it("accepts a document just under the size cap", async () => {
    const { save, world } = setup();
    const base = Buffer.byteLength(JSON.stringify(documentFor(world.projectId, { brief: "" })));
    const result = await save(
      documentFor(world.projectId, { brief: "x".repeat(MAX_PROJECT_DOCUMENT_BYTES - base - 8) }),
      0,
    );
    assert.equal(result.ok, true);
  });
});
