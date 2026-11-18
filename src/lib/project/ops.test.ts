import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addImageRevs,
  adoptImage,
  archiveStyle,
  forkStyle,
  lockCandidate,
  restoreStyle,
  setStyleRev,
  writebackStyle,
} from "./ops.ts";
import { currentDna } from "./schema.ts";
import { sampleCandidate, sampleDna, sampleProject, sampleStyle } from "./fixtures.ts";

function counter() {
  let n = 0;
  return { newId: (prefix: string) => `${prefix}_${++n}`, now: () => 1000 + n };
}

function style(project: ReturnType<typeof sampleProject>, id: string) {
  const found = project.styles.find((s) => s.id === id);
  assert.ok(found, `style ${id} exists`);
  return found;
}

describe("lockCandidate", () => {
  it("makes the chosen candidate the active line and two others standby", () => {
    const project = sampleProject({
      phase: "direction",
      currentStyleId: null,
      styles: [],
      candidates: [sampleCandidate("1"), sampleCandidate("2"), sampleCandidate("3"), sampleCandidate("4")],
    });
    const next = lockCandidate(project, "2", counter());
    assert.equal(next.phase, "studio");
    assert.equal(next.styles.length, 3);
    assert.equal(next.styles[0].status, "active");
    assert.equal(next.styles[0].name, "方向 2");
    assert.equal(next.currentStyleId, next.styles[0].id);
    assert.deepEqual(next.styles.slice(1).map((s) => s.status), ["standby", "standby"]);
    assert.equal(next.styles[0].revs[0].changeLog, "锁定");
  });

  it("ignores an unknown candidate", () => {
    const project = sampleProject({ candidates: [sampleCandidate("1")] });
    assert.equal(lockCandidate(project, "nope"), project);
  });

  it("locks a reference candidate the same way as any other direction", () => {
    const reference = sampleCandidate("ref", {
      presetId: "reference",
      dna: sampleDna({ name: "参考雾蓝" }),
    });
    const project = sampleProject({
      phase: "direction",
      currentStyleId: null,
      styles: [],
      candidates: [
        sampleCandidate("1"),
        sampleCandidate("2"),
        sampleCandidate("3"),
        sampleCandidate("4"),
        reference,
      ],
    });
    const next = lockCandidate(project, "ref", counter());
    assert.equal(next.phase, "studio");
    assert.equal(next.currentSlot, "kv");
    assert.equal(next.styles.length, 3);
    assert.equal(next.styles[0].status, "active");
    assert.equal(next.styles[0].name, "参考雾蓝");
    assert.equal(currentDna(next.styles[0]).name, "参考雾蓝");
    assert.deepEqual(
      next.styles.slice(1).map((style) => style.status),
      ["standby", "standby"],
    );
    assert.equal(next.styles[0].revs[0].changeLog, "锁定");
  });
});

describe("writebackStyle", () => {
  it("creates the next rev from the viewed rev and records the changes", () => {
    const project = sampleProject();
    const dna = sampleDna({ name: "风格 a", light: "侧逆光" });
    const next = writebackStyle(project, { styleId: "a", changeLog: "改光线", dna }, counter());
    const a = style(next, "a");
    assert.equal(a.currentRev, 2);
    assert.equal(a.revs.length, 2);
    assert.deepEqual(
      { rev: a.revs[1].rev, parentRev: a.revs[1].parentRev, changeLog: a.revs[1].changeLog },
      { rev: 2, parentRev: 1, changeLog: "改光线" },
    );
    assert.deepEqual(a.revs[1].changes, [{ field: "light", from: "柔和顶光", to: "侧逆光" }]);
    assert.equal(currentDna(a).light, "侧逆光");
  });

  it("does not repeat a rev number when writing back from an older rev", () => {
    let project = sampleProject();
    project = writebackStyle(project, { styleId: "a", changeLog: "v2", dna: sampleDna({ light: "x" }) });
    project = writebackStyle(project, { styleId: "a", changeLog: "v3", dna: sampleDna({ light: "y" }) });
    project = setStyleRev(project, "a", 1);
    project = writebackStyle(project, { styleId: "a", changeLog: "from v1", dna: sampleDna({ light: "z" }) });
    const a = style(project, "a");
    assert.deepEqual(a.revs.map((r) => r.rev), [1, 2, 3, 4]);
    assert.equal(a.revs[3].parentRev, 1);
    assert.equal(a.currentRev, 4);
  });

  it("prefers explicitly supplied changes", () => {
    const changes = [{ field: "mood", from: "a", to: "b" }];
    const next = writebackStyle(sampleProject(), { styleId: "a", changeLog: "c", dna: sampleDna(), changes });
    assert.deepEqual(style(next, "a").revs[1].changes, changes);
  });
});

describe("setStyleRev", () => {
  it("changes the viewed rev", () => {
    const project = writebackStyle(sampleProject(), { styleId: "a", changeLog: "c", dna: sampleDna({ light: "x" }) });
    assert.equal(style(setStyleRev(project, "a", 1), "a").currentRev, 1);
  });

  it("ignores a rev that does not exist", () => {
    const project = sampleProject();
    assert.equal(style(setStyleRev(project, "a", 9), "a").currentRev, 1);
  });
});

describe("archiveStyle and restoreStyle", () => {
  it("promotes the next live line when the current line is archived", () => {
    const result = archiveStyle(sampleProject(), "a");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(style(result.project, "a").status, "archived");
    assert.equal(result.project.currentStyleId, "b");
    assert.equal(style(result.project, "b").status, "active");
    assert.equal(style(result.project, "c").status, "standby");
  });

  it("keeps the current line when another line is archived", () => {
    const result = archiveStyle(sampleProject(), "c");
    assert.ok(result.ok);
    assert.equal(result.project.currentStyleId, "a");
    assert.equal(style(result.project, "c").status, "archived");
  });

  it("skips already archived lines when promoting", () => {
    const first = archiveStyle(sampleProject(), "b");
    assert.ok(first.ok);
    const second = archiveStyle(first.project, "a");
    assert.ok(second.ok);
    assert.equal(second.project.currentStyleId, "c");
  });

  it("refuses to archive the last live line", () => {
    const project = sampleProject({
      styles: [sampleStyle("a", { status: "active" }), sampleStyle("b", { status: "archived" })],
    });
    const result = archiveStyle(project, "a");
    assert.deepEqual(result, { ok: false, reason: "last_live_style" });
  });

  it("reports an unknown line", () => {
    assert.deepEqual(archiveStyle(sampleProject(), "zzz"), { ok: false, reason: "not_found" });
  });

  it("restores an archived line as standby without changing the current line", () => {
    const archived = archiveStyle(sampleProject(), "c");
    assert.ok(archived.ok);
    const restored = restoreStyle(archived.project, "c");
    assert.equal(style(restored, "c").status, "standby");
    assert.equal(restored.currentStyleId, "a");
  });
});

describe("forkStyle", () => {
  it("forks from the viewed rev into a new current line", () => {
    let project = sampleProject();
    project = writebackStyle(project, { styleId: "a", changeLog: "v2", dna: sampleDna({ name: "风格 a", light: "侧逆光" }) });
    project = writebackStyle(project, { styleId: "a", changeLog: "v3", dna: sampleDna({ name: "风格 a", light: "硬光" }) });
    project = setStyleRev(project, "a", 2);
    project = addImageRevs(project, {
      styleId: "a", slot: "kv", urls: ["/api/images/x"], action: "generate", diff: "d", parentId: null,
    }, counter()).project;

    const next = forkStyle(project, "a", counter());
    assert.equal(next.styles.length, 4);
    const forked = next.styles.find((s) => s.origin === "fork");
    assert.ok(forked);
    assert.equal(forked.name, "风格 a · 分叉");
    assert.equal(forked.origin, "fork");
    assert.equal(forked.status, "active");
    assert.equal(forked.currentRev, 1);
    assert.equal(forked.revs.length, 1);
    assert.equal(forked.revs[0].changeLog, "分叉自 风格 a rev2");
    assert.equal(forked.revs[0].parentRev, null);
    assert.equal(forked.revs[0].dna.light, "侧逆光");
    assert.equal(forked.candidateUrl, "/api/images/preview_a");
    assert.deepEqual(forked.assets.kv.revs, []);
    assert.equal(forked.assets.kv.adoptedId, null);
    assert.equal(next.currentStyleId, forked.id);
    assert.equal(style(next, "a").status, "standby");
    assert.equal(style(next, "a").revs.length, 3);
    assert.equal(style(next, "a").assets.kv.revs.length, 1);
  });

  it("leaves archived lines archived", () => {
    const archived = archiveStyle(sampleProject(), "c");
    assert.ok(archived.ok);
    const next = forkStyle(archived.project, "a");
    assert.equal(style(next, "c").status, "archived");
  });
});

describe("addImageRevs and adoptImage", () => {
  const input = {
    styleId: "a",
    slot: "kv" as const,
    action: "generate" as const,
    diff: "d",
    parentId: null,
  };

  it("records the viewed style rev and adopts the first new image when none is adopted", () => {
    const { project, ids } = addImageRevs(sampleProject(), { ...input, urls: ["/u/1", "/u/2"] }, counter());
    assert.equal(ids.length, 2);
    const kv = style(project, "a").assets.kv;
    assert.deepEqual(kv.revs.map((r) => r.url), ["/u/1", "/u/2"]);
    assert.equal(kv.adoptedId, ids[0]);
    assert.equal(kv.revs[0].styleRev, 1);
  });

  it("keeps every image rev past ten", () => {
    let project = sampleProject();
    for (let i = 0; i < 15; i += 1) {
      project = addImageRevs(project, { ...input, urls: [`/u/${i}`] }).project;
    }
    const kv = style(project, "a").assets.kv;
    assert.equal(kv.revs.length, 15);
    assert.equal(kv.revs[0].url, "/u/0");
  });

  it("does not move an existing adoption", () => {
    const first = addImageRevs(sampleProject(), { ...input, urls: ["/u/1"] });
    const second = addImageRevs(first.project, { ...input, urls: ["/u/2"] });
    assert.equal(style(second.project, "a").assets.kv.adoptedId, first.ids[0]);
  });

  it("adopts a chosen image", () => {
    const first = addImageRevs(sampleProject(), { ...input, urls: ["/u/1", "/u/2"] });
    const next = adoptImage(first.project, "a", "kv", first.ids[1]);
    assert.equal(style(next, "a").assets.kv.adoptedId, first.ids[1]);
  });

  it("ignores adopting an image the slot does not hold", () => {
    const project = sampleProject();
    assert.equal(style(adoptImage(project, "a", "kv", "ghost"), "a").assets.kv.adoptedId, null);
  });

  it("returns no ids for an unknown style", () => {
    const result = addImageRevs(sampleProject(), { ...input, styleId: "zzz", urls: ["/u/1"] });
    assert.deepEqual(result.ids, []);
  });
});
