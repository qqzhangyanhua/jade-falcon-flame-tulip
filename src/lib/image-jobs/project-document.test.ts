import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryGatewayWorld } from "./memory.ts";
import { deleteStudioProject } from "./projects.ts";
import {
  MAX_PROJECT_DOCUMENT_BYTES,
  addProjectTag,
  copyProject,
  loadProjectDocument,
  removeProjectTag,
  renameProject,
  saveProjectDocument,
} from "./project-document.ts";
import { sampleProject, sampleStyle } from "../project/fixtures.ts";
import { emptyAssets } from "../project/schema.ts";

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

describe("project document: tags", () => {
  it("keeps one copy when the same tag is added twice", async () => {
    const { world, save, load } = setup(5_000);
    await save(documentFor(world.projectId, { name: "茶空间" }), 0);
    const first = await addProjectTag(world, {
      userId: world.userId,
      projectId: world.projectId,
      tag: "  客户  ",
    });
    assert.deepEqual(first, {
      ok: true,
      value: { tags: ["客户"], version: 2, updatedAt: 5_000 },
    });
    const second = await addProjectTag(world, {
      userId: world.userId,
      projectId: world.projectId,
      tag: "客户",
    });
    assert.deepEqual(second, {
      ok: true,
      value: { tags: ["客户"], version: 2, updatedAt: 5_000 },
    });
    const loaded = await load();
    assert.equal(loaded.ok, true);
    if (!loaded.ok || !loaded.value.document) return;
    assert.deepEqual(loaded.value.document.tags, ["客户"]);
    assert.equal(loaded.value.document.name, "茶空间");
    assert.equal(loaded.value.version, 2);
  });

  it("rejects a tag longer than 20 characters and accepts one of exactly 20", async () => {
    const { world, save, load } = setup();
    await save(documentFor(world.projectId), 0);
    const tooLong = "签".repeat(21);
    assert.deepEqual(
      await addProjectTag(world, {
        userId: world.userId,
        projectId: world.projectId,
        tag: tooLong,
      }),
      { ok: false, code: "invalid_document" },
    );
    const kept = await load();
    assert.deepEqual(kept.ok && kept.value.document?.tags, []);

    const exact = "签".repeat(20);
    const added = await addProjectTag(world, {
      userId: world.userId,
      projectId: world.projectId,
      tag: exact,
    });
    assert.equal(added.ok, true);
    if (!added.ok) return;
    assert.deepEqual(added.value.tags, [exact]);
    const loaded = await load();
    assert.deepEqual(loaded.ok && loaded.value.document?.tags, [exact]);
  });

  it("rejects an empty tag", async () => {
    const { world, save, load } = setup();
    await save(documentFor(world.projectId, { tags: ["客户"] }), 0);
    assert.deepEqual(
      await addProjectTag(world, { userId: world.userId, projectId: world.projectId, tag: "   " }),
      { ok: false, code: "invalid_document" },
    );
    const loaded = await load();
    assert.deepEqual(loaded.ok && loaded.value.document?.tags, ["客户"]);
  });

  it("rejects a ninth tag and keeps the first eight", async () => {
    const { world, save, load } = setup();
    const eight = ["一", "二", "三", "四", "五", "六", "七", "八"];
    await save(documentFor(world.projectId, { tags: eight }), 0);
    assert.deepEqual(
      await addProjectTag(world, { userId: world.userId, projectId: world.projectId, tag: "九" }),
      { ok: false, code: "invalid_document" },
    );
    const loaded = await load();
    assert.deepEqual(loaded.ok && loaded.value.document?.tags, eight);
  });

  it("removes one tag and leaves the others", async () => {
    const { world, save, load } = setup(5_000);
    await save(documentFor(world.projectId, { tags: ["客户", "春季"] }), 0);
    const removed = await removeProjectTag(world, {
      userId: world.userId,
      projectId: world.projectId,
      tag: " 客户 ",
    });
    assert.deepEqual(removed, {
      ok: true,
      value: { tags: ["春季"], version: 2, updatedAt: 5_000 },
    });
    const loaded = await load();
    assert.deepEqual(loaded.ok && loaded.value.document?.tags, ["春季"]);
    assert.equal(loaded.ok && loaded.value.document?.brief, "一个示例项目");
  });

  it("rejects adding a tag on someone else's project, even when the tag is empty", async () => {
    const { world, save, load } = setup();
    await save(documentFor(world.projectId, { tags: ["客户"] }), 0);
    assert.deepEqual(
      await addProjectTag(world, {
        userId: "someone-else",
        projectId: world.projectId,
        tag: "   ",
      }),
      { ok: false, code: "forbidden" },
    );
    const loaded = await load();
    assert.deepEqual(loaded.ok && loaded.value.document?.tags, ["客户"]);
  });

  it("rejects removing a tag from someone else's project", async () => {
    const { world, save, load } = setup();
    await save(documentFor(world.projectId, { tags: ["客户"] }), 0);
    assert.deepEqual(
      await removeProjectTag(world, {
        userId: "someone-else",
        projectId: world.projectId,
        tag: "客户",
      }),
      { ok: false, code: "forbidden" },
    );
    const loaded = await load();
    assert.deepEqual(loaded.ok && loaded.value.document?.tags, ["客户"]);
  });

  it("rejects adding or removing a tag on a deleted project", async () => {
    const { world, save } = setup();
    await save(documentFor(world.projectId, { tags: ["客户"] }), 0);
    await deleteStudioProject(world, { userId: world.userId, projectId: world.projectId });
    assert.deepEqual(
      await addProjectTag(world, { userId: world.userId, projectId: world.projectId, tag: "春季" }),
      { ok: false, code: "project_deleted" },
    );
    assert.deepEqual(
      await removeProjectTag(world, {
        userId: world.userId,
        projectId: world.projectId,
        tag: "客户",
      }),
      { ok: false, code: "project_deleted" },
    );
  });

  it("rejects an anonymous caller", async () => {
    const { world, save } = setup();
    await save(documentFor(world.projectId, { tags: ["客户"] }), 0);
    assert.deepEqual(
      await addProjectTag(world, { userId: "", projectId: world.projectId, tag: "春季" }),
      { ok: false, code: "unauthorized" },
    );
    assert.deepEqual(
      await removeProjectTag(world, { userId: "", projectId: world.projectId, tag: "客户" }),
      { ok: false, code: "unauthorized" },
    );
  });
});

describe("project document: copy", () => {
  it("creates a new project for the same owner, named '<原名> 副本', keeping the current image model", async () => {
    const { world, save, load } = setup(5_000);
    await world.projects.updateCurrentModel(world.projectId, "mdl-kept");
    await save(documentFor(world.projectId, { name: "茶空间", currentImageModelId: "mdl-doc" }), 0);
    const quotaBefore = await world.quota.snapshot(world.userId, 5_000);
    const copied = await copyProject(
      { ...world, newId: () => "prj_copy" },
      { userId: world.userId, projectId: world.projectId },
    );
    assert.deepEqual(copied, {
      ok: true,
      value: { id: "prj_copy", name: "茶空间 副本", version: 1 },
    });
    const row = await world.projects.get("prj_copy");
    assert.equal(row?.userId, world.userId);
    assert.equal(row?.currentImageModelId, "mdl-kept");
    assert.equal(row?.deletedAt, null);
    const source = await load();
    assert.equal(source.ok && source.value.document?.name, "茶空间");
    assert.equal(source.ok && source.value.version, 1);
    const opened = await load(world.userId, "prj_copy");
    assert.equal(opened.ok && opened.value.document?.name, "茶空间 副本");
    assert.equal(opened.ok && opened.value.document?.currentImageModelId, "mdl-doc");
    assert.deepEqual(await world.quota.snapshot(world.userId, 5_000), quotaBefore);
    assert.deepEqual(world.calls, []);
    assert.deepEqual(await world.jobs.listByUser(world.userId), []);
  });

  it("deep-copies the document so editing the copy leaves the source and its image ids alone", async () => {
    const { world, save, load } = setup();
    const assets = emptyAssets();
    assets.kv = {
      slot: "kv",
      adoptedId: "img_kv",
      revs: [
        {
          id: "img_kv",
          parentId: null,
          url: "/api/images/img_kv",
          createdAt: 1,
          action: "generate",
          diff: "",
          writeback: "none",
          styleRev: 1,
        },
      ],
    };
    await save(
      documentFor(world.projectId, {
        name: "茶空间",
        brief: "原文",
        prototypeDataUrl: "/api/images/wire",
        referenceImageUrls: ["/api/images/ref"],
        styles: [
          sampleStyle("a", {
            status: "active",
            candidateUrl: "/api/images/preview_a",
            assets,
          }),
        ],
      }),
      0,
    );
    const copied = await copyProject(
      { ...world, newId: () => "prj_copy" },
      { userId: world.userId, projectId: world.projectId },
    );
    assert.equal(copied.ok, true);

    const opened = await load(world.userId, "prj_copy");
    assert.equal(opened.ok, true);
    if (!opened.ok || !opened.value.document) return;
    const copyDoc = opened.value.document;
    assert.equal(copyDoc.id, "prj_copy");
    assert.equal(copyDoc.prototypeDataUrl, "/api/images/wire");
    assert.deepEqual(copyDoc.referenceImageUrls, ["/api/images/ref"]);
    assert.equal(copyDoc.styles[0]?.candidateUrl, "/api/images/preview_a");
    assert.equal(copyDoc.styles[0]?.assets.kv?.revs[0]?.id, "img_kv");
    assert.equal(copyDoc.styles[0]?.assets.kv?.revs[0]?.url, "/api/images/img_kv");
    assert.equal(copyDoc.styles[0]?.assets.kv?.adoptedId, "img_kv");

    const edited = {
      ...copyDoc,
      brief: "改过的副本",
      prototypeDataUrl: "/api/images/other-wire",
      styles: copyDoc.styles.map((style, index) =>
        index === 0
          ? {
              ...style,
              name: "被改的风格",
              candidateUrl: "/api/images/other-preview",
              assets: {
                ...style.assets,
                kv: {
                  ...style.assets.kv!,
                  adoptedId: "img_other",
                  revs: style.assets.kv!.revs.map((rev) => ({
                    ...rev,
                    id: "img_other",
                    url: "/api/images/other",
                  })),
                },
              },
            }
          : style,
      ),
    };
    const saved = await save(edited, opened.value.version, world.userId, "prj_copy");
    assert.equal(saved.ok, true);

    const source = await load();
    assert.equal(source.ok, true);
    if (!source.ok || !source.value.document) return;
    assert.equal(source.value.document.name, "茶空间");
    assert.equal(source.value.document.brief, "原文");
    assert.equal(source.value.document.prototypeDataUrl, "/api/images/wire");
    assert.deepEqual(source.value.document.referenceImageUrls, ["/api/images/ref"]);
    assert.equal(source.value.document.styles[0]?.name, "风格 a");
    assert.equal(source.value.document.styles[0]?.candidateUrl, "/api/images/preview_a");
    assert.equal(source.value.document.styles[0]?.assets.kv?.adoptedId, "img_kv");
    assert.equal(source.value.document.styles[0]?.assets.kv?.revs[0]?.id, "img_kv");
    assert.equal(source.value.document.styles[0]?.assets.kv?.revs[0]?.url, "/api/images/img_kv");
    assert.equal(source.value.version, 1);
  });

  it("rejects copying someone else's project and leaves it unchanged", async () => {
    const { world, save, load } = setup();
    await save(documentFor(world.projectId, { name: "茶空间" }), 0);
    assert.deepEqual(
      await copyProject(
        { ...world, newId: () => "prj_stolen" },
        { userId: "someone-else", projectId: world.projectId },
      ),
      { ok: false, code: "forbidden" },
    );
    assert.equal(await world.projects.get("prj_stolen"), null);
    const source = await load();
    assert.equal(source.ok && source.value.document?.name, "茶空间");
    assert.equal(source.ok && source.value.version, 1);
  });

  it("rejects a deleted project", async () => {
    const { world, save } = setup();
    await save(documentFor(world.projectId, { name: "茶空间" }), 0);
    await deleteStudioProject(world, { userId: world.userId, projectId: world.projectId });
    assert.deepEqual(
      await copyProject(
        { ...world, newId: () => "prj_ghost" },
        { userId: world.userId, projectId: world.projectId },
      ),
      { ok: false, code: "project_deleted" },
    );
    assert.equal(await world.projects.get("prj_ghost"), null);
  });

  it("rejects a missing project and a project with no document", async () => {
    const { world } = setup();
    assert.deepEqual(await copyProject(world, { userId: world.userId, projectId: "prj_nope" }), {
      ok: false,
      code: "not_found",
    });
    assert.deepEqual(
      await copyProject(world, { userId: world.userId, projectId: world.projectId }),
      { ok: false, code: "not_found" },
    );
  });

  it("keeps the 副本 suffix when the source name is already 40 characters", async () => {
    const { world, save, load } = setup();
    const sourceName = "名".repeat(40);
    await save(documentFor(world.projectId, { name: sourceName }), 0);
    const copied = await copyProject(
      { ...world, newId: () => "prj_long" },
      { userId: world.userId, projectId: world.projectId },
    );
    assert.equal(copied.ok, true);
    if (!copied.ok) return;
    assert.equal(copied.value.name, `${sourceName} 副本`);
    const opened = await load(world.userId, "prj_long");
    assert.equal(opened.ok && opened.value.document?.name, `${sourceName} 副本`);
    const source = await load();
    assert.equal(source.ok && source.value.document?.name, sourceName);
  });

  it("stamps the copy document with the copy time", async () => {
    const { world, save, load } = setup(9_000);
    await save(documentFor(world.projectId, { name: "茶空间", createdAt: 100 }), 0);
    const copied = await copyProject(
      { ...world, newId: () => "prj_copy" },
      { userId: world.userId, projectId: world.projectId },
    );
    assert.equal(copied.ok, true);
    const opened = await load(world.userId, "prj_copy");
    assert.equal(opened.ok && opened.value.document?.createdAt, 9_000);
    const source = await load();
    assert.equal(source.ok && source.value.document?.createdAt, 100);
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
