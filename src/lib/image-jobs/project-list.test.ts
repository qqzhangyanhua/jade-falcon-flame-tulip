import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryGatewayWorld } from "./memory.ts";
import { deleteStudioProject } from "./projects.ts";
import { importLocalProject, listProjectSummaries, PROJECT_SUMMARY_LIMIT } from "./project-list.ts";
import { loadProjectDocument, saveProjectDocument } from "./project-document.ts";
import { emptyAssets } from "../project/schema.ts";
import { sampleProject, sampleStyle } from "../project/fixtures.ts";

type World = ReturnType<typeof createMemoryGatewayWorld>;

function toDoc(patch: Parameters<typeof sampleProject>[0]) {
  const { mode: _mode, ...document } = sampleProject(patch);
  return document;
}

/** Creates a project row for `userId` and saves `patch` as its document at time `at`. */
async function seedProject(
  world: World,
  id: string,
  at: number,
  patch: Parameters<typeof sampleProject>[0] = {},
  userId = world.userId,
) {
  await world.projects.create({
    id,
    userId,
    currentImageModelId: "m",
    createdAt: 1,
    deletedAt: null,
  });
  const saved = await world.projects.saveDocument(id, toDoc({ id, ...patch }), 0, at);
  assert.equal(saved.status, "saved");
}

function page(result: Awaited<ReturnType<typeof listProjectSummaries>>) {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected a project page");
  return result.value;
}

function ids(result: Awaited<ReturnType<typeof listProjectSummaries>>): string[] {
  return page(result).items.map((p) => p.id);
}

function kvAssets(revs: { id: string; url: string }[], adoptedId: string | null) {
  const assets = emptyAssets();
  assets.kv = {
    slot: "kv",
    adoptedId,
    revs: revs.map((r) => ({
      id: r.id,
      parentId: null,
      url: r.url,
      createdAt: 1,
      action: "generate" as const,
      diff: "",
      writeback: "none" as const,
      styleRev: 1,
    })),
  };
  return assets;
}

describe("listProjectSummaries", () => {
  it("lists only the current user's projects", async () => {
    const world = createMemoryGatewayWorld();
    await seedProject(world, "mine", 10);
    await seedProject(world, "theirs", 20, {}, "someone-else");
    const result = await listProjectSummaries(world, { userId: world.userId });
    assert.deepEqual(ids(result), ["mine"]);
  });

  it("skips deleted projects", async () => {
    const world = createMemoryGatewayWorld();
    await seedProject(world, "keep", 10);
    await seedProject(world, "gone", 20);
    await deleteStudioProject(world, { userId: world.userId, projectId: "gone" });
    assert.deepEqual(ids(await listProjectSummaries(world, { userId: world.userId })), ["keep"]);
  });

  it("skips projects that never received a document", async () => {
    const world = createMemoryGatewayWorld();
    await seedProject(world, "synced", 10);
    assert.ok(await world.projects.get(world.projectId), "a project row without a document exists");
    const result = await listProjectSummaries(world, { userId: world.userId });
    assert.deepEqual(ids(result), ["synced"]);
  });

  it("orders by created time, newest first, when asked", async () => {
    const world = createMemoryGatewayWorld();
    await seedProject(world, "early", 50, { createdAt: 100 });
    await seedProject(world, "late", 10, { createdAt: 300 });
    await seedProject(world, "mid", 20, { createdAt: 200 });
    assert.deepEqual(
      ids(await listProjectSummaries(world, { userId: world.userId, sort: "created" })),
      ["late", "mid", "early"],
    );
  });

  it("orders by name, case-insensitively, when asked", async () => {
    const world = createMemoryGatewayWorld();
    await seedProject(world, "c", 1, { name: "citrus" });
    await seedProject(world, "a", 2, { name: "apple" });
    await seedProject(world, "b", 3, { name: "Banana" });
    assert.deepEqual(
      ids(await listProjectSummaries(world, { userId: world.userId, sort: "name" })),
      ["a", "b", "c"],
    );
  });

  it("orders by last update, newest first", async () => {
    const world = createMemoryGatewayWorld();
    await seedProject(world, "old", 10);
    await seedProject(world, "newest", 30);
    await seedProject(world, "mid", 20);
    assert.deepEqual(ids(await listProjectSummaries(world, { userId: world.userId })), [
      "newest",
      "mid",
      "old",
    ]);
  });

  it("returns at most 20, keeping the most recent", async () => {
    const world = createMemoryGatewayWorld();
    for (let i = 0; i < 25; i += 1) await seedProject(world, `p${i}`, 100 + i);
    const result = await listProjectSummaries(world, { userId: world.userId });
    assert.equal(PROJECT_SUMMARY_LIMIT, 20);
    const listed = page(result);
    assert.equal(listed.total, 25);
    assert.equal(listed.items.length, 20);
    assert.equal(listed.items[0]?.id, "p24");
    assert.equal(listed.items[19]?.id, "p5");
  });

  it("returns the next page after the first 20", async () => {
    const world = createMemoryGatewayWorld();
    for (let i = 0; i < 25; i += 1) await seedProject(world, `p${i}`, 100 + i);
    const second = page(await listProjectSummaries(world, { userId: world.userId, offset: 20 }));
    assert.equal(second.total, 25);
    assert.deepEqual(
      second.items.map((item) => item.id),
      ["p4", "p3", "p2", "p1", "p0"],
    );
    const past = page(await listProjectSummaries(world, { userId: world.userId, offset: 40 }));
    assert.equal(past.total, 25);
    assert.deepEqual(past.items, []);
  });

  it("carries id, name, stage, cover, update time and created time", async () => {
    const world = createMemoryGatewayWorld();
    await seedProject(world, "a", 42, {
      name: "茶空间",
      phase: "direction",
      currentStyleId: null,
      styles: [],
      createdAt: 7,
    });
    const result = await listProjectSummaries(world, { userId: world.userId });
    assert.deepEqual(result, {
      ok: true,
      value: {
        items: [
          {
            id: "a",
            name: "茶空间",
            stage: "direction",
            coverUrl: null,
            updatedAt: 42,
            createdAt: 7,
          },
        ],
        total: 1,
      },
    });
  });

  it("rejects an anonymous caller", async () => {
    const world = createMemoryGatewayWorld();
    assert.deepEqual(await listProjectSummaries(world, { userId: "" }), {
      ok: false,
      code: "unauthorized",
    });
  });

  it("finds projects by a case-insensitive part of the name", async () => {
    const world = createMemoryGatewayWorld();
    await seedProject(world, "tea", 30, { name: "Tea House" });
    await seedProject(world, "cha", 20, { name: "茶空间" });
    await seedProject(world, "coffee", 10, { name: "咖啡店" });
    assert.deepEqual(
      ids(await listProjectSummaries(world, { userId: world.userId, keyword: "tea" })),
      ["tea"],
    );
    assert.deepEqual(
      ids(await listProjectSummaries(world, { userId: world.userId, keyword: " 茶 " })),
      ["cha"],
    );
  });

  it("does not match a keyword that appears only in the brief", async () => {
    const world = createMemoryGatewayWorld();
    await seedProject(world, "named", 10, { name: "甲", brief: "茶空间" });
    assert.deepEqual(
      ids(await listProjectSummaries(world, { userId: world.userId, keyword: "茶" })),
      [],
    );
  });

  it("search skips deleted projects and other users", async () => {
    const world = createMemoryGatewayWorld();
    await seedProject(world, "keep", 10, { name: "茶空间" });
    await seedProject(world, "gone", 30, { name: "茶室" });
    await seedProject(world, "theirs", 40, { name: "茶馆" }, "someone-else");
    await deleteStudioProject(world, { userId: world.userId, projectId: "gone" });
    assert.deepEqual(
      ids(await listProjectSummaries(world, { userId: world.userId, keyword: "茶" })),
      ["keep"],
    );
  });

  describe("cover", () => {
    function withStyle(patch: Parameters<typeof sampleStyle>[1], extra: string[] = []) {
      const styles = [
        sampleStyle("a", { status: "active", ...patch }),
        ...extra.map((id) => sampleStyle(id, { candidateUrl: `/api/images/other_${id}` })),
      ];
      return { currentStyleId: "a", styles };
    }

    async function coverOf(world: World, patch: Parameters<typeof sampleProject>[0]) {
      await seedProject(world, "c", 5, patch);
      const result = await listProjectSummaries(world, { userId: world.userId });
      return page(result).items[0]?.coverUrl;
    }

    it("prefers the adopted main visual of the current style line", async () => {
      const world = createMemoryGatewayWorld();
      const cover = await coverOf(
        world,
        withStyle({
          assets: kvAssets(
            [
              { id: "r1", url: "/api/images/one" },
              { id: "r2", url: "/api/images/two" },
              { id: "r3", url: "/api/images/three" },
            ],
            "r2",
          ),
        }),
      );
      assert.equal(cover, "/api/images/two");
    });

    it("uses the newest main visual when none is adopted", async () => {
      const world = createMemoryGatewayWorld();
      const cover = await coverOf(
        world,
        withStyle({
          assets: kvAssets(
            [
              { id: "r1", url: "/api/images/one" },
              { id: "r2", url: "/api/images/two" },
            ],
            null,
          ),
        }),
      );
      assert.equal(cover, "/api/images/two");
    });

    it("falls back to the locked direction's preview", async () => {
      const world = createMemoryGatewayWorld();
      const cover = await coverOf(world, withStyle({ candidateUrl: "/api/images/preview_a" }));
      assert.equal(cover, "/api/images/preview_a");
    });

    it("is null when there is neither a main visual nor a preview", async () => {
      const world = createMemoryGatewayWorld();
      const cover = await coverOf(world, withStyle({ candidateUrl: null }));
      assert.equal(cover, null);
    });

    it("ignores other style lines and other slots", async () => {
      const world = createMemoryGatewayWorld();
      const other = sampleStyle("b", {
        assets: kvAssets([{ id: "x", url: "/api/images/b_kv" }], null),
      });
      const assets = emptyAssets();
      assets.ui_hero.revs = [
        {
          id: "h",
          parentId: null,
          url: "/api/images/hero",
          createdAt: 1,
          action: "generate",
          diff: "",
          writeback: "none",
          styleRev: 1,
        },
      ];
      const current = sampleStyle("a", {
        status: "active",
        candidateUrl: "/api/images/preview_a",
        assets,
      });
      const cover = await coverOf(world, { currentStyleId: "a", styles: [current, other] });
      assert.equal(cover, "/api/images/preview_a");
    });
  });
});

describe("importLocalProject", () => {
  function input(world: World, projectId = world.projectId, userId = world.userId) {
    return { userId, projectId, document: toDoc({ id: projectId, name: "本地项目" }) };
  }

  it("imports into an existing project row of the user and makes it readable", async () => {
    const world = createMemoryGatewayWorld();
    const result = await importLocalProject(world, input(world));
    assert.deepEqual(result, { ok: true, value: { status: "imported", version: 1 } });
    const loaded = await loadProjectDocument(world, {
      userId: world.userId,
      projectId: world.projectId,
    });
    assert.equal(loaded.ok && loaded.value.document?.name, "本地项目");
  });

  it("refuses an id that maps to no project row", async () => {
    const world = createMemoryGatewayWorld();
    const result = await importLocalProject(world, input(world, "prj_unknown"));
    assert.deepEqual(result, { ok: false, code: "not_found" });
    assert.equal(await world.projects.get("prj_unknown"), null);
  });

  it("refuses another user's project", async () => {
    const world = createMemoryGatewayWorld();
    const result = await importLocalProject(world, input(world, world.projectId, "someone-else"));
    assert.deepEqual(result, { ok: false, code: "forbidden" });
    const doc = await world.projects.getDocument(world.projectId);
    assert.equal(doc?.document, null);
  });

  it("refuses a deleted project", async () => {
    const world = createMemoryGatewayWorld();
    await deleteStudioProject(world, { userId: world.userId, projectId: world.projectId });
    assert.deepEqual(await importLocalProject(world, input(world)), {
      ok: false,
      code: "project_deleted",
    });
  });

  it("refuses an anonymous caller", async () => {
    const world = createMemoryGatewayWorld();
    assert.deepEqual(await importLocalProject(world, input(world, world.projectId, "")), {
      ok: false,
      code: "unauthorized",
    });
  });

  it("never overwrites a document the server already has", async () => {
    const world = createMemoryGatewayWorld();
    const first = await saveProjectDocument(world, {
      userId: world.userId,
      projectId: world.projectId,
      document: toDoc({ id: world.projectId, name: "服务端" }),
      expectedVersion: 0,
    });
    assert.equal(first.ok, true);
    const result = await importLocalProject(world, input(world));
    assert.deepEqual(result, { ok: true, value: { status: "already_synced", version: 1 } });
    const loaded = await loadProjectDocument(world, {
      userId: world.userId,
      projectId: world.projectId,
    });
    assert.equal(loaded.ok && loaded.value.document?.name, "服务端");
  });

  it("rejects a document filed under a different id", async () => {
    const world = createMemoryGatewayWorld();
    const result = await importLocalProject(world, {
      userId: world.userId,
      projectId: world.projectId,
      document: toDoc({ id: "other" }),
    });
    assert.deepEqual(result, { ok: false, code: "invalid_document" });
  });
});
