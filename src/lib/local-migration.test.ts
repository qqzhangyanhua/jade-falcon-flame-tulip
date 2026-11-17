import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryGatewayWorld } from "./image-jobs/memory.ts";
import { loadProjectDocument } from "./image-jobs/project-document.ts";
import { importLocalProject } from "./image-jobs/project-list.ts";
import { uploadWireframe } from "./image-jobs/upload.ts";
import { createStudioProject } from "./image-jobs/projects.ts";
import type { ImageJobErrorCode } from "./image-jobs/types.ts";
import { migrateLocalProjects, uploadLocalProject, type MigrationApi } from "./local-migration.ts";
import { sampleProject } from "./project/fixtures.ts";
import type { Project } from "./project/schema.ts";

const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64")}`;

function setup(opts: { failWireframe?: boolean } = {}) {
  const world = createMemoryGatewayWorld();
  const adopted: string[] = [];
  const uploads: string[] = [];
  const api: MigrationApi = {
    async load(projectId) {
      return loadProjectDocument(world, { userId: world.userId, projectId });
    },
    async ensureRow(projectId) {
      const r = await createStudioProject(world.catalog, world.projects, {
        userId: world.userId,
        id: projectId,
      });
      return r.ok ? { ok: true } : { ok: false, code: r.code };
    },
    async uploadWireframe(projectId, dataUrl) {
      uploads.push(projectId);
      if (opts.failWireframe) throw new Error("network");
      const r = await uploadWireframe(world, { userId: world.userId, projectId, dataUrl });
      if (!r.ok) throw new Error(r.code);
      return r.url;
    },
    async importProject(projectId, document) {
      return importLocalProject(world, { userId: world.userId, projectId, document });
    },
  };
  const host = {
    currentId: () => null as string | null,
    async adopt(id: string) {
      adopted.push(id);
    },
  };
  return { world, api, host, adopted, uploads };
}

function local(id: string, patch: Partial<Project> = {}): Project {
  return sampleProject({ id, ...patch });
}

async function serverDoc(world: ReturnType<typeof setup>["world"], id: string) {
  const r = await loadProjectDocument(world, { userId: world.userId, projectId: id });
  return r.ok ? r.value.document : undefined;
}

describe("migrateLocalProjects", () => {
  it("auto-uploads a local project whose id matches a server row without a document", async () => {
    const { world, api, host } = setup();
    const result = await migrateLocalProjects(api, { ...host, projects: () => [local(world.projectId)] });
    assert.deepEqual(result.pending, []);
    assert.equal((await serverDoc(world, world.projectId))?.name, "示例");
  });

  it("leaves the current project to the sync engine", async () => {
    const { world, api, host, adopted } = setup();
    const result = await migrateLocalProjects(api, {
      ...host,
      currentId: () => world.projectId,
      projects: () => [local(world.projectId)],
    });
    assert.deepEqual(result.pending, []);
    assert.deepEqual(adopted, [world.projectId]);
    assert.equal(await serverDoc(world, world.projectId), null);
  });

  it("does nothing for a project the server already has a document for", async () => {
    const { world, api, host, adopted, uploads } = setup();
    await importLocalProject(world, {
      userId: world.userId,
      projectId: world.projectId,
      document: { ...local(world.projectId, { name: "服务端" }), mode: undefined },
    });
    const result = await migrateLocalProjects(api, {
      ...host,
      projects: () => [local(world.projectId, { name: "本地", prototypeDataUrl: PNG })],
    });
    assert.deepEqual(result.pending, []);
    assert.deepEqual(adopted, []);
    assert.deepEqual(uploads, []);
    assert.equal((await serverDoc(world, world.projectId))?.name, "服务端");
  });

  it("uploads an inline wireframe first and stores the returned url in the document", async () => {
    const { world, api, host } = setup();
    await migrateLocalProjects(api, {
      ...host,
      projects: () => [local(world.projectId, { prototypeDataUrl: PNG })],
    });
    const doc = await serverDoc(world, world.projectId);
    assert.match(doc?.prototypeDataUrl ?? "", /^\/api\/images\//);
  });

  it("keeps a project local, and asks again, when its wireframe upload fails", async () => {
    const { world, api, host } = setup({ failWireframe: true });
    const projects = [local(world.projectId, { prototypeDataUrl: PNG })];
    const first = await migrateLocalProjects(api, { ...host, projects: () => projects });
    assert.deepEqual(first.pending, [
      { id: world.projectId, name: "示例", reason: "wireframe_failed" },
    ]);
    assert.equal(await serverDoc(world, world.projectId), null);
    const second = await migrateLocalProjects(api, { ...host, projects: () => projects });
    assert.equal(second.pending.length, 1);
    assert.equal(projects[0]?.prototypeDataUrl, PNG);
  });

  it("asks about a project with no server row instead of uploading or dropping it", async () => {
    const { world, api, host } = setup();
    const result = await migrateLocalProjects(api, { ...host, projects: () => [local("prj_old")] });
    assert.deepEqual(result.pending, [{ id: "prj_old", name: "示例", reason: "unmatched" }]);
    assert.equal(await world.projects.get("prj_old"), null);
  });

  it("does not offer upload for an id that belongs to someone else", async () => {
    const { world, api, host } = setup();
    await world.projects.create({
      id: "theirs",
      userId: "someone-else",
      currentImageModelId: "m",
      createdAt: 1,
      deletedAt: null,
    });
    const result = await migrateLocalProjects(api, { ...host, projects: () => [local("theirs")] });
    assert.deepEqual(result.pending, [{ id: "theirs", name: "示例", reason: "unavailable" }]);
  });

  it("skips quietly when the server cannot be reached, so the next load retries", async () => {
    const { api, host } = setup();
    const result = await migrateLocalProjects(
      { ...api, load: async () => Promise.reject(new Error("offline")) },
      { ...host, projects: () => [local("a")] },
    );
    assert.deepEqual(result.pending, []);
  });

  it("stops when signed out", async () => {
    const { api, host } = setup();
    const code: ImageJobErrorCode = "unauthorized";
    const result = await migrateLocalProjects(
      { ...api, load: async () => ({ ok: false, code }) },
      { ...host, projects: () => [local("a"), local("b")] },
    );
    assert.deepEqual(result.pending, []);
  });
});

describe("uploadLocalProject (user chose to upload)", () => {
  it("creates the project row, then uploads the document", async () => {
    const { world, api, host, adopted } = setup();
    const result = await uploadLocalProject(api, host, local("prj_old", { name: "老项目" }));
    assert.deepEqual(result, { ok: true });
    assert.equal((await world.projects.get("prj_old"))?.userId, world.userId);
    assert.equal((await serverDoc(world, "prj_old"))?.name, "老项目");
    assert.deepEqual(adopted, ["prj_old"]);
  });

  it("uploads an inline wireframe along the way", async () => {
    const { world, api, host } = setup();
    await uploadLocalProject(api, host, local("prj_old", { prototypeDataUrl: PNG }));
    assert.match((await serverDoc(world, "prj_old"))?.prototypeDataUrl ?? "", /^\/api\/images\//);
  });

  it("reports a failed wireframe upload and keeps the data", async () => {
    const { world, api, host, adopted } = setup({ failWireframe: true });
    const result = await uploadLocalProject(api, host, local(world.projectId, { prototypeDataUrl: PNG }));
    assert.deepEqual(result, { ok: false, reason: "wireframe_failed" });
    assert.equal(await serverDoc(world, world.projectId), null);
    assert.deepEqual(adopted, []);
  });

  it("fails without creating anything when the id is another user's", async () => {
    const { world, api, host } = setup();
    await world.projects.create({
      id: "theirs",
      userId: "someone-else",
      currentImageModelId: "m",
      createdAt: 1,
      deletedAt: null,
    });
    const result = await uploadLocalProject(api, host, local("theirs"));
    assert.deepEqual(result, { ok: false, reason: "unavailable" });
  });
});
