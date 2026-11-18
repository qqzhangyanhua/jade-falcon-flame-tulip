import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createProjectSync,
  toDocument,
  type SyncApi,
  type SyncEvent,
  type SyncSnapshot,
} from "./project-sync.ts";
import { sampleProject } from "./project/fixtures.ts";
import type { Project } from "./project/schema.ts";

type SaveCall = { projectId: string; document: Record<string, unknown>; expectedVersion: number };

function harness(opts?: { versions?: Record<string, number> }) {
  const projects = new Map<string, Project>();
  const versionMap = new Map<string, number>(Object.entries(opts?.versions ?? {}));
  const saves: SaveCall[] = [];
  const events: SyncEvent[] = [];
  const dropped: string[] = [];
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  let server: SyncSnapshot = { document: null, version: 0, updatedAt: null };
  let saveResult: ((call: SaveCall) => ReturnType<SyncApi["save"]>) | null = null;
  let loadResult: (() => ReturnType<SyncApi["load"]>) | null = null;
  let loads = 0;

  const api: SyncApi = {
    async load() {
      loads += 1;
      return loadResult ? loadResult() : { ok: true, value: server };
    },
    async save(projectId, document, expectedVersion) {
      const call = { projectId, document: document as Record<string, unknown>, expectedVersion };
      saves.push(call);
      if (saveResult) return saveResult(call);
      if (expectedVersion !== server.version) {
        return { ok: false, code: "version_conflict", current: server };
      }
      server = { document, version: server.version + 1, updatedAt: 1 };
      return { ok: true, value: { version: server.version, updatedAt: 1 } };
    },
  };

  const sync = createProjectSync(api, {
    getProject: (id) => projects.get(id),
    applyServerDocument(document) {
      const existing = projects.get(document.id);
      projects.set(document.id, { ...document, mode: existing?.mode ?? "idle" });
    },
    dropProject(id) {
      projects.delete(id);
      dropped.push(id);
    },
    notify: (event) => events.push(event),
    versions: {
      get: (id) => versionMap.get(id),
      set: (id, version) => void versionMap.set(id, version),
      delete: (id) => void versionMap.delete(id),
    },
    schedule(fn, ms) {
      const timer = { fn, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    debounceMs: 1000,
  });

  return {
    sync,
    projects,
    versionMap,
    saves,
    events,
    dropped,
    get loads() {
      return loads;
    },
    setServer: (next: SyncSnapshot) => {
      server = next;
    },
    getServer: () => server,
    onSave: (fn: typeof saveResult) => {
      saveResult = fn;
    },
    onLoad: (fn: typeof loadResult) => {
      loadResult = fn;
    },
    /** Run every live timer, as if the debounce window elapsed. */
    fire() {
      const due = timers.splice(0).filter((t) => !t.cancelled);
      for (const timer of due) timer.fn();
    },
    async elapse() {
      this.fire();
      await sync.idle();
    },
    pendingTimers: () => timers.filter((t) => !t.cancelled).length,
  };
}

const serverDoc = (patch: Partial<Project> = {}) => toDocument(sampleProject({ id: "prj_1", ...patch }));

describe("toDocument", () => {
  it("drops UI state", () => {
    const doc = toDocument(sampleProject({ mode: "generating" }));
    assert.equal("mode" in doc, false);
  });

  it("does not send an inline data: wireframe", () => {
    const doc = toDocument(sampleProject({ prototypeDataUrl: "data:image/png;base64,AAAA" }));
    assert.equal(doc.prototypeDataUrl, null);
  });

  it("keeps a stored wireframe address", () => {
    const doc = toDocument(sampleProject({ prototypeDataUrl: "/api/images/img_1" }));
    assert.equal(doc.prototypeDataUrl, "/api/images/img_1");
  });

  it("keeps stored reference addresses and drops anything else", () => {
    const doc = toDocument(
      sampleProject({
        referenceImageUrls: [
          "/api/images/img_a",
          "data:image/png;base64,AAAA",
          "https://example.com/a.png",
          "/api/images/img_b",
        ],
      }),
    );
    assert.deepEqual(doc.referenceImageUrls, ["/api/images/img_a", "/api/images/img_b"]);
  });

  it("sends an empty reference list when an old project has none", () => {
    const legacy = sampleProject();
    delete (legacy as { referenceImageUrls?: string[] }).referenceImageUrls;
    assert.deepEqual(toDocument(legacy).referenceImageUrls, []);
  });
});

describe("project sync: saving", () => {
  it("saves the whole document, without mode, once the debounce elapses", async () => {
    const h = harness({ versions: { prj_1: 0 } });
    h.projects.set("prj_1", sampleProject({ mode: "generating" }));
    h.sync.touch("prj_1");
    assert.equal(h.saves.length, 0);
    await h.elapse();
    assert.equal(h.saves.length, 1);
    assert.equal(h.saves[0]?.expectedVersion, 0);
    assert.equal("mode" in (h.saves[0]?.document ?? {}), false);
    assert.equal(h.saves[0]?.document.name, "示例");
    assert.equal(h.versionMap.get("prj_1"), 1);
  });

  it("holds back a project whose wireframe is still an inline data: URL", async () => {
    const h = harness({ versions: { prj_1: 0 } });
    h.projects.set("prj_1", sampleProject({ prototypeDataUrl: "data:image/png;base64,AAAA" }));
    h.sync.touch("prj_1");
    await h.elapse();
    assert.equal(h.saves.length, 0);
  });

  it("coalesces a burst of edits into one save", async () => {
    const h = harness({ versions: { prj_1: 0 } });
    h.projects.set("prj_1", sampleProject());
    h.sync.touch("prj_1");
    h.sync.touch("prj_1");
    h.sync.touch("prj_1");
    assert.equal(h.pendingTimers(), 1);
    await h.elapse();
    assert.equal(h.saves.length, 1);
  });

  it("does not save when only UI state changed", async () => {
    const h = harness({ versions: { prj_1: 0 } });
    h.projects.set("prj_1", sampleProject());
    h.sync.touch("prj_1");
    await h.elapse();
    h.projects.set("prj_1", sampleProject({ mode: "generating" }));
    h.sync.touch("prj_1");
    await h.elapse();
    assert.equal(h.saves.length, 1);
  });

  it("sends the version returned by the previous save", async () => {
    const h = harness({ versions: { prj_1: 0 } });
    h.projects.set("prj_1", sampleProject());
    h.sync.touch("prj_1");
    await h.elapse();
    h.projects.set("prj_1", sampleProject({ name: "改名" }));
    h.sync.touch("prj_1");
    await h.elapse();
    assert.deepEqual(
      h.saves.map((s) => s.expectedVersion),
      [0, 1],
    );
  });

  it("saves an edit made while a save was in flight", async () => {
    const h = harness({ versions: { prj_1: 0 } });
    h.projects.set("prj_1", sampleProject());
    let release: () => void = () => {};
    h.onSave(
      (call) =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, value: { version: call.expectedVersion + 1, updatedAt: 1 } });
        }),
    );
    h.sync.touch("prj_1");
    h.fire();
    await new Promise((resolve) => setImmediate(resolve));
    h.projects.set("prj_1", sampleProject({ name: "第二次" }));
    h.sync.touch("prj_1");
    release();
    await h.sync.idle();
    h.onSave(null);
    h.setServer({ document: null, version: 1, updatedAt: 1 });
    await h.elapse();
    assert.deepEqual(
      h.saves.map((s) => [s.expectedVersion, s.document.name]),
      [
        [0, "示例"],
        [1, "第二次"],
      ],
    );
  });

  it("learns the server version before the first save of a project it has not seen", async () => {
    const h = harness();
    h.projects.set("prj_1", sampleProject());
    h.setServer({ document: null, version: 0, updatedAt: null });
    h.sync.touch("prj_1");
    await h.elapse();
    assert.equal(h.loads, 1);
    assert.equal(h.saves[0]?.expectedVersion, 0);
  });

  it("takes the server copy instead of overwriting it when the version is unknown", async () => {
    const h = harness();
    h.projects.set("prj_1", sampleProject({ name: "本地" }));
    h.setServer({ document: serverDoc({ name: "服务端" }), version: 3, updatedAt: 1 });
    h.sync.touch("prj_1");
    await h.elapse();
    assert.equal(h.saves.length, 0);
    assert.equal(h.projects.get("prj_1")?.name, "服务端");
    assert.equal(h.versionMap.get("prj_1"), 3);
  });
});

describe("project sync: conflicts", () => {
  it("reloads from the server copy and tells the user", async () => {
    const h = harness({ versions: { prj_1: 0 } });
    h.projects.set("prj_1", sampleProject({ name: "设备 B", mode: "editing" }));
    h.setServer({ document: serverDoc({ name: "设备 A" }), version: 2, updatedAt: 1 });
    h.sync.touch("prj_1");
    await h.elapse();
    assert.equal(h.projects.get("prj_1")?.name, "设备 A");
    assert.equal(h.projects.get("prj_1")?.mode, "editing");
    assert.equal(h.versionMap.get("prj_1"), 2);
    assert.deepEqual(h.events, [{ type: "conflict", projectId: "prj_1" }]);
  });

  it("does not echo the reloaded server copy back as a save", async () => {
    const h = harness({ versions: { prj_1: 0 } });
    h.projects.set("prj_1", sampleProject({ name: "设备 B" }));
    h.setServer({ document: serverDoc({ name: "设备 A" }), version: 2, updatedAt: 1 });
    h.sync.touch("prj_1");
    await h.elapse();
    h.sync.touch("prj_1");
    await h.elapse();
    assert.equal(h.saves.length, 1);
  });
});

describe("project sync: deleted projects", () => {
  it("drops the local cache when the server says the project is deleted", async () => {
    const h = harness({ versions: { prj_1: 1 } });
    h.projects.set("prj_1", sampleProject());
    h.onSave(async () => ({ ok: false, code: "project_deleted" }));
    h.sync.touch("prj_1");
    await h.elapse();
    assert.deepEqual(h.dropped, ["prj_1"]);
    assert.equal(h.projects.has("prj_1"), false);
    assert.equal(h.versionMap.has("prj_1"), false);
    assert.deepEqual(h.events, [{ type: "deleted", projectId: "prj_1" }]);
  });
});

describe("project sync: other failures", () => {
  it("reports a document the server refuses, without dropping anything", async () => {
    const h = harness({ versions: { prj_1: 1 } });
    h.projects.set("prj_1", sampleProject());
    h.onSave(async () => ({ ok: false, code: "document_too_large" }));
    h.sync.touch("prj_1");
    await h.elapse();
    assert.deepEqual(h.events, [{ type: "rejected", projectId: "prj_1", code: "document_too_large" }]);
    assert.equal(h.projects.has("prj_1"), true);
  });

  it("stays quiet when the user is signed out and retries on the next edit", async () => {
    const h = harness({ versions: { prj_1: 0 } });
    h.projects.set("prj_1", sampleProject());
    h.onSave(async () => ({ ok: false, code: "unauthorized" }));
    h.sync.touch("prj_1");
    await h.elapse();
    assert.deepEqual(h.events, []);
    h.onSave(null);
    h.sync.touch("prj_1");
    await h.elapse();
    assert.equal(h.saves.length, 2);
    assert.equal(h.versionMap.get("prj_1"), 1);
  });

  it("survives a network failure and retries on the next edit", async () => {
    const h = harness({ versions: { prj_1: 0 } });
    h.projects.set("prj_1", sampleProject());
    h.onSave(async () => {
      throw new Error("offline");
    });
    h.sync.touch("prj_1");
    await h.elapse();
    h.onSave(null);
    h.sync.touch("prj_1");
    await h.elapse();
    assert.equal(h.versionMap.get("prj_1"), 1);
  });
});

describe("project sync: opening a project", () => {
  it("reads the document from the server and replaces the local copy", async () => {
    const h = harness({ versions: { prj_1: 1 } });
    h.projects.set("prj_1", sampleProject({ name: "旧缓存" }));
    h.setServer({ document: serverDoc({ name: "服务端" }), version: 4, updatedAt: 9 });
    const result = await h.sync.open("prj_1");
    assert.equal(result.ok, true);
    assert.equal(h.projects.get("prj_1")?.name, "服务端");
    assert.equal(h.versionMap.get("prj_1"), 4);
    assert.deepEqual(h.events, []);
  });

  it("keeps pending local edits when the server version is the one it already has", async () => {
    const h = harness({ versions: { prj_1: 4 } });
    h.projects.set("prj_1", sampleProject({ name: "本地新改" }));
    h.setServer({ document: serverDoc({ name: "服务端" }), version: 4, updatedAt: 9 });
    await h.sync.open("prj_1");
    assert.equal(h.projects.get("prj_1")?.name, "本地新改");
  });

  it("does not re-save an unchanged project after a reload", async () => {
    const h = harness({ versions: { prj_1: 4 } });
    h.projects.set("prj_1", sampleProject({ mode: "generating" }));
    h.setServer({ document: serverDoc(), version: 4, updatedAt: 9 });
    await h.sync.open("prj_1");
    h.sync.touch("prj_1");
    await h.elapse();
    assert.equal(h.saves.length, 0);
  });

  it("uploads a local project that the server has a row for but no document yet", async () => {
    const h = harness();
    h.projects.set("prj_1", sampleProject());
    await h.sync.open("prj_1");
    await h.elapse();
    assert.equal(h.saves.length, 1);
    assert.equal(h.saves[0]?.expectedVersion, 0);
  });

  it("adds a server project that is not cached locally", async () => {
    const h = harness();
    h.setServer({ document: serverDoc({ name: "别的设备" }), version: 2, updatedAt: 9 });
    await h.sync.open("prj_1");
    assert.equal(h.projects.get("prj_1")?.name, "别的设备");
    assert.equal(h.projects.get("prj_1")?.mode, "idle");
  });

  it("drops the local cache when the project was deleted elsewhere", async () => {
    const h = harness({ versions: { prj_1: 1 } });
    h.projects.set("prj_1", sampleProject());
    h.onLoad(async () => ({ ok: false, code: "project_deleted" }));
    const result = await h.sync.open("prj_1");
    assert.deepEqual(result, { ok: false, code: "project_deleted" });
    assert.equal(h.projects.has("prj_1"), false);
    assert.deepEqual(h.events, [{ type: "deleted", projectId: "prj_1" }]);
  });

  it("leaves the local copy alone when the server cannot be reached for this user", async () => {
    const h = harness();
    h.projects.set("prj_1", sampleProject());
    h.onLoad(async () => ({ ok: false, code: "unauthorized" }));
    const result = await h.sync.open("prj_1");
    assert.equal(result.ok, false);
    assert.equal(h.projects.has("prj_1"), true);
    assert.deepEqual(h.events, []);
  });
});
